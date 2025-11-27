import os
import time
import json
from flask import Flask, jsonify, request
from flask_cors import CORS
import yt_dlp
import firebase_admin
from firebase_admin import credentials, firestore

app = Flask(__name__)
CORS(app)

# --- CONFIGURAÇÃO FIREBASE (Igual ao anterior) ---
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

# --- FUNÇÃO DE VALIDAÇÃO DE TEXTO ---
def validate_content(info, req_hashtag, req_mention):
    # Junta Título e Descrição num texto só para facilitar a busca (tudo minúsculo)
    title = info.get('title', '').lower()
    description = info.get('description', '').lower()
    full_text = f"{title} {description}"
    
    errors = []
    
    # 1. Valida Hashtag (se a campanha exigir)
    if req_hashtag:
        # Remove o # caso venha do banco, para padronizar
        clean_tag = req_hashtag.replace('#', '').lower()
        if f"#{clean_tag}" not in full_text:
            errors.append(f"Faltou a hashtag #{clean_tag}")

    # 2. Valida Menção/Criador (se a campanha exigir)
    if req_mention:
        clean_mention = req_mention.replace('@', '').lower()
        # Verifica se o nome está lá (aceita com ou sem @ no texto do vídeo, 
        # pois as vezes o TikTok trata menção apenas como link)
        if clean_mention not in full_text:
            errors.append(f"Faltou marcar o criador @{clean_mention}")
            
    return errors

# --- SCRAPER ATUALIZADO ---
def get_video_info(url):
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
            return {
                'success': True,
                'views': info.get('view_count', 0),
                'title': info.get('title', ''),
                'description': info.get('description', ''), # Agora pegamos a descrição
                'uploader': info.get('uploader', ''),
            }
    except Exception as e:
        return {'success': False, 'error': str(e)}

# --- ROTA DE BATCH (CRON) ATUALIZADA ---
@app.route('/cron/update-batch', methods=['GET'])
def update_batch():
    if not cred: return jsonify({'error': 'Firebase not connected'}), 500

    BATCH_SIZE = 5 # Reduzi para 5 para ser mais seguro no plano Free
    processed = []
    
    try:
        # Pega vídeos pendentes ou aprovados (para atualizar views)
        videos_ref = db.collection('videos')
        query = videos_ref.where('status', 'in', ['pending', 'approved', 'check_rules'])\
                          .order_by('lastUpdated', direction=firestore.Query.ASCENDING)\
                          .limit(BATCH_SIZE)
        
        docs = query.stream()

        for doc in docs:
            data = doc.to_dict()
            vid_id = doc.id
            url = data.get('url')
            
            # Pega as regras salvas no vídeo
            req_hashtag = data.get('requiredHashtag', '')
            req_mention = data.get('requiredMention', '')

            print(f"Checking {vid_id}...")
            result = get_video_info(url)

            if result['success']:
                # Verifica regras
                validation_errors = validate_content(result, req_hashtag, req_mention)
                
                new_status = 'approved'
                if len(validation_errors) > 0:
                    new_status = 'rejected' # Ou 'check_rules' se quiser dar chance de arrumar
                
                # Atualiza Firestore
                videos_ref.document(vid_id).update({
                    'views': result['views'],
                    'status': new_status,
                    'validationErrors': validation_errors,
                    'lastUpdated': firestore.SERVER_TIMESTAMP
                })
                
                processed.append({
                    'id': vid_id, 
                    'status': new_status, 
                    'errors': validation_errors
                })
            else:
                print(f"Failed {vid_id}")

            time.sleep(2) # Pausa anti-bloqueio

        return jsonify({'processed': processed})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Rota simples para o Front testar um link avulso
@app.route('/check-video', methods=['POST'])
def check_single():
    data = request.get_json()
    url = data.get('url')
    # Opcional: Front pode mandar regras para testar na hora
    hashtag = data.get('hashtag', '') 
    mention = data.get('mention', '')

    result = get_video_info(url)
    if result['success']:
        errors = validate_content(result, hashtag, mention)
        result['validation_errors'] = errors
        result['is_valid'] = len(errors) == 0
        return jsonify(result)
    return jsonify(result), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)