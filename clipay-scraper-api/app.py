import os
import time
import json
import re
import random
import requests # <--- IMPORTANTE
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
print("--- VERSÃO 11.0: THE HUNTER (RAW HTML + REGEX) ---")
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
PROXY_URL = "http://smart-cy39cvakxmr0:pO71SSkduTPYh9nq@proxy.smartproxy.net:3120"

if PROXY_URL:
    print(f"✅ PROXY ATIVO: {PROXY_URL[:15]}...")
else:
    print("❌ AVISO: SEM PROXY CONFIGURADO")

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Mobile Safari/537.36'
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

# --- NOVA ESTRATÉGIA: REQUEST DIRETO (RAW HTML) ---
def scrape_insta_raw(url):
    print(f"   -> [HUNTER] Tentando extração direta via HTML...")
    
    # Prepara o Proxy para o Requests
    proxies = None
    if PROXY_URL:
        proxies = {
            "http": PROXY_URL,
            "https": PROXY_URL
        }

    headers = {
        'User-Agent': random.choice(USER_AGENTS),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.instagram.com/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Upgrade-Insecure-Requests': '1'
    }

    try:
        # Faz a requisição direta
        response = requests.get(url, headers=headers, proxies=proxies, timeout=15)
        
        if response.status_code == 200:
            html = response.text
            
            # PROCURA 1: Padrão video_view_count
            # Procura por "video_view_count":1234
            view_match = re.search(r'"video_view_count":(\d+)', html)
            
            # PROCURA 2: Padrão view_count (as vezes muda)
            if not view_match:
                view_match = re.search(r'"view_count":(\d+)', html)
                
            # PROCURA TÍTULO (description)
            # <meta property="og:description" content="Titulo aqui..." />
            desc_match = re.search(r'<meta property="og:description" content="([^"]+)"', html)
            title = desc_match.group(1) if desc_match else ""

            if view_match:
                views = int(view_match.group(1))
                print(f"   -> [HUNTER] SUCESSO! Regex achou: {views}")
                return {'views': views, 'title': title, 'uploader': 'unknown'}
            else:
                print("   -> [HUNTER] HTML baixado, mas padrão de views não encontrado.")
                # Debug: Salvar HTML se quiser
                return None
        else:
            print(f"   -> [HUNTER] Falha HTTP: {response.status_code}")
            return None

    except Exception as e:
        print(f"   -> [HUNTER] Erro: {str(e)}")
        return None

# --- SCRAPER FALLBACK (YT-DLP) ---
def scrape_insta_fallback(url):
    print(f"   -> [FALLBACK] Consultando yt-dlp...")
    ydl_opts = {
        'quiet': True, 'no_warnings': True, 'dump_single_json': True, 
        'skip_download': True, 'user_agent': random.choice(USER_AGENTS)
    }
    if PROXY_URL: ydl_opts['proxy'] = PROXY_URL

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            views = info.get('view_count', 0)
            print(f"   -> [FALLBACK] yt-dlp achou: {views}")
            return {'views': views, 'title': info.get('title', ''), 'uploader': info.get('uploader', '')}
    except Exception as e:
        return None

# --- SCRAPER PRINCIPAL (INSTALOADER) ---
def scrape_instagram(url):
    print(f"--> [INSTA] Tentando: {url}")
    time.sleep(random.uniform(1, 3))
    
    # 1. TENTATIVA "HUNTER" (RAW HTML + PROXY)
    # Essa é a mais provável de pegar dados frescos se o proxy for bom
    hunter_result = scrape_insta_raw(url)

    # 2. TENTATIVA INSTALOADER (CACHE)
    instaloader_result = None
    try:
        L = instaloader.Instaloader()
        L.context._session.headers.update({'User-Agent': random.choice(USER_AGENTS)})
        if PROXY_URL:
            L.context._session.proxies = {'http': PROXY_URL, 'https': PROXY_URL}

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
        print(f"   -> [INSTALOADER] Erro: {str(e)}")

    # 3. CONSOLIDAÇÃO (PEGAR O MAIOR VALOR)
    final_views = 0
    final_title = ""
    
    # Verifica Hunter
    if hunter_result and hunter_result['views'] > final_views:
        final_views = hunter_result['views']
        final_title = hunter_result['title']
        print(f"   => Usando dados do HUNTER ({final_views})")

    # Verifica Instaloader (Backup)
    if instaloader_result:
        if instaloader_result['views'] > final_views:
            final_views = instaloader_result['views']
            final_title = instaloader_result['title']
            print(f"   => Usando dados do INSTALOADER ({final_views})")
    
    # Fallback yt-dlp (Último caso)
    if final_views == 0:
        ytdlp_result = scrape_insta_fallback(url)
        if ytdlp_result and ytdlp_result['views'] > 0:
            final_views = ytdlp_result['views']
            print(f"   => Salvo pelo GONGO (yt-dlp): {final_views}")

    if final_views == 0 and not instaloader_result and not hunter_result:
        return {'success': False, 'error': 'Todos falharam'}

    return {
        'success': True,
        'views': final_views,
        'title': final_title,
        'description': final_title,
        'uploader': 'instagram_user',
        'platform': 'instagram'
    }

def scrape_generic(url):
    print(f"--> [GENERIC] Tentando: {url}")
    ydl_opts = {'quiet': True, 'no_warnings': True, 'dump_single_json': True, 'skip_download': True}
    if PROXY_URL: ydl_opts['proxy'] = PROXY_URL
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
                processed.append({'id': vid_id, 'views': new_views})
            
            time.sleep(random.uniform(2, 5))

        return jsonify({'processed': processed})

    except Exception as e:
        print(f"ERRO GERAL: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/', methods=['GET'])
def health_check():
    proxy_status = "ATIVO" if PROXY_URL else "INATIVO"
    return f"Clipay Scraper V11.0 Hunter"

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)