import os
import time
import json
import re
import random
from datetime import datetime, timedelta, timezone
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
print("--- VERSÃO 8.0: OTIMIZADO (QUERY DATA + DAILY STATS) ---")
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

# --- CONSTANTES ---
VIDEO_VALIDITY_DAYS = 7  # Vídeos com mais de 7 dias param de atualizar

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
    match = re.search(r'/(?:reel|p)/([^/?#&]+)', url)
    return match.group(1) if match else None

# --- SCRAPERS ---
def scrape_instagram(url):
    print(f"--> [INSTA] Tentando: {url}")
    try:
        time.sleep(random.uniform(1, 3))
        
        L = instaloader.Instaloader()
        # User Agent genérico móvel para evitar bloqueio rápido
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
        # Detecta Rate Limit para parar o batch
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

# --- ROTA PRINCIPAL: ATUALIZA VÍDEOS VÁLIDOS ---
@app.route('/cron/update-batch', methods=['GET'])
def update_batch():
    if not cred: return jsonify({'error': 'Firebase not connected'}), 500

    BATCH_SIZE = 3 
    processed = []
    
    try:
        # Pausa inicial aleatória
        time.sleep(random.uniform(0, 5))

        videos_ref = db.collection('videos')
        
        # 1. DATA DE CORTE: Hoje - 7 dias
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=VIDEO_VALIDITY_DAYS)

        # 2. QUERY OTIMIZADA:
        # Pega apenas vídeos criados APÓS a data de corte (vídeos válidos)
        # IMPORTANTE: Requer índice composto no Firebase (Status + CreatedAt)
        query = videos_ref.where(filter=FieldFilter('status', 'in', ['pending', 'approved', 'check_rules']))\
                          .where(filter=FieldFilter('createdAt', '>=', cutoff_date))\
                          .order_by('createdAt', direction=firestore.Query.ASCENDING)\
                          .limit(BATCH_SIZE)
        
        docs = query.stream()
        docs_list = list(docs)

        if not docs_list:
            return jsonify({'status': 'no_active_videos_to_update'})

        print(f"=== Iniciando Lote de {len(docs_list)} vídeos VÁLIDOS ===")

        for doc in docs_list:
            data = doc.to_dict()
            vid_id = doc.id
            url = data.get('url')
            current_views = data.get('views', 0)
            
            # --- EXECUTA SCRAPER ---
            result = get_video_info(url)

            # Para tudo se o Instagram bloquear
            if not result['success'] and result.get('error') == 'RATE_LIMIT':
                print("!!! RATE LIMIT DETECTADO - PARANDO O LOTE !!!")
                break 

            if result['success']:
                new_views = int(result['views']) if result['views'] is not None else current_views
                
                # Validação de regras
                validation_errors = validate_content(
                    result.get('title'), result.get('description'), 
                    data.get('requiredHashtag', ''), data.get('requiredMention', '')
                )
                new_status = 'approved' if len(validation_errors) == 0 else 'rejected'
                
                # --- LÓGICA DE HISTÓRICO DIÁRIO ---
                views_gained = new_views - current_views
                
                # Apenas grava se houve ganho de views
                if views_gained > 0:
                    today_str = datetime.now().strftime('%Y-%m-%d')
                    stats_id = f"{today_str}_{vid_id}"
                    
                    stats_ref = db.collection('daily_stats').document(stats_id)
                    
                    # Usa set com merge + Increment para ser atômico e seguro
                    stats_ref.set({
                        'date': today_str,
                        'videoId': vid_id,
                        'campaignId': data.get('campaignId'),
                        'userId': data.get('userId'),
                        'platform': data.get('platform', 'unknown'),
                        'dailyViews': firestore.Increment(views_gained),
                        'totalViewsSnapshot': new_views,
                        'lastUpdated': firestore.SERVER_TIMESTAMP
                    }, merge=True)
                    
                    print(f"   + {views_gained} views registradas hoje no histórico.")

                # --- ATUALIZA DOCUMENTO PRINCIPAL ---
                videos_ref.document(vid_id).update({
                    'views': new_views,
                    'status': new_status,
                    'validationErrors': validation_errors,
                    'lastUpdated': firestore.SERVER_TIMESTAMP
                })
                processed.append({'id': vid_id, 'views': new_views, 'gained': views_gained})
            
            # Pausa humana entre vídeos
            sleep_time = random.uniform(5, 15)
            print(f"zzz Dormindo {sleep_time:.1f}s zzz")
            time.sleep(sleep_time)

        return jsonify({'processed': processed})

    except Exception as e:
        print(f"ERRO GERAL: {str(e)}")
        # Se for erro de índice, o link aparecerá no log do provedor (Heroku/Render/etc)
        return jsonify({'error': str(e)}), 500

# --- ROTA SECUNDÁRIA: LIMPEZA (GARBAGE COLLECTOR) ---
# Rode isso 1x ou 4x por dia num cron separado para finalizar vídeos velhos
@app.route('/cron/cleanup-expired', methods=['GET'])
def cleanup_expired():
    if not cred: return jsonify({'error': 'Firebase not connected'}), 500
    
    try:
        videos_ref = db.collection('videos')
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=VIDEO_VALIDITY_DAYS)

        # Busca vídeos ANTIGOS (createdAt < 7 dias atrás)
        # Limitamos a 50 por vez para não estourar tempo de execução
        query = videos_ref.where(filter=FieldFilter('createdAt', '<', cutoff_date))\
                          .limit(50)
        
        docs = query.stream()
        count = 0
        batch = db.batch()
        
        for doc in docs:
            data = doc.to_dict()
            # Se ainda não estiver finalizado ou rejeitado, finaliza agora
            if data.get('status') not in ['finished', 'rejected']:
                batch.update(doc.reference, {
                    'status': 'finished',
                    'lastUpdated': firestore.SERVER_TIMESTAMP
                })
                count += 1
        
        if count > 0:
            batch.commit()
            
        print(f"Limpeza concluída: {count} vídeos finalizados.")
        return jsonify({'cleaned_videos': count})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/', methods=['GET'])
def health_check():
    return "Clipay Scraper V8 Running"

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)