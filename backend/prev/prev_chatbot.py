from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import openai  # DeepSeek-compatible client

import re
import markdown

import hashlib
import requests

app = Flask(__name__)
CORS(app)

# DeepSeek API setup
DEEPSEEK_API_KEY = "sk-2b1e2168cfd34a35937511fa87ac0921"
if not DEEPSEEK_API_KEY:
    raise ValueError("DEEPSEEK_API_KEY environment variable is not set")

client = openai.OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url="https://api.deepseek.com"
)

PROFILE_MANAGER_URL = "http://localhost:5001/api"

SYSTEM_PROMPT = """
You are DeepSeek, a creative writing assistant that helps users track story entities, relationships, and events. Your main goals are:

1. Guide the user in brainstorming and organizing their story.
2. Track entities (characters, organizations, locations), links (relationships), and events.
3. Stage changes only when the conversation context clearly indicates the user is ready.

Rules for conversation and actions:

1. Prioritize conversation. Ask clarifying questions if information is incomplete.
2. Only propose staging when sufficient detail is provided.
3. Always include a `reasoning` field explaining why the action is suggested.
4. Use only names (and optionally aliases) to reference entities; do not generate IDs — the backend handles IDs.
5. Respond in JSON using **exact schemas** that match the Profile Manager API.

Actions and schemas:

1. `respond` — purely conversational. No staging or queries.
{
  "action": "respond",
  "reasoning": "Optional explanation",
  "data": { "message": "Hello! Who would you like to discuss today?" }
}

2. `get_info` — fetch data from Profile Manager using GET requests. Map to endpoints exactly:

- Nodes: GET `/api/nodes?userId=<USER_ID>` or `/api/nodes/<NAME>?userId=<USER_ID>`
- Links: GET `/api/links?userId=<USER_ID>` or `/api/links/<NAME>?userId=<USER_ID>`
- Events: GET `/api/events?userId=<USER_ID>` or `/api/events/<TITLE>?userId=<USER_ID>`
- Pending changes: GET `/api/pending-changes?userId=<USER_ID>`
- Optional filters go inside `payload.filters`

Schema:
{
  "action": "get_info",
  "reasoning": "Explain why this info is needed",
  "data": {
    "requests": [
      {
        "target": "nodes|links|events|pending_changes",
        "entity_id": "optional",
        "payload": { "filters": { ... } },
        "message": "Explain why this info is needed"
      }
    ]
  }
}

3. `query` — same as `get_info` but for clarifications. Use same structure.

4. `stage_change` — map to POST `/api/stage-change`. Must include:
- `userId`: the user's ID
- `entityType`: "node", "link", or "event"
- `entityId`: optional; backend generates IDs for new nodes/events, optional for links
- `newData`: full object to be staged

Important: Always include a `requests` array containing the staged change(s), even if there is only one request.  
Example response schema:

{
  "action": "stage_change",
  "reasoning": "Explain why this action is suggested",
  "data": {
    "requests": [
      {
        "entityType": "node|link|event",
        "entityId": null,
        "newData": { ... }
      }
    ]
  }
}

Examples:

- Node creation:
{
  "action": "stage_change",
  "reasoning": "Creating a new character node based on user's input",
  "data": {
    "requests": [
      {
        "entityType": "node",
        "entityId": null,
        "newData": {
          "label": "Alice Johnson",
          "group": "Person",
          "aliases": "Alice, AJ",
          "attributes": { "age": "32", "occupation": "detective" }
        }
      }
    ]
  }
}

- Link creation:
{
  "action": "stage_change",
  "reasoning": "Both nodes exist, so creating a friendship link",
  "data": {
    "requests": [
      {
        "entityType": "link",
        "entityId": null,
        "newData": {
          "node1": "Alice Johnson",
          "node2": "Bob Smith",
          "type": "friends",
          "context": "Work friends at Agency X"
        }
      }
    ]
  }
}

- Event creation:
{
  "action": "stage_change",
  "reasoning": "The user has decided on a new plot point.",
  "data": {
    "requests": [
      {
        "entityType": "event",
        "entityId": null,
        "newData": {
            "title": "Secret Meeting",
            "description": "Alice meets Bob to discuss mission",
            "date": "07/03/2023",
            "order": 3
        }
      }
    ]
  }
}

- Node deletion:
{
  "entityType": "node",
  "entityId": null,
  "newData": { "identifier": "Alice Johnson" }
}

- Link deletion:
{
  "entityType": "link",
  "entityId": null,
  "newData": { "node1": "Alice Johnson", "node2": "Bob Smith" }
}

- Event deletion:
{
  "entityType": "event",
  "entityId": null,
  "newData": { "identifier": "Secret Meeting" }
}

Behavior guidelines:

- Always return a JSON object matching these schemas.
- For `get_info` and `query`, the assistant may include `payload.filters` to narrow results.
- Do not return confirm/deny requests; those are handled separately.
- Include a helpful `message` field explaining each request to the user.
"""

# -------------------- Utility functions --------------------
def parse_markdown(md_text, output="text"):
    """
    Convert markdown to plain text or HTML.
    output: "text" for plain text, "html" for HTML
    """
    if not md_text:
        return ""
    
    if output == "html":
        return markdown.markdown(md_text)
    
    # Simple plain text conversion
    # - Remove markdown links [text](url) -> text
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", md_text)
    # - Remove bold/italic markers **text** or *text* -> text
    text = re.sub(r"(\*\*|\*|__|_)(.*?)\1", r"\2", text)
    # - Replace headings #, ##, ### -> text
    text = re.sub(r"#+\s*(.*)", r"\1", text)
    # - Replace lists - item or * item -> item
    text = re.sub(r"^\s*[-*]\s+", "- ", text, flags=re.MULTILINE)
    # - Remove excessive newlines
    text = re.sub(r"\n{2,}", "\n", text)
    
    return text.strip()

