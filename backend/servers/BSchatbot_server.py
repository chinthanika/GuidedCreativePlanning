from flask import Flask, request, jsonify
from flask_cors import CORS
import os, json, time, hashlib, requests
import markdown, re
import openai
import logging
from logging.handlers import RotatingFileHandler

app = Flask(__name__)
CORS(app)

# -------------------- SETUP LOGGING --------------------
os.makedirs("logs", exist_ok=True)
log_file = "logs/chat_debug.log"
rotating_handler = RotatingFileHandler(
    log_file, mode='a', maxBytes=5*1024*1024, backupCount=3
)
formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
rotating_handler.setFormatter(formatter)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
logger.addHandler(rotating_handler)

# -------------------- FIREBASE SETUP --------------------
import firebase_admin
from firebase_admin import credentials, db

cred = credentials.Certificate("../Firebase/structuredcreativeplanning-fdea4acca240.json")
firebase_admin.initialize_app(cred, {
    'databaseURL': "https://structuredcreativeplanning-default-rtdb.firebaseio.com/"
})

# -------------------- DEEPSEEK + PROFILE MANAGER --------------------
DEEPSEEK_API_KEY = "sk-6c4641c0b8404e049912cafc281e04f5"
if not DEEPSEEK_API_KEY:
    raise ValueError("DEEPSEEK_API_KEY environment variable is not set")

client = openai.OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url="https://api.deepseek.com"
)

PROFILE_MANAGER_URL = "http://localhost:5001/api"
SYSTEM_PROMPT = "..."  # your system prompt here

# -------------------- UTILITIES --------------------
def parse_markdown(md_text, output="text"):
    if not md_text:
        return ""
    if output == "html":
        return markdown.markdown(md_text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", md_text)
    text = re.sub(r"(\*\*|\*|__|_)(.*?)\1", r"\2", text)
    text = re.sub(r"#+\s*(.*)", r"\1", text)
    text = re.sub(r"^\s*[-*]\s+", "- ", text, flags=re.MULTILINE)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()

def parse_deepseek_json(raw):
    matches = re.findall(r'```(?:json)?\s*(\{.*?\})\s*```', raw, re.DOTALL)
    results = []
    if matches:
        for m in matches:
            try:
                results.append(json.loads(m))
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse JSON block: {e}")
    else:
        try:
            results.append(json.loads(raw))
        except json.JSONDecodeError:
            pass
    return results

def normalize_deepseek_response(parsed):
    if isinstance(parsed, dict):
        return parsed
    if isinstance(parsed, list):
        if len(parsed) == 1:
            return parsed[0]
        return parsed
    return {"action": "respond", "data": {"message": str(parsed)}}

def generate_entity_id(name):
    return hashlib.sha256(name.encode("utf-8")).hexdigest()

def fetch_profile_data(req_obj, user_id):
    target = req_obj.get("target")
    payload = req_obj.get("payload", {})
    filters = payload.get("filters", {})
    entity_id = req_obj.get("entity_id")

    if target == "nodes":
        url = f"{PROFILE_MANAGER_URL}/nodes/{entity_id}" if entity_id else f"{PROFILE_MANAGER_URL}/nodes"
    elif target == "links":
        url = f"{PROFILE_MANAGER_URL}/links/{entity_id}" if entity_id else f"{PROFILE_MANAGER_URL}/links"
    elif target == "events":
        url = f"{PROFILE_MANAGER_URL}/events/{entity_id}" if entity_id else f"{PROFILE_MANAGER_URL}/events"
    elif target == "pending_changes":
        url = f"{PROFILE_MANAGER_URL}/pending-changes"
    else:
        return {"error": f"Unknown target type: {target}"}

    try:
        resp = requests.get(url, params={"userId": user_id, **filters})
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict) and "error" in data:
            return {"error": data["error"]}
        return data or {"data": []}
    except requests.HTTPError as e:
        if e.response.status_code == 404:
            return {"data": []}
        return {"error": str(e)}
    except Exception as e:
        return {"error": str(e)}

# -------------------- ACTION HANDLER --------------------
def handle_action(deepseek_response, user_id, recent_msgs, depth=0):
    MAX_DEPTH = 5
    if depth > MAX_DEPTH:
        return {"chat_message": "Error: recursion depth exceeded", "profile_data": []}

    if isinstance(deepseek_response, list):
        result = {}
        for obj in deepseek_response:
            result = handle_action(obj, user_id, recent_msgs, depth=depth+1)
        return result

    action = deepseek_response.get("action")
    result = {"chat_message": "", "profile_data": []}

    last_user_msg = recent_msgs[-1]["content"] if recent_msgs else ""

    if action == "respond":
        result["chat_message"] = parse_markdown(deepseek_response.get("data", {}).get("message", ""), "html")
        logger.debug(f"[RESPOND] Message: {result['chat_message']}")

    elif action in ["get_info", "query"]:
        requests_list = deepseek_response.get("data", {}).get("requests", [])
        for req in requests_list:
            data = fetch_profile_data(req, user_id)
            logger.debug(f"[GET_INFO] Request: {req}, Response: {data}")
            result["profile_data"].append({"request": req, "data": data})

    return result

# -------------------- CHAT ENDPOINT --------------------
@app.route("/chat", methods=["POST"])
def chat():
    result = {"chat_message": "", "profile_data": []}
    data = request.json
    user_message = data.get("message")
    user_id = data.get("user_id")

    if not user_message or not user_id:
        return jsonify({"error": "Message and user_id are required"}), 400

    # ------------------ CALL DEEPSEEK ------------------
    deepseek_messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message}
    ]

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=deepseek_messages,
            stream=False
        )
        bot_reply_raw = response.choices[0].message.content.strip()
        bot_reply_json_list = parse_deepseek_json(bot_reply_raw) or [{"action": "respond", "data": {"message": bot_reply_raw}}]
        bot_reply_json = normalize_deepseek_response(bot_reply_json_list)
        result = handle_action(bot_reply_json, user_id, deepseek_messages)
    except Exception as e:
        logger.warning(f"DeepSeek API error: {e}")
        result = {"chat_message": str(e), "profile_data": []}

    return jsonify(result), 200

# -------------------- RUN SERVER --------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True, threaded=True)
