from flask import Flask, request, jsonify
from flask_cors import CORS
import os, json, time, random, hashlib, requests
import markdown, re
import openai

import logging

# Firebase + DTConversationFlowManager
import firebase_admin
from firebase_admin import credentials, db

from utils.DTConversationFlowManager import DTConversationFlowManager

app = Flask(__name__)
CORS(app)

# -------------------- SETUP LOGGING --------------------
logging.basicConfig(level=logging.DEBUG, format='[%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

# Initialize Firebase
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

PROFILE_MANAGER_URL = "http://localhost:5001/api"

MAX_DEPTH = 5 # Max recursion for handle_action to avoid infinite loops

SUMMARIZE_FETCH_LIMIT = 200   # how many recent messages to fetch at most
KEEP_LAST_N = 10              # keep the last N messages unchanged
SUMMARY_TOKEN_TRIM = 4000     # guard: trim input length if necessary (approx chars)

SYSTEM_PROMPT = """
You are DeepSeek, a creative writing assistant that helps users track story entities, relationships, and events. Your main goals:

1. Guide the user in brainstorming and organizing their story.
2. Track entities (characters, organizations, locations), links (relationships), and events.
3. Stage changes only when the conversation context clearly indicates the user is ready.

Rules for conversation and actions:

1. Prioritize conversation. Ask clarifying questions if information is incomplete.
2. Only propose staging when sufficient detail is provided.
3. Always include a `reasoning` field explaining why the action is suggested.
4. Use only names (and optionally aliases) to reference entities; do not generate IDs — the backend handles IDs.
5. Respond in JSON using **exact schemas** that match the Profile Manager API.

Conversation Logic:

- Step 1: Category Selection
    - If no category selected or user requests a shift, select a category.
    - Emit JSON with "meta_transition", type "category_to_category", message explaining choice.
    - Retrieve initial question from CFM for category.

- Step 2: Evaluate User Response
    - Evaluate Socratic quality standards.
    - If all pass:
        - Select new angle based on Eight Elements of Reasoning.
        - Emit JSON with "meta_transition", type "angle_to_angle".
        - You will receive a question or prompt, which you must reword based on the context and conversational tone to pose to user.
    - If any fail:
        - Check depth:
            - If depth-check passes:
                - Retrieve follow-up question from CFM in same category/angle.
                - Emit JSON "get_question" or "query" for clarification.
            - If depth-check fails:
                - Decide to shift angle or category.
                - Emit JSON with "meta_transition", type "angle_to_angle" or "category_to_category".
                - Retrieve new question from CFM as appropriate.

- Step 3: Profile Manager Operations
    - At any point, if user references or requests info about entities:
        - Fetch info: emit JSON "get_info" with target and optional filters/entity_id.
        - Clarify: emit JSON "query" with target and optional filters/entity_id.
        - Stage change: emit JSON "stage_change" with entityType and newData, if necessary.
    - When the user wants to explore a character’s relationships:
      - Automatically fetch all existing links connected to that character.
      - Provide the user with context about these links before prompting further questions.
      - Only stage changes after sufficient detail has been discussed with the user, if necessary.

- Step 4: Closure
    - If conversation cycle exhausted or user signals satisfaction:
        - Emit JSON "meta_transition", type "closure".
        - Optionally summarize insights.

REWRITING RULES (mandatory)
- When you RECEIVE a CFM question object (from get_primary_question or get_follow_up):
   1. Reword the raw question into a conversational style prompt.
   2. Always output a "respond" action with the reworded version.
   3. Ground your rewording in the previous messages and any context already retrieved (via get_info, etc.).
  4. Provide the JSON action `respond` with `data.message` containing the conversational prompt.
- Examples:
  - Raw CFM question: "What kind of past experiences, personal history, or special knowledge do you think influence the choices this character makes?"
  - Reworded (good): "Got it — you want to talk about Akio. Do you have any background or experiences in mind that shape how he behaves or decides things?"

Eight Elements of Reasoning (for angle selection):

- goals_and_purposes:
  - Meaning: Focus on what the element (character, plot point, setting, etc.) is trying to achieve in the story.
  - Use: Identify the function, intent, or role in advancing plot, theme, or character development.

- questions:  
  - Meaning: Focus on the tension, mystery, or unresolved issues the element introduces.
  - Use: Reflect on what uncertainty, challenge, or curiosity this part of the story raises.

- information:
  - Meaning: Focus on observable details, evidence, or facts in the narrative that reveal the element.
  - Use: Examine dialogue, description, or actions that demonstrate the element’s presence or function.

- inferences_and_conclusions:
  - Meaning: Focus on the broader ideas, motifs, or themes highlighted by the element.
  - Use: Connect individual story parts to intellectual, symbolic, or thematic concepts.

- assumptions:
  - Meaning: Focus on the underlying beliefs, expectations, or conventions that support the element.
  - Use: Question implicit ideas, narrative habits, or character/world expectations.

- implications_and_consequences:
  - Meaning: Focus on the potential effects, outcomes, or stakes related to the element.
  - Use: Consider how the element shapes characters, plot direction, or thematic meaning.

- viewpoints_and_perspectives:
  - Meaning: Focus on how different characters, narrators, or audiences might perceive or interpret the element.
  - Use: Explore multiple interpretations or how perception differs depending on perspective.

Quality Standards (for follow-up evaluation and question selection):

- clarity:
  - Meaning: Ensure the user’s response is understandable, unambiguous, and easy to follow.
  - Use: Ask the user to elaborate, illustrate, or restate points to confirm understanding.

- precision:
  - Meaning: Ensure the response provides detailed and specific information.
  - Use: Ask for concrete details, explicit actions, or specific elements in the story.
- accuracy:
  - Meaning: Ensure the response is factually or logically correct within the story world.
  - Use: Verify that actions, descriptions, or events align with established information.

- relevance:
  - Meaning: Ensure the response directly addresses the question or story element under discussion.
  - Use: Check that information contributes meaningfully to plot, character, or theme.

- depth:
  - Meaning: Ensure the response explores complexities and underlying causes rather than surface-level observations.
  - Use: Probe for motivations, conflicts, or thematic layers that enrich understanding.

- breadth:
  - Meaning: Ensure the response considers multiple perspectives or broader narrative contexts.
  - Use: Ask the user to reflect on alternative viewpoints, interpretations, or contexts.

HISTORY & METADATA (what you'll receive)
- The caller will attach the last (up to)10 messages as the short-term history. Each message will be JSON with fields like:
  {
    "role": "user|assistant",
    "content": "...",
    "action": "respond|get_info|get_primary_question|get_follow_up|meta_transition|stage_change|...",
    "category": "...",            # for assistant messages where relevant
    "angle": "...",               # for assistant messages where relevant
    "question_id": "...",         # if that assistant message was a CFM question
    "follow_up_category": "...",  # if action == follow_up
    "timestamp": 1234567890,
    "followUpCount": 0            # optional top-level metadata may be present in the most recent assistant/system messages
  }
- Use `followUpCount`, `asked` lists, and recent `question_id` values from history to avoid repetition and to enforce follow-up limits.

SHORT-TERM HISTORY POLICY
- Default: assume you get 5–10 most recent messages. This range is appropriate: it gives context without overloading prompt size.
- Before you request a follow-up or primary question from the CFM, check the recent messages:
  - If `followUpCount` (from metadata) is >= the configured limit, **do not** request another follow-up. Instead return a `meta_transition` suggesting an angle/category change (with `reasoning`).
  - If a candidate question id appears in the recent `asked` list or recent messages, avoid asking/re-requesting the same question — instead, ask for a different question or suggest a `meta_transition`.

  PENDING DUPLICATE HANDLING:

- If the backend returns an error indicating a pending entity already exists (e.g., 
  "A pending link with the same data already exists"), do NOT attempt to stage again.
- Acknowledge to the user that the entity is already staged and continue the conversation naturally.
- Continue with Socratic questioning, meta-transitions, or other actions — never retry the same stage request.

  
JSON Schemas:

1. respond
{
  "action": "respond",
  "reasoning": "Optional explanation",
  "data": { "message": "Hello! Who would you like to discuss today?" }
}

2. get_info / query
{
  "action": "get_info|query",
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

3. stage_change
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

4. meta_transition
{
  "action": "meta_transition",
  "reasoning": "Explain why transition is needed",
  "data": {
    "type": "angle_to_angle|angle_to_category|category_to_category|confirm_switch|backtrack|closure",
    "new_category": "category being switched to if applicable",
    "new_angle": "angle being switched to if applicable (for example no angle already defined)",
  }
}

5. get_primary_question (request from CFM for primary question)
{
  "action": "get_primary_question",
  "reasoning": "Ask user the primary question for this category and angle",
  "data": {
    "category": "motivation|character|setting|plot|conflict|theme|tone",
    "angle": "goals_and_purposes|questions|information|inferences_and_conclusions|assumptions|implications_and_consequences|viewpoints_and_perspectives"
  }
}

6. get_follow_up (request from CFM for follow-up)
{
  "action": "get_follow_up",
  "reasoning": "Ask user a follow-up question to probe deeper or clarify",
  "data": {
    "category": "clarity|precision|accuracy|relevance|depth|breadth",
  }
}

FILTER RULES (mandatory):

- For nodes (/api/nodes):
  - Allowed filters: 
    - "label": string (this is the name of the node)
    - "group": one of "Person", "Organisation" or "Location"
  - Example:
    { "filters": { "label": ["Alice Johnson", "AJ"] } }

- For links (/api/links):
  - Preferred filter:
    - "participants": string or array (node name(s)). Automatically resolves to matching links.
  - Fallback filters (less common):
    - "node1": string (name)
    - "node2": string (name)
  - Example:
    { "filters": { "participants": ["Alice Johnson", "Bob Smith"] } }

- For events (/api/events):
  - Allowed filters:
    - "description": string (substring match)
  - Example:
    { "filters": { "description": "battle at the docks" } }

- For pending changes (/api/pending-changes):
  - No filters allowed.
  - Example:
    { "requests": [{ "target": "pending_changes" }] }


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

Behavior Guidelines:

- Always return JSON matching the schemas above.
- Include `reasoning` for every action.
- Use `get_info` / `query` to fetch any required entity data before staging.
- Only stage changes when sufficient detail is available.
- Prioritize conversation and Socratic questioning over immediate staging.
- Use follow-ups if user response partially fails Socratic standards.
- Trigger meta-transitions for angle or category shifts, or closure when appropriate.
"""

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
    # Remove triple backticks and optional 'json' label
    match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', raw, re.DOTALL)
    if match:
        clean = match.group(1)
    else:
        clean = raw
    return json.loads(clean)

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

        # If the profile manager explicitly returned an error, propagate it
        if isinstance(data, dict) and "error" in data:
            return {"error": data["error"]}

        # Treat empty results as "no existing data"
        if not data:
            return {"data": []}

        return data

    except requests.HTTPError as e:
        if e.response.status_code == 404:
            # Node/Link/Event not found → return empty instead of error
            return {"data": []}
        return {"error": f"HTTPError {e.response.status_code}: {e.response.text}"}
    except Exception as e:
        return {"error": str(e)}
    
# -------------------- SUMMARIZATION --------------------
async def summarise_and_store(self, deepseek_client, session_id, unsummarised_msgs):
    """
    Summarise unsummarised messages, store the summary, 
    and mark those messages as summarised.

    Returns:
        {
            "new_summary": str,
            "summaries": [str, ...]   # full list of summaries including new one
        }
    """
    if not unsummarised_msgs:
        return {"new_summary": "", "summaries": []}

    # Format unsummarised messages for summarisation
    convo_text = "\n".join(
        f"{m['role'].capitalize()}: {m['content']}" for m in unsummarised_msgs
    )

    # Call Deepseek to generate a summary
    summary_prompt = f"Summarise the following conversation segment:\n\n{convo_text}"
    logger.debug(f"[SUMMARISE] Prompt: {summary_prompt}")
    
    try:
        resp = await deepseek_client.chat.completions.create(
            model="deepseek-reasoner",
            messages=[{"role": "user", "content": summary_prompt}]
        )
        summary_text = resp.choices[0].message.content.strip()
        logger.debug(f"[SUMMARISE] Generated summary: {summary_text}")
    except Exception as e:
        logger.debug("[ERROR] summarise_and_store Deepseek call failed:", e)
        return {"new_summary": "", "summaries": []}

    # --- Store summary in metadata ---
    self.metadata_ref.child("summaries").push(summary_text)

    # --- Mark unsummarised messages as summarised ---
    for m in unsummarised_msgs:
        self.messages_ref.child(m["id"]).update({"summarised": True})

    # --- Fetch updated summaries ---
    summaries_snapshot = self.metadata_ref.child("summaries").get()
    summaries = []
    if summaries_snapshot:
        summaries = [v for _, v in sorted(summaries_snapshot.items())]
    logger.debug(f"[SUMMARISE] Total summaries now: {len(summaries)}")
    return {
        "new_summary": summary_text,
        "summaries": summaries
    }

# -------------------- STAGING --------------------
def process_node_request(req_obj, user_id):
    node = req_obj["newData"]
    node["entity_id"] = generate_entity_id(node["label"])
    resp = requests.post(f"{PROFILE_MANAGER_URL}/stage-change", json={
        "userId": user_id,
        "label": node["label"],
        "entityType": "node",
        "entityId": node["entity_id"],
        "newData": node
    })
    return resp.json()

def process_link_request(req_obj, user_id):
    link = req_obj["newData"]
    resp = requests.post(f"{PROFILE_MANAGER_URL}/stage-change", json={
        "userId": user_id,
        "entityType": "link",
        "entityId": None,
        "newData": {
            "node1": link["node1"],
            "node2": link["node2"],
            "type": link["type"],
            "context": link.get("context", "")
        }
    })
    return resp.json()

def process_event_request(req_obj, user_id):
    event = req_obj["newData"]
    event["entity_id"] = generate_entity_id(event["title"])
    resp = requests.post(f"{PROFILE_MANAGER_URL}/stage-change", json={
        "userId": user_id,
        "entityType": "event",
        "entityId": event["entity_id"],
        "newData": event
    })
    return resp.json()

# -------------------- ACTION HANDLER --------------------
def handle_action(deepseek_response, user_id, recent_msgs, cfm_session, depth = 0):
    if depth > MAX_DEPTH:
        return {"chat_message": "Error: recursion depth exceeded", "requests": []}
    
    action = deepseek_response.get("action")
    reasoning = deepseek_response.get("reasoning", "")
    requests_list = deepseek_response.get("data", {}).get("requests", [])
    result = {"chat_message": "", "requests": requests_list, "staging_results": [], "profile_data": []}

    last_user_msg = recent_msgs[-1]["content"] if recent_msgs else ""

    if action == "respond":
        result["chat_message"] = parse_markdown(deepseek_response.get("data", {}).get("message", ""), "html")
        logger.debug(f"[RESPOND] Message: {result['chat_message']}")

    elif action in ["get_info", "query"]:
        for req in requests_list:
            data = fetch_profile_data(req, user_id)
            logger.debug(f"[GET_INFO] Request: {req}, Response: {data}")
            result["profile_data"].append({"request": req, "data": data})

        logger.debug(f"[GET_INFO] Fetched profile data: {result['profile_data']}")

        # After fetching info, call DeepSeek again with reasoning + data
        if result["profile_data"]:
            info_summary = json.dumps(result["profile_data"], indent=2)
            logger.debug(f"[GET_INFO] Sending info back to DeepSeek: {info_summary}")
            followup_messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"User asked: {last_user_msg}"},
                {"role": "assistant", "content": f"Your reasoning when requesting this info was: {reasoning}"},
                {"role": "system", "content": f"Here is the requested info:\n{info_summary}\n\nIf it is empty, there is no available information. Proceed with this understanding. Respond conversationally based on this."}
            ]
            followup_resp = client.chat.completions.create(
                model="deepseek-chat",
                messages=followup_messages,
                stream=False
            )
            bot_reply_raw = followup_resp.choices[0].message.content.strip()
            try:
                bot_reply_json = parse_deepseek_json(bot_reply_raw)
            except Exception:
                bot_reply_json = {"action": "respond", "data": {"message": bot_reply_raw}}
            result = handle_action(bot_reply_json, user_id, recent_msgs, cfm_session, depth=depth+1)

    elif action == "stage_change":
        logger.debug(f"[STAGE_CHANGE] Requests: {requests_list}")
        staged_summaries = []
        for req in requests_list:
            etype = req.get("entityType")
            if etype == "node":
                staged_summaries.append(process_node_request(req, user_id))
            elif etype == "link":
                staged_summaries.append(process_link_request(req, user_id))
            elif etype == "event":
                staged_summaries.append(process_event_request(req, user_id))
            else:
                staged_summaries.append({"error": f"Unknown entity type: {etype}"})
        result["staging_results"] = staged_summaries
        logger.debug(f"[STAGE_CHANGE] Staged summaries: {staged_summaries}")

        # Feed staging summary back to DeepSeek with reasoning + last user msg
        staged_text = json.dumps(staged_summaries, indent=2)
        followup_messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Earlier user message: {last_user_msg}"},
            {"role": "assistant", "content": f"Reasoning: {reasoning}"},
            {"role": "system", "content": f"The requests you made have been staged: {staged_text}. If they have not been staged, please acknowledge this to the user and continue the conversation naturally. DO NOT try to stage again even if the stage failed."}
        ]
        followup_resp = client.chat.completions.create(
            model="deepseek-chat",
            messages=followup_messages,
            stream=False
        )
        followup_raw = followup_resp.choices[0].message.content.strip()
        try:
            bot_reply_json = parse_deepseek_json(followup_raw)
        except Exception:
            bot_reply_json = {"action": "respond", "data": {"message": followup_raw}}
        followup_result = handle_action(bot_reply_json, user_id, recent_msgs, cfm_session, depth=depth+1)
        result["chat_message"] = followup_result.get("chat_message", "")
        result["requests"].extend(followup_result.get("requests", []))

    elif action in ["get_primary_question", "get_follow_up", "meta_transition"]:
        try:
            if action == "meta_transition":
                llm_next_question_payload = {
                    "action": "meta_transition",
                    "category": deepseek_response["data"].get("new_category"),
                    "angle": deepseek_response["data"].get("new_angle"),
                    "data": deepseek_response["data"]
                }
            else:
                llm_next_question_payload = deepseek_response

            logger.debug(f"[CFM] Action: {action}, Payload: {deepseek_response}")
            next_q = cfm_session.handle_llm_next_question(llm_next_question_payload)
            cfm_question = next_q.get("prompt")
            logger.debug(f"[CFM] Next question from CFM: {cfm_question}")

            followup_messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"User said: {last_user_msg}"},
                {"role": "assistant", "content": f"Your reasoning for requesting the meta_transition was: {reasoning} The category and angle have thus changed, now please reword the raw CFM question for the user. Do NOT output meta_transition, get_follow_up, or any other action — only output a [respond] JSON with the reworded question."},
                {"role": "system", "content": f"Here is a raw CFM question: '{cfm_question}'. Reword it into a conversational style grounded in the reasoning and user context. Always output a respond action."}
            ]
            logger.debug(f"[LLM] Follow-up messages: {followup_messages}")
            followup_resp = client.chat.completions.create(
                model="deepseek-chat",
                messages=followup_messages,
                stream=False
            )
            bot_reply_raw = followup_resp.choices[0].message.content.strip()
            logger.debug(f"[LLM] Raw reworded question: {bot_reply_raw}")

            try:
                bot_reply_json = parse_deepseek_json(bot_reply_raw)
            except Exception:
                bot_reply_json = {"action": "respond", "data": {"message": bot_reply_raw}}
                logger.warning(f"[LLM] Failed to parse JSON, fallback to raw message.")
            result2 = handle_action(bot_reply_json, user_id, recent_msgs, cfm_session, depth=depth+1)
            result["chat_message"] = result2.get("chat_message", "")

        except Exception as e:
            logger.warning(f"[CFM] Error handling CFM question: {e}")
            result["cfm_error"] = str(e)

    return result