def generate_entity_id(name):
    """Generate a deterministic SHA-256 ID for entities."""
    return hashlib.sha256(name.encode("utf-8")).hexdigest()


# -------------------- Helper for get_info / query --------------------
def fetch_profile_data(req_obj, user_id):
    """Fetch data from profilemanager_server based on target and optional filters."""
    target = req_obj.get("target")
    payload = req_obj.get("payload", {})
    filters = payload.get("filters", {})
    entity_id = req_obj.get("entity_id")

    url = None
    params = {"userId": user_id, **filters}

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
        response = requests.get(url, params=params)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        return {"error": str(e)}

# -------------------- Processing functions --------------------
def process_node_request(req_obj, user_id):
    node = req_obj["newData"]
    node["entity_id"] = generate_entity_id(node["label"])
    response = requests.post(
        f"{PROFILE_MANAGER_URL}/stage-change",
        json={
            "userId": user_id,
            "label": node["label"],
            "entityType": "node",
            "entityId": node["entity_id"],
            "newData": node
        }
    )
    return response.json()


def process_link_request(req_obj, user_id):
    link = req_obj["newData"]
    print("Processing link:", link)
    response = requests.post(
        f"{PROFILE_MANAGER_URL}/stage-change",
        json={
            "userId": user_id,
            "entityType": "link",
            "entityId": None,  # Links don’t need pre-generated ID
            "newData": {
                "node1": link["node1"],
                "node2": link["node2"],
                "type": link["type"],
                "context": link.get("context", "")
            }
        }
    )
    return response.json()


def process_event_request(req_obj, user_id):
    event = req_obj["newData"]
    event["entity_id"] = generate_entity_id(event["title"])
    response = requests.post(
        f"{PROFILE_MANAGER_URL}/stage-change",
        json={
            "userId": user_id,
            "entityType": "event",
            "entityId": event["entity_id"],
            "newData": event
        }
    )
    return response.json()


def handle_action(deepseek_response, user_id):
    print("DeepSeek response:", deepseek_response)
    action = deepseek_response.get("action")
    requests_list = deepseek_response.get("data", {}).get("requests", [])

    result = {
        "chat_message": "",
        "requests": [],
        "staging_results": [],
        "profile_data": []  # store results from get_info/query
    }

    if action == "respond":
        raw_msg = deepseek_response.get("data", {}).get("message", "")
        # parse markdown before returning
        result["chat_message"] = parse_markdown(raw_msg, "html")
        result["requests"] = requests_list

    elif action in ["get_info", "query"]:
        # Fetch data from profile manager
        result["requests"] = requests_list
        if requests_list:
            result["chat_message"] = requests_list[0].get("message", "")
            for req in requests_list:
                data = fetch_profile_data(req, user_id)
                result["profile_data"].append({"request": req, "data": data})
    elif action == "stage_change":
        result["chat_message"] = requests_list[0].get("message", "") if requests_list else ""
        for req in requests_list:
            entity_type = req.get("entityType")  # <-- use entityType here
            if entity_type == "node":
                result["staging_results"].append(process_node_request(req, user_id))
            elif entity_type == "link":
                result["staging_results"].append(process_link_request(req, user_id))
            elif entity_type == "event":
                result["staging_results"].append(process_event_request(req, user_id))
            else:
                result["staging_results"].append({"error": f"Unknown entity type: {entity_type}"})
        
        return result

@app.route("/chat", methods=["POST"])
def chat():
    """Chat endpoint for the chatbot window"""
    try:
        data = request.json
        user_message = data.get("message", "")
        user_id = data.get("user_id")  # Must include user_id

        if not user_message or not user_id:
            return jsonify({"error": "Message and user_id are required"}), 400

        # Send to DeepSeek
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT
                },

                {"role": "user", "content": user_message}
            ],
            stream=False
        )
        bot_reply_raw = response.choices[0].message.content.strip()

        try:
            bot_reply_json = json.loads(bot_reply_raw)
        except Exception:
            bot_reply_json = {
                "action": "respond",
                "data": {"requests": [{"message": bot_reply_raw}]}
            }

        # First pass: handle action
        result = handle_action(bot_reply_json, user_id)
        print("Initial handling result:", result)
        # If action includes get_info/query, fetch data and send back to DeepSeek
        if bot_reply_json.get("action") in ["get_info", "query"] and result.get("profile_data"):
            # Compose message including all fetched info
            info_messages = []
            for item in result["profile_data"]:
                req = item["request"]
                data = item["data"]
                info_messages.append(f"Fetched {req.get('target')}: {json.dumps(data)}")
            info_message = "\n".join(info_messages)
            print("Fetched profile data:", info_message)
            # Send fetched info back to DeepSeek for reasoning
            followup_response = client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {
                        "role": "system",
                        "content": SYSTEM_PROMPT
                    },
                    {"role": "user", "content": user_message},
                    {"role": "assistant", "content": json.dumps(bot_reply_json)},
                    {"role": "system", "content": f"Here is the requested info:\n{info_message}"}
                ],
                stream=False
            )
            
            followup_raw = followup_response.choices[0].message.content.strip()
            print("Follow-up DeepSeek response:", followup_raw)
            try:
                bot_reply_json = json.loads(followup_raw)
            except Exception:
                bot_reply_json = {
                    "action": "respond",
                    "data": {"requests": [{"message": followup_raw}]}
                }

            # Second pass: handle action again after info injection
            result = handle_action(bot_reply_json, user_id)

        return jsonify(result), 200

    except Exception as e:
        print("Error:", str(e))
        return jsonify({"error": "Something went wrong", "details": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True, threaded=True)
