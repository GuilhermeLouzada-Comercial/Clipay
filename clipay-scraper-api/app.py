import os
import time
import json
from flask import Flask, jsonify, request
from flask_cors import CORS
import yt_dlp
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter # Importante para tirar o warning

app = Flask(__name__)
CORS(app)

# --- VERSÃO 4.0: TÁTICA DO IPHONE ---
print("--------------------------------------------------")
print("--- VERSÃO 4.0: MODO IPHONE ATIVADO ---")
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

# --- VALIDAÇÃO ---
def validate_content(info, req_hashtag, req_mention):
    title = info.get('title', '').lower()
    description = info.get('description', '').lower()
    full_text = f"{title} {description}"
    
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

# --- SCRAPER MODO IPHONE ---
def get_video_info(url):
    print(f"--> Iniciando scrape (Modo Mobile) para: {url}")
    
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'dump_single_json': True,
        'skip_download': True,
        # A MÁGICA: Fingir ser um iPhone 14
        'user_agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Tenta pegar views
            views = info.get('view_count', 0)
            
            # --- DEBUG DETETIVE ---
            # Se views for 0, vamos ver o que mais tem
            if not views:
                print("DEBUG: Views vieram vazias. Dados disponíveis:")
                print(f"- Like Count: {info.get('like_count')}")
                print(f"- Comment Count: {info.get('comment_count')}")
                # Às vezes o instagram salva em 'original_url' ou outros campos
            
            print(f"--> SUCESSO! Título: {info.get('title')} | Views encontradas: {views}")
            
            return {
                'success': True,
                'views': views,
                'title': info.get('title', ''),
                'description': info.get('description', ''),
                'uploader': info.get('uploader', ''),
            }
    except Exception as e:
        print(f"--> ERRO NO YT-DLP: {str(e)}")
        return {'success': False, 'error': str(e)}

# --- ROTA BATCH OTIMIZADA ---
@app.route('/cron/update-batch', methods=['GET'])
def update_batch():
    if not cred: return jsonify({'error': 'Firebase not connected'}), 500

    BATCH_SIZE = 5
    processed = []
    
    try:
        videos_ref = db.collection('videos')
        
        # NOVA SINTAXE DO FIREBASE (Sem Warning)
        # Filtra onde status é um dos 3 tipos
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
            result = get_video_info(url)

            if result['success']:
                new_views = result['views']

                # Lógica de proteção contra zero
                if new_views is None or new_views == 0:
                    print(f"AVISO: Instagram escondeu as views. Mantendo: {current_views}")
                    final_views = current_views
                else:
                    final_views = new_views

                validation_errors = validate_content(result, req_hashtag, req_mention)
                
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

            time.sleep(3) # Aumentei um pouco o tempo para parecer mais humano no mobile

        return jsonify({'processed': processed})

    except Exception as e:
        print(f"ERRO GERAL: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/', methods=['GET'])
def health_check():
    return "Clipay Scraper V4 (Mobile Mode)"

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)