# -------------------- CHAT ENDPOINT --------------------
# -------------------- CHAT ENDPOINT --------------------
@app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    user_message = data.get("message")
    user_id = data.get("user_id")
    session_id = data.get("session_id")  # Optional: reuse existing session

    if not user_message or not user_id:
        return jsonify({"error": "Message and user_id are required"}), 400

    # ------------------ CFM SESSION ------------------
    try:
        cfm_session = None
        if session_id:
            session_ref = db.reference(f"chatSessions/{user_id}/{session_id}")
            if session_ref.child("metadata").get():
                cfm_session = DTConversationFlowManager(user_id, session_id)
            else:
                cfm_session = DTConversationFlowManager.create_session(user_id)
                session_id = cfm_session.session_id
                print(f"[WARN] Provided session_id not found. Created new: {session_id}")
        else:
            cfm_session = DTConversationFlowManager.create_session(user_id)
            session_id = cfm_session.session_id
            print(f"[INFO] New session created: {session_id}")
    except Exception as e:
        return jsonify({"error": f"Failed to initialize CFM session: {e}"}), 500

    # ------------------ SUMMARISATION LOGIC ------------------
    try:
        # Get summaries + unsummarised messages
        recent = cfm_session.get_recent_messages(limit=10)
        summaries = recent.get("summaries", [])
        unsummarised = recent.get("unsummarised", [])

        # Count all unsummarised (for max-out check)
        all_unsummarised = cfm_session.get_recent_messages(maxed_out=True)["unsummarised"]

        if len(all_unsummarised) > 10:
            # Time to summarise (on 11th unsummarised message)
            summary_result = cfm_session.summarise_and_store(
                deepseek_client=client,
                session_id=session_id,
                unsummarised_msgs=all_unsummarised
            )
            summaries = summary_result["summaries"]  # overwrite with full list
            unsummarised = []  # reset context after summarisation
            logger.debug("[CHAT] Summarisation triggered.")

        # Build DeepSeek messages
        deepseek_messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        # Add all summaries
        for s in summaries:
            deepseek_messages.append({"role": "system", "content": s})

        # Add unsummarised (short-term context)
        for m in unsummarised:
            msg_payload = {
                "content": m.get("content"),
                "action": m.get("action"),
                "category": m.get("category"),
                "angle": m.get("angle"),
                "follow_up_category": m.get("follow_up_category"),
                "timestamp": m.get("timestamp")
            }
            deepseek_messages.append({
                "role": m.get("role", "assistant"),
                "content": json.dumps(msg_payload)
            })

        # Add new user message last
        deepseek_messages.append({"role": "user", "content": user_message})

        # ------------------ CALL DEEPSEEK ------------------
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=deepseek_messages,
            stream=False
        )
        bot_reply_raw = response.choices[0].message.content.strip()
        logger.debug(f"[DEEPSEEK] Raw: {bot_reply_raw}")

        try:
            bot_reply_json = parse_deepseek_json(bot_reply_raw)
        except Exception:
            bot_reply_json = {"action": "respond", "data": {"message": bot_reply_raw}}
            logger.warning("[DEEPSEEK] JSON parse failed, fallback to respond.")

    except Exception as e:
        logger.warning(f"[CHAT] DeepSeek API error: {e}")
        return jsonify({"error": f"DeepSeek API error: {e}"}), 500

    # ------------------ HANDLE ACTION ------------------
    result = handle_action(bot_reply_json, user_id, unsummarised, cfm_session)

    # ------------------ SAVE ASSISTANT MESSAGE ------------------
    try:
        cfm_session.save_message(
            role="assistant",
            content=result.get("chat_message", ""),
            action=bot_reply_json.get("action"),
            category=bot_reply_json.get("data", {}).get("category"),
            angle=bot_reply_json.get("data", {}).get("angle"),
            follow_up_category=bot_reply_json.get("data", {}).get("category"),
            summarised=False
        )
    except Exception as e:
        logger.warning(f"[CHAT] Failed to save assistant message: {e}")

    result["session_id"] = session_id
    return jsonify(result), 200

# -------------------- RUN SERVER --------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True, threaded=True)