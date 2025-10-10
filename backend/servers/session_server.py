from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, db
import time
import openai
import os
import logging
import threading
from logging.handlers import RotatingFileHandler
from apscheduler.schedulers.background import BackgroundScheduler


from utils.Session import Session

# ---------------- LOGGING SETUP ----------------
os.makedirs("logs", exist_ok=True)
log_file = "logs/session_api_debug.log"
rotating_handler = RotatingFileHandler(
    log_file, mode='a', maxBytes=5*1024*1024, backupCount=3, encoding=None, delay=0
)

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    handlers=[rotating_handler, logging.StreamHandler()]
)
logger = logging.getLogger("SessionAPI")

# ---------------- FIREBASE INIT ----------------
cred = credentials.Certificate("../Firebase/structuredcreativeplanning-fdea4acca240.json")
firebase_admin.initialize_app(cred, {
    'databaseURL': "https://structuredcreativeplanning-default-rtdb.firebaseio.com/"
})

# DeepSeek API setup
DEEPSEEK_API_KEY = "sk-6c4641c0b8404e049912cafc281e04f5"
if not DEEPSEEK_API_KEY:
    raise ValueError("DEEPSEEK_API_KEY environment variable is not set")

client = openai.OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url="https://api.deepseek.com"
)

# ---------------- FLASK APP ----------------
app = Flask(__name__)
CORS(app)

# ---------------- UTIL ----------------

_summarisation_lock = threading.Lock()
_last_summarisation_time = 0


def get_session_from_request():
    uid = request.json.get("uid")
    session_id = request.json.get("sessionID")
    logger.debug(f"Fetching session: uid={uid}, sessionID={session_id}")
    if not uid:
        return None, "uid is required"
    if not session_id:
        logger.info(f"No sessionID provided, creating new session for uid={uid}")
        session = Session.create(uid)
    else:
        session = Session(uid, session_id)
    return session, None

# ---------------- SCHEDULER ----------------
def summarise_active_sessions():
    """Run summarisation with concurrency protection."""
    global _last_summarisation_time
    
    # Prevent concurrent execution
    if not _summarisation_lock.acquire(blocking=False):
        logger.warning("[SessionAPI] Skipping - summarisation already running")
        return
    
    try:
        # Prevent running too frequently (debounce)
        now = time.time()
        if now - _last_summarisation_time < 240:  # 4 minutes minimum gap
            logger.info("[SessionAPI] Skipping - ran recently")
            return
        
        _last_summarisation_time = now
        logger.info("[SessionAPI] Running scheduled summarisation job for all active sessions")
        
        active_sessions = Session.get_all_active_sessions()
        logger.info(f"[SessionAPI] Found {len(active_sessions)} active sessions")
        
        for session in active_sessions:
            try:
                # Check message count BEFORE fetching
                messages = session.messages_ref.get() or {}
                unsummarised_count = sum(1 for m in messages.values() if not m.get("summarised"))
                
                if unsummarised_count < 10:
                    logger.debug(f"Session {session.session_id} has only {unsummarised_count} unsummarised messages, skipping")
                    continue
                
                summary = session.summarise(client, min_messages=10)
                if summary:
                    logger.info(f"Summary created for {session.session_id}: {len(summary)} chars")
                    
            except Exception as e:
                logger.error(f"Failed auto-summarising session {session.session_id}: {e}")
    
    finally:
        _summarisation_lock.release()
        
# Start scheduler
scheduler = BackgroundScheduler()
scheduler.add_job(func=summarise_active_sessions, trigger="interval", minutes=5)
scheduler.start()


# ---------------- ENDPOINTS ----------------

@app.before_request
def log_request_info():
    logger.info(f"Incoming request: {request.method} {request.path}")
    logger.debug(f"Request body: {request.get_json(silent=True)}")

@app.after_request
def log_response_info(response):
    logger.debug(f"Response: {response.status} {response.get_data(as_text=True)}")
    return response

@app.route("/session/create", methods=["POST"])
def create_session():
    data = request.json
    uid = data.get("uid")
    if not uid:
        logger.error("Session creation failed: uid missing")
        return jsonify({"error": "uid is required"}), 400
    session = Session.create(
        uid,
        data.get("metadata_shared"),
        data.get("metadata_dt"),
        data.get("metadata_bs")
    )
    logger.info(f"Created new session: uid={uid}, sessionID={session.session_id}")
    
    return jsonify({"sessionID": session.session_id})

