import os
import time
import json
import re
from flask import Flask, jsonify, request
from flask_cors import CORS
import yt_dlp
import instaloader # NOVA BIBLIOTECA
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter

app = Flask(__name__)
CORS(app)

print("--------------------------------------------------")
print("--- VERSÃO 5.0: HÍBRIDA (INSTALOADER + YT-DLP) ---")
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

# --- FUNÇÕES AUXILIARES ---
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
    # Pega o código do vídeo do Instagram (ex: /reel/XyZ123/ -> XyZ123)
    match = re.search(r'/(?:reel|p)/([^/?#&]+)', url)
    return match.group(1) if match else None

# --- SCRAPER ESPECIALISTA: INSTAGRAM ---
def scrape_instagram(url):
    print(f"--> Usando INSTALOADER para: {url}")
    try:
        # Cria instância do Instaloader
        L = instaloader.Instaloader()
        
        # Extrai o código curto da URL
        shortcode = extract_shortcode(url)
        if not shortcode:
            return {'success': False, 'error': 'Não foi possível achar o código do vídeo na URL'}
        
        # Baixa os metadados
        post = instaloader.Post.from_shortcode(L.context, shortcode)
        
        views = post.video_view_count
        likes = post.likes
        caption = post.caption or ""
        owner = post.owner_username
        
        print(f"--> INSTALOADER SUCESSO! Views: {views} | Likes: {likes}")
        
        return {
            'success': True,
            'views': views,
            'title': caption, # Instagram não tem título, usamos a legenda
            'description': caption,
            'uploader': owner,
            'platform': 'instagram'
        }
    except Exception as e:
        print(f"--> INSTALOADER FALHOU: {str(e)}")
        # Se falhar, tentamos cair para o yt-dlp como última esperança?
        # Não, geralmente se um falha o outro falha também por IP.
        return {'success': False, 'error': str(e)}

# --- SCRAPER GENÉRICO: TIKTOK / YOUTUBE ---
def scrape_generic(url):
    print(f"--> Usando YT-DLP para: {url}")
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'dump_single_json': True,
        'skip_download': True,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            views = info.get('view_count', 0)
            print(f"--> YT-DLP SUCESSO! Views: {views}")
            return {
                'success': True,
                'views': views,
                'title': info.get('title', ''),
                'description': info.get('description', ''),
                'uploader': info.get('uploader', ''),
                'platform': 'other'
            }
    except Exception as e:
        print(f"--> YT-DLP FALHOU: {str(e)}")
        return {'success': False, 'error': str(e)}

# --- CONTROLADOR PRINCIPAL ---
def get_video_info(url):
    if "instagram.com" in url:
        return scrape_instagram(url)
    else:
        return scrape_generic(url)

# --- ROTA BATCH ---
@app.route('/cron/update-batch', methods=['GET'])
def update_batch():
    if not cred: return jsonify({'error': 'Firebase not connected'}), 500

    BATCH_SIZE = 5
    processed = []
    
    try:
        videos_ref = db.collection('videos')
        query = videos_ref.where(filter=FieldFilter('status', 'in', ['pending', 'approved', 'check_rules']))\
                          .order_by('lastUpdated', direction=firestore.Query.ASCENDING)\
                          .limit(BATCH_SIZE)
        
        docs = query.stream()

        for doc in docs:
            data = doc.to_dict()
            vid_id = doc.id
            url = data.get('url')
            current_views = data.get('views', 0)
            
            req_hashtag = data.get('requiredHashtag', '')
            req_mention = data.get('requiredMention', '')

            print(f"=== Processando ID: {vid_id} ===")
            
            # Chama a função inteligente que decide qual scraper usar
            result = get_video_info(url)

            if result['success']:
                new_views = result['views']

                if new_views is None:
                    print(f"AVISO: Views vieram None. Mantendo: {current_views}")
                    final_views = current_views
                else:
                    final_views = new_views

                # Valida conteúdo
                validation_errors = validate_content(
                    result.get('title'), 
                    result.get('description'), 
                    req_hashtag, 
                    req_mention
                )
                
                new_status = 'approved'
                if len(validation_errors) > 0:
                    new_status = 'rejected'
                
                videos_ref.document(vid_id).update({
                    'views': final_views,
                    'status': new_status,
                    'validationErrors': validation_errors,
                    'lastUpdated': firestore.SERVER_TIMESTAMP
                })
                
                processed.append({'id': vid_id, 'status': new_status, 'views': final_views})
            else:
                print(f"Falha ao ler ID {vid_id}")

            time.sleep(5) # Pausa maior para evitar bloqueio do Instagram

        return jsonify({'processed': processed})

    except Exception as e:
        print(f"ERRO GERAL: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/', methods=['GET'])
def health_check():
    return "Clipay Scraper V5 (Hybrid)"

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)