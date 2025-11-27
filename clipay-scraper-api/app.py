import os
import time
import json
import re
import random # <--- IMPORTANTE
from flask import Flask, jsonify, request
from flask_cors import CORS
import yt_dlp
import instaloader
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter

app = Flask(__name__)
CORS(app)

print("--------------------------------------------------")
print("--- VERSÃO 6.0: MODO PREGUIÇA (ANTI-BLOQUEIO) ---")
print("--------------------------------------------------")

# --- CONFIGURAÇÃO FIREBASE ---
if os.environ.get('FIREBASE_CREDENTIALS'):
    cred_dict = json.loads(os.environ.get('FIREBASE_CREDENTIALS'))
    cred = credentials.Certificate(cred_dict)
else:
    if os.path.exists("serviceAccountKey.json"):
        cred = credentials.Certificate("serviceAccountKey.json")
    else:
        cred = None

if cred:
    firebase_admin.initialize_app(cred)
    db = firestore.client()

# --- VALIDAR ---
def validate_content(title, description, req_hashtag, req_mention):
    full_text = f"{title or ''} {description or ''}".lower()
    errors = []
    if req_hashtag:
        clean_tag = req_hashtag.replace('#', '').lower()
        if f"#{clean_tag}" not in full_text:
            errors.append(f"Faltou a hashtag #{clean_tag}")
    if req_mention:
        clean_mention = req_mention.replace('@', '').lower()
        if clean_mention not in full_text:
            errors.append(f"Faltou marcar o criador @{clean_mention}")
    return errors

def extract_shortcode(url):
    match = re.search(r'/(?:reel|p)/([^/?#&]+)', url)
    return match.group(1) if match else None

# --- SCRAPERS ---
def scrape_instagram(url):
    print(f"--> [INSTA] Tentando: {url}")
    try:
        # Pausa dramática aleatória antes de conectar (fingir ser humano lendo)
        time.sleep(random.uniform(1, 3))
        
        L = instaloader.Instaloader()
        # Tenta mascarar um pouco o User Agent
        L.context._session.headers.update({'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 239.1.0.26.109'})

        shortcode = extract_shortcode(url)
        if not shortcode: return {'success': False, 'error': 'URL inválida'}
        
        post = instaloader.Post.from_shortcode(L.context, shortcode)
        
        print(f"--> [INSTA] SUCESSO! Views: {post.video_view_count}")
        
        return {
            'success': True,
            'views': post.video_view_count,
            'title': post.caption or "",
            'description': post.caption or "",
            'uploader': post.owner_username,
            'platform': 'instagram'
        }
    except Exception as e:
        error_msg = str(e)
        print(f"--> [INSTA] ERRO: {error_msg}")
        
        # Se for erro de bloqueio (401 ou 429), retorna erro especial
        if "401" in error_msg or "429" in error_msg:
            return {'success': False, 'error': 'RATE_LIMIT', 'details': error_msg}
            
        return {'success': False, 'error': error_msg}

def scrape_generic(url):
    print(f"--> [GENERIC] Tentando: {url}")
    ydl_opts = {'quiet': True, 'no_warnings': True, 'dump_single_json': True, 'skip_download': True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                'success': True,
                'views': info.get('view_count', 0),
                'title': info.get('title', ''),
                'description': info.get('description', ''),
                'uploader': info.get('uploader', ''),
                'platform': 'other'
            }
    except Exception as e:
        return {'success': False, 'error': str(e)}

def get_video_info(url):
    if "instagram.com" in url: return scrape_instagram(url)
    else: return scrape_generic(url)

# --- ROTA BATCH ---
@app.route('/cron/update-batch', methods=['GET'])
def update_batch():
    if not cred: return jsonify({'error': 'Firebase not connected'}), 500

    # Reduzi para 3 vídeos por vez para diminuir a chance de bloqueio no lote
    BATCH_SIZE = 3 
    processed = []
    
    try:
        # Pausa inicial aleatória para o Cron não bater sempre no segundo exato 00
        time.sleep(random.uniform(0, 5))

        videos_ref = db.collection('videos')
        query = videos_ref.where(filter=FieldFilter('status', 'in', ['pending', 'approved', 'check_rules']))\
                          .order_by('lastUpdated', direction=firestore.Query.ASCENDING)\
                          .limit(BATCH_SIZE)
        
        docs = query.stream()
        docs_list = list(docs) # Converte para lista para saber quantos tem

        if not docs_list:
            return jsonify({'status': 'no_docs_to_update'})

        print(f"=== Iniciando Lote de {len(docs_list)} vídeos ===")

        for doc in docs_list:
            data = doc.to_dict()
            vid_id = doc.id
            url = data.get('url')
            current_views = data.get('views', 0)
            
            # Chama o scraper
            result = get_video_info(url)

            # Se deu erro de RATE LIMIT, para o lote inteiro imediatamente
            if not result['success'] and result.get('error') == 'RATE_LIMIT':
                print("!!! RATE LIMIT DETECTADO - PARANDO O LOTE !!!")
                break 

            if result['success']:
                new_views = result['views']
                if new_views is None: new_views = current_views
                
                validation_errors = validate_content(
                    result.get('title'), result.get('description'), 
                    data.get('requiredHashtag', ''), data.get('requiredMention', '')
                )
                
                new_status = 'approved' if len(validation_errors) == 0 else 'rejected'
                
                videos_ref.document(vid_id).update({
                    'views': new_views,
                    'status': new_status,
                    'validationErrors': validation_errors,
                    'lastUpdated': firestore.SERVER_TIMESTAMP
                })
                processed.append({'id': vid_id, 'views': new_views})
            
            # PAUSA GRANDE E ALEATÓRIA ENTRE VÍDEOS (5 a 15 segundos)
            # Isso é vital para não parecer bot
            sleep_time = random.uniform(5, 15)
            print(f"zzz Dormindo {sleep_time:.1f}s zzz")
            time.sleep(sleep_time)

        return jsonify({'processed': processed})

    except Exception as e:
        print(f"ERRO GERAL: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/', methods=['GET'])
def health_check():
    return "Clipay Scraper V6 Running"

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)