@app.route("/session/end", methods=["POST"])
def end_session():
    session, err = get_session_from_request()
    if err:
        logger.error(f"End session failed: {err}")
        return jsonify({"error": err}), 400
    
    session.update_metadata({"ended": True, "endedAt": time.time()}, mode="shared")
    session.end(session.uid, session.session_id)
    logger.info(f"Session ended: {session.session_id}")
    return jsonify({"success": True})


@app.route("/session/switch_mode", methods=["POST"])
def switch_mode():
    session, err = get_session_from_request()
    if err:
        logger.error(f"Switch mode failed: {err}")
        return jsonify({"error": err}), 400
    mode = request.json.get("mode")
    try:
        session.switch_mode(mode)
        logger.info(f"Session {session.session_id} switched to mode={mode}")
        return jsonify({"success": True, "currentMode": mode})
    except ValueError as e:
        logger.error(f"Invalid mode switch: {e}")
        return jsonify({"error": str(e)}), 400

@app.route("/session/get_metadata", methods=["POST"])
def get_metadata():
    session, err = get_session_from_request()
    if err:
        logger.error(f"Get metadata failed: {err}")
        return jsonify({"error": err}), 400
    mode = request.json.get("mode")
    metadata = session.get_metadata(mode)
    logger.debug(f"Metadata fetched for mode={mode}: {metadata}")
    return jsonify({"metadata": metadata})

@app.route("/session/update_metadata", methods=["POST"])
def update_metadata():
    session, err = get_session_from_request()
    if err:
        logger.error(f"Update metadata failed: {err}")
        return jsonify({"error": err}), 400
    updates = request.json.get("updates", {})
    mode = request.json.get("mode", "shared")
    session.update_metadata(updates, mode)
    logger.info(f"Metadata updated for session={session.session_id}, mode={mode}, updates={updates}")
    return jsonify({"success": True})

@app.route("/session/save_message", methods=["POST"])
def save_message():
    session, err = get_session_from_request()
    if err:
        logger.error(f"Save message failed: {err}")
        return jsonify({"error": err}), 400
    role = request.json.get("role")
    content = request.json.get("content")
    mode = request.json.get("mode")
    extra = request.json.get("extra", {})
    if not role or not content:
        logger.error("Save message failed: role/content missing")
        return jsonify({"error": "role and content are required"}), 400
    msg_id = session.save_message(role, mode, content, **extra)
    logger.info(f"Message saved: session={session.session_id}, msg_id={msg_id}, role={role}, mode={mode}")
    return jsonify({"messageID": msg_id})

@app.route("/session/get_messages", methods=["POST"])
def get_messages():
    session, err = get_session_from_request()
    if err:
        logger.error(f"Get messages failed: {err}")
        return jsonify({"error": err}), 400
    messages = session.messages_ref.get() or {}
    logger.debug(f"Fetched {len(messages)} messages for session={session.session_id}")
    return jsonify({"messages": messages})

@app.route("/session/summarise", methods=["POST"])
def summarise_session():
    session, err = get_session_from_request()
    if err:
        logger.error(f"Summarise failed: {err}")
        return jsonify({"error": err}), 400

    try:
        summary = session.summarise(client, min_messages=1)  # allow manual summarisation for any messages
    except Exception:
        return jsonify({"error": "summarisation failed"}), 500

    return jsonify({"success": True, "summary": summary})

@app.route("/session/mark_messages_summarised", methods=["POST"])
def mark_messages_summarised():
    """Mark multiple messages as summarised."""
    data = request.json
    uid = data.get("uid")
    session_id = data.get("sessionID")
    message_ids = data.get("messageIDs", [])
    
    if not uid or not session_id or not message_ids:
        return jsonify({"error": "uid, sessionID, and messageIDs required"}), 400
    
    try:
        session = Session(uid, session_id)
        for msg_id in message_ids:
            session.messages_ref.child(msg_id).update({"summarised": True})
        
        logger.info(f"Marked {len(message_ids)} messages as summarised for session {session_id}")
        return jsonify({"success": True, "marked": len(message_ids)})
    except Exception as e:
        logger.error(f"Failed to mark messages summarised: {e}")
        return jsonify({"error": str(e)}), 500

# ---------------- BS-SPECIFIC ----------------

