import os
import time
import json
import re
import random
import requests
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
print("--- VERSÃO 13.0: TÁTICA FACEBOOK BOT ---")
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
# PROXY FIXO
PROXY_URL = "http://smart-cy39cvakxmr0:pO71SSkduTPYh9nq@proxy.smartproxy.net:3120"

if PROXY_URL:
    print(f"✅ PROXY ATIVO.")

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

# --- SCRAPER 1: FACEBOOK CRAWLER SPOOFING ---
def scrape_facebook_bot(url):
    print(f"   -> [FB BOT] Tentando fingir ser o Facebook...")
    
    proxies = {"http": PROXY_URL, "https": PROXY_URL}
    
    # O User-Agent Mágico
    headers = {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
    }

    try:
        response = requests.get(url, headers=headers, proxies=proxies, timeout=15)
        html = response.text
        
        # Procura por padrões de views no HTML retornado para o bot
        # Padrão 1: "video_view_count":123
        match_json = re.search(r'"video_view_count":(\d+)', html)
        
        # Padrão 2: Meta tags específicas
        # <meta property="og:description" content="109 Views, 20 Likes..." />
        match_meta = re.search(r'([\d,.]+) views', html, re.IGNORECASE)
        match_plays = re.search(r'([\d,.]+) plays', html, re.IGNORECASE)

        views = 0
        if match_json:
            views = int(match_json.group(1))
            print(f"   -> [FB BOT] Achou via JSON: {views}")
        elif match_meta:
            # Remove virgulas e pontos (ex: 1,200 -> 1200)
            raw_num = match_meta.group(1).replace(',', '').replace('.', '')
            views = int(raw_num)
            print(f"   -> [FB BOT] Achou via Meta Views: {views}")
        elif match_plays:
            raw_num = match_plays.group(1).replace(',', '').replace('.', '')
            views = int(raw_num)
            print(f"   -> [FB BOT] Achou via Meta Plays: {views}")
        else:
            print("   -> [FB BOT] HTML baixado mas sem views.")
            # Debug: Mostra pedaço do título para ver se carregou
            title_m = re.search(r'<title>(.*?)</title>', html)
            if title_m: print(f"      Título da pág: {title_m.group(1)}")

        return views

    except Exception as e:
        print(f"   -> [FB BOT] Erro: {str(e)}")
        return 0

# --- SCRAPER 2: INSTALOADER (CACHE) ---
def scrape_instaloader(url):
    print(f"   -> [INSTALOADER] Tentando...")
    try:
        L = instaloader.Instaloader()
        L.context._session.proxies = {'http': PROXY_URL, 'https': PROXY_URL}
        
        # Instaloader tem seus próprios headers, vamos confiar neles
        
        shortcode = extract_shortcode(url)
        if shortcode:
            post = instaloader.Post.from_shortcode(L.context, shortcode)
            views = post.video_view_count
            print(f"   -> [INSTALOADER] Achou: {views}")
            return int(views), post.caption or "", post.owner_username
    except Exception as e:
        print(f"   -> [INSTALOADER] Erro: {str(e)}")
        return 0, "", ""

# --- SCRAPER 3: YT-DLP (FALLBACK) ---
def scrape_ytdlp(url):
    print(f"   -> [YT-DLP] Tentando...")
    ydl_opts = {
        'quiet': True, 'no_warnings': True, 'dump_single_json': True, 
        'skip_download': True, 'proxy': PROXY_URL
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            views = info.get('view_count', 0)
            print(f"   -> [YT-DLP] Achou: {views}")
            return int(views)
    except Exception as e:
        # print(f"   -> [YT-DLP] Erro: {str(e)}") # Reduz log de erro do yt-dlp
        return 0

# --- CONTROLADOR ---
def get_video_info(url):
    print(f"--> [SCRAPER] Analisando: {url}")
    time.sleep(random.uniform(1, 3))

    if "instagram.com" in url:
        v1 = scrape_facebook_bot(url) # Tenta se passar por FB
        v2 = scrape_ytdlp(url)        # Tenta engine yt-dlp
        v3_val, t3, u3 = scrape_instaloader(url) # Tenta engine instaloader
        
        max_views = max(v1, v2, v3_val)
        
        print(f"   => [PLACAR] FB:{v1} | YTDLP:{v2} | INSTA:{v3_val} -> VENCEDOR: {max_views}")
        
        if max_views == 0:
            return {'success': False, 'error': 'Zero views found'}
            
        return {
            'success': True,
            'views': max_views,
            'title': t3, # Usa metadados do instaloader que costumam ser bons
            'description': t3,
            'uploader': u3,
            'platform': 'instagram'
        }
    else:
        # TikTok/Outros
        v = scrape_ytdlp(url)
        return {'success': True, 'views': v, 'title': '', 'description': '', 'uploader': '', 'platform': 'other'}

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
                # PROTEÇÃO: Só atualiza se o novo valor for MAIOR que o atual
                if scraped_views > current_views:
                    new_views = scraped_views
                    print(f"   *** ATUALIZANDO: {current_views} -> {new_views} ***")
                else:
                    new_views = current_views
                    print(f"   --- Mantendo: {current_views} (Scraper achou {scraped_views}) ---")

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
            else:
                print("   x Falha geral na leitura.")
            
            time.sleep(random.uniform(2, 5))

        return jsonify({'processed': processed})

    except Exception as e:
        print(f"ERRO GERAL: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/', methods=['GET'])
def health_check():
    return f"Clipay Scraper V13.0 (FB Bot)"

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)