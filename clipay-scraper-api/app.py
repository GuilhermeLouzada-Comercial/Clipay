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
print("--- VERSÃO 10.1: CORREÇÃO DA VARIÁVEL DE AMBIENTE ---")
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
VIDEO_VALIDITY_DAYS = 7

# --- CORREÇÃO AQUI ---
# Tentamos pegar da variável de ambiente 'PROXY_URL'. 
# Se não achar, usamos None.
PROXY_URL = os.environ.get('PROXY_URL')

# Se por acaso a variável estiver vazia, você pode descomentar a linha abaixo para TESTE FORÇADO:
PROXY_URL = "http://smart-cy39cvakxmr0:pO71SSkduTPYh9nq@proxy.smartproxy.net:3120"

if PROXY_URL:
    print(f"✅ PROXY CARREGADO: {PROXY_URL[:15]}... (Ocultado)")
else:
    print("❌ AVISO CRÍTICO: PROXY NÃO ENCONTRADO! RODANDO NO IP DO RENDER.")

USER_AGENTS = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 239.1.0.26.109'
]

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

# --- SCRAPER FALLBACK (YT-DLP) ---
def scrape_insta_fallback(url):
    print(f"   -> [FALLBACK] Consultando yt-dlp...")
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'dump_single_json': True,
        'skip_download': True,
        'user_agent': random.choice(USER_AGENTS)
    }
    
    if PROXY_URL:
        ydl_opts['proxy'] = PROXY_URL
        print("   -> [PROXY] Injetado no yt-dlp")

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            views = info.get('view_count', 0)
            title = info.get('description', '') or info.get('title', '')
            print(f"   -> [FALLBACK] yt-dlp achou: {views}")
            return {'views': views, 'title': title, 'uploader': info.get('uploader', '')}
    except Exception as e:
        print(f"   -> [FALLBACK] Erro: {str(e)}")
        return None

# --- SCRAPER PRINCIPAL (INSTALOADER) ---
def scrape_instagram(url):
    print(f"--> [INSTA] Tentando: {url}")
    
    time.sleep(random.uniform(1, 3))
    
    instaloader_result = None
    try:
        L = instaloader.Instaloader()
        L.context._session.headers.update({'User-Agent': random.choice(USER_AGENTS)})

        if PROXY_URL:
            L.context._session.proxies = {
                'http': PROXY_URL,
                'https': PROXY_URL
            }
            # Teste extra para garantir que o instaloader pegou o proxy
            print("   -> [PROXY] Configurado no Instaloader.")

        shortcode = extract_shortcode(url)
        if shortcode:
            post = instaloader.Post.from_shortcode(L.context, shortcode)
            instaloader_result = {
                'views': post.video_view_count,
                'title': post.caption or "",
                'uploader': post.owner_username
            }
            print(f"   -> [INSTALOADER] Achou: {instaloader_result['views']}")
    except Exception as e:
        error_msg = str(e)
        print(f"   -> [INSTALOADER] Erro: {error_msg}")

    ytdlp_result = scrape_insta_fallback(url)

    final_views = 0
    final_title = ""
    final_uploader = ""

    if instaloader_result:
        final_views = instaloader_result['views']
        final_title = instaloader_result['title']
        final_uploader = instaloader_result['uploader']

    if ytdlp_result and ytdlp_result['views'] > final_views:
        print(f"   -> [DECISÃO] yt-dlp venceu ({ytdlp_result['views']} > {final_views})")
        final_views = ytdlp_result['views']
        if not final_title: final_title = ytdlp_result['title']
        if not final_uploader: final_uploader = ytdlp_result['uploader']
    
    if not instaloader_result and not ytdlp_result:
        return {'success': False, 'error': 'Ambos scrapers falharam'}

    return {
        'success': True,
        'views': final_views,
        'title': final_title,
        'description': final_title,
        'uploader': final_uploader,
        'platform': 'instagram'
    }

def scrape_generic(url):
    print(f"--> [GENERIC] Tentando: {url}")
    ydl_opts = {
        'quiet': True, 'no_warnings': True, 'dump_single_json': True, 
        'skip_download': True, 'user_agent': random.choice(USER_AGENTS)
    }
    
    if PROXY_URL:
        ydl_opts['proxy'] = PROXY_URL

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

    BATCH_SIZE = 3 
    processed = []
    
    try:
        videos_ref = db.collection('videos')
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=VIDEO_VALIDITY_DAYS)

        query = videos_ref.where(filter=FieldFilter('status', 'in', ['pending', 'approved', 'check_rules']))\
                          .where(filter=FieldFilter('createdAt', '>=', cutoff_date))\
                          .order_by('createdAt', direction=firestore.Query.ASCENDING)\
                          .limit(BATCH_SIZE)
        
        docs = query.stream()
        docs_list = list(docs)

        if not docs_list:
            return jsonify({'status': 'no_active_videos_to_update'})

        print(f"=== Iniciando Lote de {len(docs_list)} vídeos ===")

        for doc in docs_list:
            data = doc.to_dict()
            vid_id = doc.id
            url = data.get('url')
            current_views = data.get('views', 0)
            
            result = get_video_info(url)

            if not result['success'] and result.get('error') == 'RATE_LIMIT':
                print("!!! RATE LIMIT (PROXY FALHOU OU ESGOTOU) !!!")
                break 

            if result['success']:
                scraped_views = result['views']
                if scraped_views is None:
                    new_views = current_views
                else:
                    if int(scraped_views) > current_views:
                        new_views = int(scraped_views)
                    else:
                        new_views = current_views

                validation_errors = validate_content(
                    result.get('title'), result.get('description'), 
                    data.get('requiredHashtag', ''), data.get('requiredMention', '')
                )
                new_status = 'approved' if len(validation_errors) == 0 else 'rejected'
                
                # Stats
                views_gained = new_views - current_views
                if views_gained > 0:
                    today_str = datetime.now().strftime('%Y-%m-%d')
                    stats_id = f"{today_str}_{vid_id}"
                    
                    db.collection('daily_stats').document(stats_id).set({
                        'date': today_str,
                        'videoId': vid_id,
                        'campaignId': data.get('campaignId'),
                        'userId': data.get('userId'),
                        'platform': data.get('platform', 'unknown'),
                        'dailyViews': firestore.Increment(views_gained),
                        'totalViewsSnapshot': new_views,
                        'lastUpdated': firestore.SERVER_TIMESTAMP
                    }, merge=True)

                videos_ref.document(vid_id).update({
                    'views': new_views,
                    'status': new_status,
                    'validationErrors': validation_errors,
                    'lastUpdated': firestore.SERVER_TIMESTAMP
                })
                processed.append({'id': vid_id, 'views': new_views, 'gained': views_gained})
            
            time.sleep(random.uniform(2, 5))

        return jsonify({'processed': processed})

    except Exception as e:
        print(f"ERRO GERAL: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/', methods=['GET'])
def health_check():
    proxy_status = "ATIVO" if PROXY_URL else "INATIVO"
    return f"Clipay Scraper V10.1 (Proxy: {proxy_status})"

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)