@app.route("/cps/add_idea", methods=["POST"])
def add_idea():
    session, err = get_session_from_request()
    if err:
        logger.error(f"Add idea failed: {err}")
        return jsonify({"error": err}), 400
    idea_data = request.json.get("data")
    if not idea_data:
        logger.error("Add idea failed: data missing")
        return jsonify({"error": "data is required"}), 400
    new_idea_ref = session.session_ref.child("ideas").push()
    new_idea_ref.set(idea_data)
    logger.info(f"Idea added: session={session.session_id}, ideaID={new_idea_ref.key}")
    return jsonify({"success": True, "ideaID": new_idea_ref.key})

@app.route("/cps/get_ideas", methods=["POST"])
def get_ideas():
    session, err = get_session_from_request()
    if err:
        logger.error(f"Get ideas failed: {err}")
        return jsonify({"error": err}), 400
    ideas = session.session_ref.child("ideas").get() or {}
    logger.debug(f"Fetched {len(ideas)} ideas for session={session.session_id}")
    return jsonify({"ideas": ideas})

@app.route("/cps/get_fluency", methods=["POST"])
def get_fluency():
    session, err = get_session_from_request()
    if err:
        logger.error(f"Get fluency failed: {err}")
        return jsonify({"error": err}), 400
    ideas = session.session_ref.child("ideas").get() or {}
    count = len(ideas)
    score = "Low" if count < 3 else "Medium" if count < 6 else "High"
    logger.info(f"Fluency score calculated: session={session.session_id}, count={count}, score={score}")
    return jsonify({"fluency": {"score": score, "count": count}})

@app.route("/cps/get_flexibility", methods=["POST"])
def get_flexibility():
    session, err = get_session_from_request()
    if err:
        logger.error(f"Get flexibility failed: {err}")
        return jsonify({"error": err}), 400
    ideas = session.session_ref.child("ideas").get() or {}
    categories = {idea.get("category") for idea in ideas.values() if idea.get("category")}
    count = len(categories)
    score = "Low" if count < 3 else "Medium" if count < 6 else "High"
    logger.info(f"Flexibility score calculated: session={session.session_id}, categories={count}, score={score}")
    return jsonify({"flexibility": {"score": score, "count": count}})

@app.route("/cps/add_hmw", methods=["POST"])
def add_hmw():
    session, err = get_session_from_request()
    if err:
        logger.error(f"Add HMW failed: {err}")
        return jsonify({"error": err}), 400
    hmw_data = request.json.get("question")
    if not hmw_data:
        logger.error("Add HMW failed: question missing")
        return jsonify({"error": "data is required"}), 400
    new_hmw_ref = session.metadata_ref.child("brainstorming").child("hmwQuestions").push()
    new_hmw_ref.set(hmw_data)
    logger.info(f"HMW added: session={session.session_id}, hmwID={new_hmw_ref.key}")
    return jsonify({"success": True, "hmwID": new_hmw_ref.key})

@app.route("/cps/get_hmw_questions", methods=["POST"])
def get_hmw_questions():
    session, err = get_session_from_request()
    if err:
        logger.error(f"Get HMW questions failed: {err}")
        return jsonify({"error": err}), 400
    hmw = session.get_metadata("brainstorming").get("hmwQuestions", [])
    logger.debug(f"Fetched HMW questions for session={session.session_id}: {hmw}")
    return jsonify({"hmwQuestions": hmw})

# ---------------- DT-SPECIFIC ----------------

@app.route("/dt/get_current_category", methods=["POST"])
def get_current_category():
    session, err = get_session_from_request()
    if err:
        logger.error(f"Get current category failed: {err}")
        return jsonify({"error": err}), 400
    category = session.get_metadata("deepthinking").get("currentCategory")
    logger.debug(f"Current category for session={session.session_id}: {category}")
    return jsonify({"currentCategory": category})

@app.route("/dt/get_current_angle", methods=["POST"])
def get_current_angle():
    session, err = get_session_from_request()
    if err:
        logger.error(f"Get current angle failed: {err}")
        return jsonify({"error": err}), 400
    angle = session.get_metadata("deepthinking").get("currentAngle")
    logger.debug(f"Current angle for session={session.session_id}: {angle}")
    return jsonify({"currentAngle": angle})

# ---------------- RUN ----------------
if __name__ == "__main__":
    app.run(port=4000, debug=True)
