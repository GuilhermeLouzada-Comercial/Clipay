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
print("--- VERSÃO 9.0: DOUBLE CHECK (INSTALOADER + YTDLP) ---")
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

# Lista de agentes para enganar o cache do Instagram
USER_AGENTS = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
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

# --- SCRAPER AUXILIAR: INSTAGRAM VIA YT-DLP ---
def scrape_insta_fallback(url):
    # Tenta usar yt-dlp especificamente para Instagram como "segunda opinião"
    print(f"   -> [FALLBACK] Consultando yt-dlp para tirar a prova...")
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'dump_single_json': True,
        'skip_download': True,
        'user_agent': random.choice(USER_AGENTS) # Tenta um agente aleatório
    }
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

# --- SCRAPER PRINCIPAL: INSTAGRAM ---
def scrape_instagram(url):
    print(f"--> [INSTA] Tentando: {url}")
    
    # Pausa aleatória
    time.sleep(random.uniform(2, 5))
    
    # 1. TENTA VIA INSTALOADER
    instaloader_result = None
    try:
        L = instaloader.Instaloader()
        # Rotação de User Agent
        agent = random.choice(USER_AGENTS)
        L.context._session.headers.update({'User-Agent': agent})

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
        if "401" in error_msg or "429" in error_msg:
             # Se deu bloqueio feio no Instaloader, retorna erro de Rate Limit
             return {'success': False, 'error': 'RATE_LIMIT', 'details': error_msg}

    # 2. TENTA VIA YT-DLP (FALLBACK / SEGUNDA OPINIÃO)
    # Sempre chamamos o fallback se o Instaloader der erro OU se acharmos poucas views (segurança)
    # Mas para garantir, vamos chamar sempre que possível para comparar.
    ytdlp_result = scrape_insta_fallback(url)

    # 3. COMPARAÇÃO E DECISÃO (O MAIOR VENCE)
    final_views = 0
    final_title = ""
    final_uploader = ""

    # Pega dados do Instaloader se existirem
    if instaloader_result:
        final_views = instaloader_result['views']
        final_title = instaloader_result['title']
        final_uploader = instaloader_result['uploader']

    # Se yt-dlp achou mais views, usamos ele (ignora cache antigo do instaloader)
    if ytdlp_result and ytdlp_result['views'] > final_views:
        print(f"   -> [DECISÃO] yt-dlp venceu ({ytdlp_result['views']} > {final_views})")
        final_views = ytdlp_result['views']
        if not final_title: final_title = ytdlp_result['title'] # Garante título se faltar
        if not final_uploader: final_uploader = ytdlp_result['uploader']
    elif instaloader_result:
        print(f"   -> [DECISÃO] Mantendo Instaloader ({final_views})")
    
    # Se ambos falharam
    if not instaloader_result and not ytdlp_result:
        return {'success': False, 'error': 'Ambos scrapers falharam'}

    return {
        'success': True,
        'views': final_views,
        'title': final_title,
        'description': final_title, # Instagram usa caption como desc
        'uploader': final_uploader,
        'platform': 'instagram'
    }

def scrape_generic(url):
    print(f"--> [GENERIC] Tentando: {url}")
    ydl_opts = {
        'quiet': True, 
        'no_warnings': True, 
        'dump_single_json': True, 
        'skip_download': True,
        'user_agent': random.choice(USER_AGENTS)
    }
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

# --- ROTA PRINCIPAL ---
@app.route('/cron/update-batch', methods=['GET'])
def update_batch():
    if not cred: return jsonify({'error': 'Firebase not connected'}), 500

    BATCH_SIZE = 3 
    processed = []
    
    try:
        # Pausa inicial
        time.sleep(random.uniform(0, 5))

        videos_ref = db.collection('videos')
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=VIDEO_VALIDITY_DAYS)

        # Query Otimizada
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
            
            # --- SCRAPE ---
            result = get_video_info(url)

            # Rate limit check
            if not result['success'] and result.get('error') == 'RATE_LIMIT':
                print("!!! RATE LIMIT DETECTADO - PARANDO O LOTE !!!")
                break 

            if result['success']:
                # Pega as views novas. Se for None, mantém a atual.
                scraped_views = result['views']
                if scraped_views is None:
                    new_views = current_views
                else:
                    # Lógica de Proteção: View nunca desce.
                    # Se o Instagram bugar e mandar 0 ou menos que o atual, mantemos o maior histórico.
                    if int(scraped_views) > current_views:
                        new_views = int(scraped_views)
                    else:
                        print(f"   -> [INFO] View não subiu (Scraped: {scraped_views} vs Atual: {current_views}). Mantendo atual.")
                        new_views = current_views

                # Validação
                validation_errors = validate_content(
                    result.get('title'), result.get('description'), 
                    data.get('requiredHashtag', ''), data.get('requiredMention', '')
                )
                new_status = 'approved' if len(validation_errors) == 0 else 'rejected'
                
                # Histórico Diário
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
                    print(f"   + {views_gained} views ganhas.")

                # Atualiza Doc
                videos_ref.document(vid_id).update({
                    'views': new_views,
                    'status': new_status,
                    'validationErrors': validation_errors,
                    'lastUpdated': firestore.SERVER_TIMESTAMP
                })
                processed.append({'id': vid_id, 'views': new_views, 'gained': views_gained})
            
            sleep_time = random.uniform(5, 15)
            print(f"zzz Dormindo {sleep_time:.1f}s zzz")
            time.sleep(sleep_time)

        return jsonify({'processed': processed})

    except Exception as e:
        print(f"ERRO GERAL: {str(e)}")
        return jsonify({'error': str(e)}), 500

# ROTA LIMPEZA (MANTIDA IGUAL)
@app.route('/cron/cleanup-expired', methods=['GET'])
def cleanup_expired():
    if not cred: return jsonify({'error': 'Firebase not connected'}), 500
    try:
        videos_ref = db.collection('videos')
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=VIDEO_VALIDITY_DAYS)
        query = videos_ref.where(filter=FieldFilter('createdAt', '<', cutoff_date)).limit(50)
        docs = query.stream()
        count = 0
        batch = db.batch()
        for doc in docs:
            data = doc.to_dict()
            if data.get('status') not in ['finished', 'rejected']:
                batch.update(doc.reference, {'status': 'finished', 'lastUpdated': firestore.SERVER_TIMESTAMP})
                count += 1
        if count > 0: batch.commit()
        return jsonify({'cleaned_videos': count})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/', methods=['GET'])
def health_check():
    return "Clipay Scraper V9 (Double Check)"

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)