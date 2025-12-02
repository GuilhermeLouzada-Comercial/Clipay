import os
import time
import json
import re
import random
import requests
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
print("--- VERSÃO 12.0: A COMPETIÇÃO (MAX VIEWS STRATEGY) ---")
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
# PROXY HARDCODED (PARA GARANTIR O FUNCIONAMENTO)
PROXY_URL = "http://smart-cy39cvakxmr0:pO71SSkduTPYh9nq@proxy.smartproxy.net:3120"

if PROXY_URL:
    print(f"✅ PROXY FIXO ATIVO.")

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
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

# --- SCRAPER 1: JSON HACK (NOVO) ---
def scrape_insta_json(url):
    print(f"   -> [JSON HACK] Tentando...")
    shortcode = extract_shortcode(url)
    if not shortcode: return 0
    
    # URL Mágica que força JSON
    api_url = f"https://www.instagram.com/reel/{shortcode}/?__a=1&__d=dis"
    
    proxies = {"http": PROXY_URL, "https": PROXY_URL}
    headers = {
        'User-Agent': random.choice(USER_AGENTS),
        'Accept': 'application/json',
        'X-IG-App-ID': '936619743392459', # ID Público do Instagram Web
    }

    try:
        response = requests.get(api_url, headers=headers, proxies=proxies, timeout=10)
        if response.status_code == 200:
            data = response.json()
            # Navega no JSON para achar views
            # Pode estar em items[0].play_count ou view_count
            item = data.get('graphql', {}).get('shortcode_media', {})
            if not item:
                item = data.get('items', [{}])[0]
            
            views = item.get('video_view_count') or item.get('play_count') or item.get('view_count') or 0
            
            print(f"   -> [JSON HACK] Achou: {views}")
            return int(views)
        else:
            print(f"   -> [JSON HACK] Falhou: {response.status_code}")
            return 0
    except Exception as e:
        print(f"   -> [JSON HACK] Erro: {str(e)}")
        return 0

# --- SCRAPER 2: YT-DLP (SEMPRE RODAR) ---
def scrape_ytdlp(url):
    print(f"   -> [YT-DLP] Tentando...")
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'dump_single_json': True,
        'skip_download': True,
        'proxy': PROXY_URL, # Força o proxy
        'user_agent': random.choice(USER_AGENTS)
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            views = info.get('view_count', 0)
            print(f"   -> [YT-DLP] Achou: {views}")
            return int(views), info.get('title', ''), info.get('uploader', '')
    except Exception as e:
        print(f"   -> [YT-DLP] Erro: {str(e)}")
        return 0, "", ""

# --- SCRAPER 3: INSTALOADER (CACHE) ---
def scrape_instaloader(url):
    print(f"   -> [INSTALOADER] Tentando...")
    try:
        L = instaloader.Instaloader()
        L.context._session.proxies = {'http': PROXY_URL, 'https': PROXY_URL}
        L.context._session.headers.update({'User-Agent': random.choice(USER_AGENTS)})
        
        shortcode = extract_shortcode(url)
        if shortcode:
            post = instaloader.Post.from_shortcode(L.context, shortcode)
            views = post.video_view_count
            print(f"   -> [INSTALOADER] Achou: {views}")
            return int(views), post.caption or "", post.owner_username
    except Exception as e:
        print(f"   -> [INSTALOADER] Erro: {str(e)}")
        return 0, "", ""

# --- CONTROLADOR PRINCIPAL ---
def get_video_info(url):
    print(f"--> [SCRAPER] Iniciando competição para: {url}")
    time.sleep(random.uniform(1, 3))

    # Roda TODOS (se for instagram)
    if "instagram.com" in url:
        v1 = scrape_insta_json(url)
        v2, t2, u2 = scrape_ytdlp(url)
        v3, t3, u3 = scrape_instaloader(url)
        
        # Pega o MAIOR valor encontrado
        max_views = max(v1, v2, v3)
        
        # Define título/uploader (prioriza yt-dlp ou instaloader)
        final_title = t2 or t3 or ""
        final_uploader = u2 or u3 or ""
        
        print(f"   => [RESULTADO] Vencedor: {max_views} views (Json:{v1}, Ytdlp:{v2}, Insta:{v3})")
        
        if max_views == 0:
            return {'success': False, 'error': 'Todos retornaram 0'}
            
        return {
            'success': True,
            'views': max_views,
            'title': final_title,
            'description': final_title,
            'uploader': final_uploader,
            'platform': 'instagram'
        }
    else:
        # Genérico para TikTok/Shorts
        v, t, u = scrape_ytdlp(url)
        return {
            'success': True,
            'views': v,
            'title': t,
            'description': t,
            'uploader': u,
            'platform': 'other'
        }

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
                
                # Lógica "Only Up": Nunca diminui views
                if scraped_views > current_views:
                    new_views = scraped_views
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
                processed.append({'id': vid_id, 'views': new_views, 'from': current_views})
            
            time.sleep(random.uniform(2, 5))

        return jsonify({'processed': processed})

    except Exception as e:
        print(f"ERRO GERAL: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/', methods=['GET'])
def health_check():
    return f"Clipay Scraper V12.0 Competition"

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)