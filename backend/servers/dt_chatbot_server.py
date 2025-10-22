from flask import Flask, Response, request, jsonify
from flask_cors import CORS
import os, json, time, random, hashlib, requests
import markdown, re
import openai
import queue

import logging
from logging.handlers import RotatingFileHandler

import threading, traceback

from utils.cache import get_cache_stats

# Firebase + DTConversationFlowManager
import firebase_admin
from firebase_admin import credentials, db

from utils.DTConversationFlowManager import DTConversationFlowManager

app = Flask(__name__)
CORS(app)

# -------------------- SETUP LOGGING --------------------
from flask import Flask, Response, request, jsonify
from flask_cors import CORS
import os, json, time, random, hashlib, requests
import markdown, re
import openai
import queue

import logging
from logging.handlers import RotatingFileHandler

import threading, traceback

from utils.cache import get_cache_stats

# Firebase + DTConversationFlowManager
import firebase_admin
from firebase_admin import credentials, db

from utils.DTConversationFlowManager import DTConversationFlowManager

app = Flask(__name__)
CORS(app)

# -------------------- SETUP LOGGING --------------------
# Create a logs directory if it doesn't exist
os.makedirs("logs", exist_ok=True)

class EmojiFilter(logging.Filter):
    def filter(self, record):
        record.msg = re.sub(r'[^\x00-\x7F]+', '', str(record.msg))
        return True

log_file = "logs/dt_chat_debug.log"
rotating_handler = RotatingFileHandler(
    log_file,
    mode='a',          # Append to file
    maxBytes=5*1024*1024,  # 5 MB per file
    backupCount=3      # Keep last 3 rotated files
)

# Set log format
formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
rotating_handler.setFormatter(formatter)

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
logger.addHandler(rotating_handler)
logger.addFilter(EmojiFilter())

# Initialize Firebase
cred = credentials.Certificate("../Firebase/structuredcreativeplanning-fdea4acca240.json")
firebase_admin.initialize_app(cred, {
    'databaseURL': "https://structuredcreativeplanning-default-rtdb.firebaseio.com/"
})

# DeepSeek API setup
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
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
2. Only propose staging when sufficient detail is provided. After staging, continue the conversation via a primary question/follow_up/meta-transition/respond as appropriate.
3. When staging, always check if the entity already exists to avoid duplicates. If the staging results state that the change has already been staged/there are duplicates, do not try to stage again. Acknowledge to the user and continue as per rule 2.
4. Always include a `reasoning` field explaining why the action is suggested.
5. Use only names (and optionally aliases) to reference entities; do not generate IDs — the backend handles IDs.
6. Respond in JSON using **exact schemas** that match the Profile Manager API.

Conversation Logic:

- Step 1: Category Selection
    - If no category selected or user requests a shift, select a category.
    - Emit JSON with "meta_transition", type "category_to_category", message explaining choice.
    - Retrieve initial question from CFM for category.

- Step 2: Evaluate User Response
    - Evaluate Socratic quality standards.

            ### STEP 2.1: Length Check
            - **If response < 10 words**: ALWAYS request elaboration (Precision standard)
            - "Could you tell me more about that?"
            - "Can you expand on this idea?"

            ### STEP 2.2: Quality Check (in order)
            Evaluate against standards:

            1. **Clarity**: Can I understand and visualize this?
            - NO → Ask clarity follow-up
            - YES → Continue

            2. **Precision**: Are there sufficient specific details?
            - NO → Ask precision follow-up
            - YES → Continue

            3. **Accuracy**: Does this contradict established facts?
            - YES → Ask accuracy follow-up
            - NO → Continue

            4. **Relevance**: Does this address my question?
            - NO → Ask relevance follow-up
            - YES → Continue

            5. **Depth**: Does this explore underlying complexities?
            - NO → Ask depth follow-up
            - YES → Continue

            6. **Breadth**: Are multiple perspectives considered?
            - NO → Ask breadth follow-up
            - YES → Proceed to angle transition

            ### STEP 2.3: Follow-up Limit Check
            - If `followUpCount >= 2`: FORCE meta-transition (angle or category shift)
            - Include bridge prompt explaining the shift
            - Reset follow-up 
            
    - If all pass:
        - Select new angle based on Eight Elements of Reasoning.
        - Emit JSON with "meta_transition", type "angle_to_angle".
        - Provide bridge prompt: "Now that we've explored [X], let's consider [Y]..."
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

# Core Principles

1. **Analyze Thought (Parts of Thinking)**: Break down story elements using the Eight Elements of Reasoning
2. **Assess Thought (Quality Standards)**: Evaluate responses using Universal Intellectual Standards
3. **Scaffold Questions**: Provide context and bridges between questions
4. **Track Progress**: Maintain conversation depth and avoid repetition

---

# Eight Elements of Reasoning (Angles)

Use these to frame primary questions about any story element:

## 1. goals_and_purposes
**Meaning**: What the element is trying to achieve in the story
**Use**: Probe function, intent, role in advancing plot/theme/character
**Example Questions**:
- "What is [character]'s main purpose in this scene/story?"
- "What are you trying to accomplish with this plot point?"

## 2. questions
**Meaning**: Tension, mystery, or unresolved issues the element introduces
**Use**: Explore uncertainty, challenge, curiosity the story raises
**Example Questions**:
- "What question does this conflict raise for the reader?"
- "What tension remains unresolved?"

## 3. information
**Meaning**: Observable details, evidence, facts in the narrative
**Use**: Examine dialogue, description, actions that demonstrate the element
**Example Questions**:
- "What specific details show us this character trait?"
- "What evidence in the story supports this theme?"

## 4. inferences_and_conclusions
**Meaning**: Broader ideas, motifs, themes highlighted by the element
**Use**: Connect story parts to intellectual/symbolic/thematic concepts
**Example Questions**:
- "What does this event suggest about human nature?"
- "What larger theme emerges from this pattern?"

## 5. assumptions
**Meaning**: Underlying beliefs, expectations, conventions supporting the element
**Use**: Question implicit ideas, narrative habits, world expectations
**Example Questions**:
- "What are you assuming about how this world works?"
- "What conventions are you relying on that might need questioning?"

## 6. implications_and_consequences
**Meaning**: Potential effects, outcomes, stakes related to the element
**Use**: Consider how element shapes characters, plot, theme
**Example Questions**:
- "If this happens, what are the consequences for [character]?"
- "What does this choice imply about [character]'s values?"

## 7. viewpoints_and_perspectives
**Meaning**: How different characters/readers might interpret the element
**Use**: Explore multiple interpretations and perception differences
**Example Questions**:
- "How would [other character] view this event?"
- "From the antagonist's perspective, what's their justification?"

---

# Universal Intellectual Standards (Follow-up Categories)

Use these to assess and improve response quality. CRITICAL: Apply these standards to determine if a follow-up is needed.

## 1. clarity
**What it means**: Response is understandable, unambiguous, easy to follow
**When to probe**: 
- Vague language ("sort of," "kind of," "you know")
- Unclear pronouns or references
- Abstract without concrete examples
**Follow-up triggers**:
- Response lacks specific details
- You can't visualize what they're describing
**Example questions**:
- "Could you elaborate on what you mean by [vague term]?"
- "Can you give me a concrete example of how this plays out?"
- "I'm hearing you say ____. Is that correct, or did I misunderstand?"

## 2. precision
**What it means**: Response provides detailed, specific information
**When to probe**:
- Generalities without specifics ("she's upset," "things happen")
- Missing key details (when, where, how, who)
- Quantifiable claims without numbers/measurements
**Follow-up triggers**:
- Response under 10 words
- Answer uses only general terms
**Example questions**:
- "Could you be more specific about what exactly happens?"
- "What are the precise details of this interaction?"
- "Can you walk me through this step-by-step?"

## 3. accuracy
**What it means**: Response is factually/logically correct within story world
**When to probe**:
- Contradicts earlier established facts
- Internally inconsistent logic
- Violates story world rules
**Follow-up triggers**:
- Claim seems to contradict previous information
- Logic doesn't follow established story rules
**Example questions**:
- "How does this align with what you said earlier about [X]?"
- "Is this consistent with the rules of your story world?"
- "Does this action make sense given [character]'s established traits?"

## 4. relevance
**What it means**: Response directly addresses the question asked
**When to probe**:
- Tangential information
- Avoids the core question
- Changes subject
**Follow-up triggers**:
- Answer doesn't connect to the question
- Brings up unrelated story elements
**Example questions**:
- "I don't see how that connects to [question]. Could you clarify the link?"
- "That's interesting, but how does it relate to [character]'s motivation?"
- "Let's return to the original question: [restate question]"

## 5. depth
**What it means**: Response explores complexities, not surface-level observations
**When to probe**:
- Single-cause explanations for complex situations
- Ignores nuance or complications
- Oversimplified character motivations
**Follow-up triggers**:
- Answer treats complex issue as simple
- Missing layers of meaning
**Example questions**:
- "What complexities are we not considering?"
- "Is there more to this than [surface explanation]?"
- "What underlying factors contribute to this?"

## 6. breadth
**What it means**: Response considers multiple viewpoints/perspectives
**When to probe**:
- Single perspective on multi-faceted issue
- Ignores other characters' viewpoints
- Narrow framing of situation
**Follow-up triggers**:
- Only one character's perspective considered
- Ignores alternative interpretations
**Example questions**:
- "How would [other character] see this situation?"
- "What's an alternative way to interpret this event?"
- "Have we considered this from [perspective] angle?"

---

REWRITING RULES (mandatory)
- When you RECEIVE a CFM question object (from get_primary_question or get_follow_up):
   1. Reword the raw question into a conversational style prompt.
   2. Always output a "respond" action with the reworded version.
   3. Ground your rewording in the previous messages and any context already retrieved (via get_info, etc.).
  4. Provide the JSON action `respond` with `data.message` containing the conversational prompt.
- Examples:
  - Raw CFM question: "What kind of past experiences, personal history, or special knowledge do you think influence the choices this character makes?"
  - Reworded (good): "Got it — you want to talk about Akio. Do you have any background or experiences in mind that shape how he behaves or decides things?"


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

2. get_info / query (NEVER output just get_info/stage_change without a respond action. The user must always get a conversational message.)
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

# Metadata Tracking

You will receive metadata like:
```json
{
  "currentCategory": "motivation",
  "currentAngle": "goals_and_purposes",
  "followUpCount": 1,
  "asked": [
    {"id": "q123", "category": "motivation", "angle": "goals_and_purposes"},
    ...
  ]
}
```

Use this to:
- Avoid repeating recent questions (check `asked` list)
- Enforce follow-up limits (check `followUpCount`)
- Provide context in bridge prompts (reference `currentCategory/Angle`)

---

# Critical Rules

1. **NEVER skip scaffolding** - Every question needs context
2. **ALWAYS check response length** - <10 words = automatic elaboration request
3. **ENFORCE follow-up limit** - After 2 follow-ups, MUST transition
4. **PROVIDE bridge prompts** - Never abruptly change topics
5. **TRACK question IDs** - Never repeat questions in recent history (last 5)
6. **ONE respond action per turn** - User must always get conversational message

---

# Example Exchange

**User**: "I want to talk about my character Marcus."

**You** (get_primary_question for goals_and_purposes):
```json
{
  "action": "get_primary_question",
  "reasoning": "Initial topic establishment. Starting with goals_and_purposes to understand character's core drive.",
  "data": {"category": "character", "angle": "goals_and_purposes"}
}
```

**CFM Returns**: "What does this character want?"

**You** (respond with scaffolding):
```json
{
  "action": "respond",
  "reasoning": "Rewording CFM question with context",
  "data": {
    "message": "Great! Let's explore Marcus together. Understanding what a character wants is foundational to everything they do in the story. What does Marcus want more than anything else?"
  }
}
```

**User**: "Revenge."

**You** (too short - precision follow-up):
```json
{
  "action": "get_follow_up",
  "reasoning": "Response only 1 word. Lacks precision - need specific details about the revenge.",
  "data": {"category": "precision"}
}
```

**CFM Returns**: "Could you be more specific?"

**You** (respond with scaffolding):
```json
{
  "action": "respond",
  "reasoning": "Rewording follow-up with acknowledgment",
  "data": {
    "message": "Revenge is a powerful motivator. To make this compelling, I need more details. What specifically does Marcus want revenge for, and against whom?"
  }
}
```

**User**: "He wants revenge against the corrupt politician who killed his brother and framed it as an accident."

**You** (sufficient - transition to new angle):
```json
{
  "action": "get_primary_question",
  "reasoning": "Response meets all standards. Transitioning from goals_and_purposes to assumptions to probe underlying beliefs.",
  "data": {"category": "character", "angle": "assumptions"}
}
```

**You** (respond with bridge):
```json
{
  "action": "respond",
  "data": {
    "message": "That's a clear, powerful goal - exposing truth and seeking justice for his brother. Now let's examine what Marcus assumes about revenge: [CFM question reworded]"
  }
}
```

FILTER RULES (mandatory):

- For nodes (/api/nodes):
  - Allowed filters: 
    - "label": string (this is the name of the node)
    - "group": one of "Person", "Organization" or "Location"
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

def background_handle_action(actions, user_id, deepseek_messages, cfm_session):
    """
    Run heavy background updates asynchronously and report status to Firebase.
    
    CRITICAL: This should NEVER handle 'respond' actions - those must be in main thread.
    """
    thread_start = time.time()
    task_ref = db.reference(f"backgroundTasks/{user_id}")
    task_id = str(int(time.time() * 1000))  # Use milliseconds for uniqueness

    def update_status(status, message):
        """Update Firebase with current task status."""
        try:
            db.reference(f"backgroundTasks/{user_id}/{task_id}").update({
                "status": status,
                "message": message,
                "updatedAt": time.time()
            })
            logger.debug(f"[THREAD] Status update: {status} - {message}")
        except Exception as e:
            logger.error(f"[THREAD] Failed to update status: {e}")

    # Validate no respond actions snuck in
    respond_count = sum(1 for act in actions if isinstance(act, dict) and act.get("action") == "respond")
    if respond_count > 0:
        logger.error(f"[THREAD] CRITICAL: {respond_count} respond actions found in background thread! This should never happen.")
        update_status("error", "Internal error: respond action in background thread")
        return

    try:
        update_status("processing", f"Starting background task with {len(actions)} actions...")
        logger.info(f"[THREAD] Background thread started with {len(actions)} actions")

        # Process each action
        for i, act in enumerate(actions):
            action_name = act.get("action", "unknown") if isinstance(act, dict) else "unknown"
            logger.debug(f"[THREAD] Processing action {i+1}/{len(actions)}: {action_name}")
            
            action_start = time.time()
            try:
                handle_action(
                    act, 
                    user_id, 
                    deepseek_messages, 
                    cfm_session,
                    update_status=update_status
                )
                action_time = time.time() - action_start
                logger.info(f"[THREAD] Completed action {action_name} in {action_time:.3f}s")
            except Exception as e:
                logger.error(f"[THREAD] Action {action_name} failed: {e}\n{traceback.format_exc()}")
                update_status("error", f"Action {action_name} failed: {str(e)}")
                # Continue processing other actions
                continue
        
        update_status("done", f"All {len(actions)} actions processed successfully")

        # Mark as done in Firebase
        task_ref.child(task_id).update({
            "status": "done",
            "finishedAt": time.time(),
            "actionCount": len(actions)
        })
        
        thread_time = time.time() - thread_start
        logger.info(f"[THREAD] Background thread completed in {thread_time:.3f}s")

    except Exception as e:
        thread_time = time.time() - thread_start
        logger.error(f"[THREAD] Background thread crashed after {thread_time:.3f}s: {e}\n{traceback.format_exc()}")
        update_status("error", f"Error: {e}")
        task_ref.child(task_id).update({
            "status": "error",
            "error": str(e),
            "finishedAt": time.time(),
        })

def append_system_message(history_msgs, content):
    """
    history_msgs: list of dicts with at least keys 'role' and 'content'
    returns new list with system message appended (non-mutating preferred)
    """
    # ensure copy
    h = list(history_msgs) if history_msgs else []
    h.append({
        "role": "system",
        "content": content,
        "timestamp": int(time.time() * 1000)
    })
    return h

def history_has_successful_staging(history):
    """
    Returns True only if a successful STAGING RESULT (no errors) 
    has been logged in the conversation history.
    """
    for entry in history:
        if isinstance(entry, dict) and "STAGING RESULT" in entry.get("content", ""):
            # If "error" appears in that content, it's a failed staging → don't block retry
            if "error" not in entry["content"].lower():
                return True
    return False

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
    """
    Parse one or more JSON objects from a DeepSeek response.
    Returns a list of parsed JSON objects.
    """
    # Capture all fenced JSON blocks
    matches = re.findall(r'```(?:json)?\s*(\{.*?\})\s*```', raw, re.DOTALL)

    results = []
    if matches:
        for m in matches:
            try:
                results.append(json.loads(m))
            except json.JSONDecodeError as e:
                # Log or skip malformed blocks
                print(f"[WARNING] Failed to parse JSON block: {e}")
    else:
        # Fallback: try to parse the whole raw as JSON
        try:
            results.append(json.loads(raw))
        except json.JSONDecodeError:
            pass

    return results

def normalize_deepseek_response(parsed):
    """
    Normalize DeepSeek parser output so handle_action
    always works with a dict (single action).
    - If parsed is already a dict, return it.
    - If parsed is a list with one element, return that element.
    - If parsed is a list with multiple elements, execute them sequentially
      by recursively calling handle_action, returning the last result.
    """
    if isinstance(parsed, dict):
        return parsed
    if isinstance(parsed, list):
        if len(parsed) == 1:
            return parsed[0]
        # If multiple, just return list and let caller loop
        return parsed
    return {"action": "respond", "data": {"message": str(parsed)}}

def generate_entity_id(name):
    return hashlib.sha256(name.encode("utf-8")).hexdigest()

def fetch_profile_data_batch(requests_list, user_id):
    """
    Fetch multiple profile requests in a single batch call.
    Falls back to sequential if batch fails.
    """
    if not requests_list:
        return []
    
    logger.debug(f"[BATCH] Attempting batch fetch for {len(requests_list)} requests")
    batch_start = time.time()
    
    try:
        # Attempt batch request
        batch_payload = {
            "userId": user_id,
            "requests": requests_list
        }
        
        response = requests.post(
            f"{PROFILE_MANAGER_URL}/batch",
            json=batch_payload,
            timeout=15.0  # Longer timeout for batch
        )
        response.raise_for_status()
        
        batch_data = response.json()
        batch_time = time.time() - batch_start
        logger.info(f"[TIMING] Batch fetch took {batch_time:.3f}s for {len(requests_list)} requests")
        
        # Parse results
        results = batch_data.get("results", [])
        
        if len(results) != len(requests_list):
            logger.warning(f"[BATCH] Result count mismatch: expected {len(requests_list)}, got {len(results)}")
        
        # Build response in same format as sequential
        profile_data = []
        for i, req in enumerate(requests_list):
            if i < len(results):
                result = results[i]
                profile_data.append({
                    "request": req,
                    "data": result.get("data") if "data" in result else {"error": result.get("error")}
                })
            else:
                profile_data.append({
                    "request": req,
                    "data": {"error": "No result returned"}
                })
        
        return profile_data
        
    except requests.Timeout:
        logger.warning(f"[BATCH] Batch request timed out after {time.time() - batch_start:.3f}s, falling back to sequential")
        return fetch_profile_data_sequential(requests_list, user_id)
        
    except requests.HTTPError as e:
        logger.warning(f"[BATCH] Batch request failed with HTTP {e.response.status_code}, falling back to sequential")
        return fetch_profile_data_sequential(requests_list, user_id)
        
    except Exception as e:
        logger.exception(f"[BATCH] Batch request failed: {e}, falling back to sequential")
        return fetch_profile_data_sequential(requests_list, user_id)


def fetch_profile_data_sequential(requests_list, user_id):
    """
    Fallback: fetch profile requests sequentially (original behavior).
    """
    logger.debug(f"[SEQUENTIAL] Fetching {len(requests_list)} requests sequentially")
    sequential_start = time.time()
    
    profile_data = []
    for req in requests_list:
        try:
            data = fetch_profile_data(req, user_id)  # Original single-request function
            profile_data.append({"request": req, "data": data})
        except Exception as e:
            logger.error(f"[SEQUENTIAL] Request failed: {e}")
            profile_data.append({"request": req, "data": {"error": str(e)}})
    
    sequential_time = time.time() - sequential_start
    logger.info(f"[TIMING] Sequential fetch took {sequential_time:.3f}s for {len(requests_list)} requests")
    
    return profile_data

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

# -------------------- STAGING --------------------
def process_node_request(req_obj, user_id):
    node = req_obj["newData"]
    if not node.get("label"):
        if node.get("identifier"):
            logger.debug("[STAGING] No label provided, using identifier as label.")
            node["label"] = node["identifier"]
        else:
            return {"error": "Node creation or update requires a label or identifier"}

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

# -------------------- ACTION HANDLER DEEPTHINKING --------------------
def handle_action(deepseek_response, user_id, recent_msgs, cfm_session, depth=0, update_status=None):
    action_start = time.time()  # START TIMING
    logger.debug(f"[ACTION] handle_action called at depth={depth}")
    
    if depth > MAX_DEPTH:
        logger.warning("[ACTION] Max recursion depth reached, aborting further handling")
        return {"chat_message": "Error: recursion depth exceeded", "requests": []}
    
    # Normalize response to single dict if needed
    if isinstance(deepseek_response, list):
        results = []
        for obj in deepseek_response:
            results.append(handle_action(obj, user_id, recent_msgs, cfm_session, depth=depth + 1))
        # Merge all results
        merged = {"chat_message": "", "requests": [], "staging_results": [], "profile_data": []}
        for r in results:
            if r.get("chat_message"):
                merged["chat_message"] += r["chat_message"] + "\n"
            merged["requests"].extend(r.get("requests", []))
            merged["staging_results"].extend(r.get("staging_results", []))
            merged["profile_data"].extend(r.get("profile_data", []))
        return merged
    
    if not isinstance(deepseek_response, dict):
        logger.error(f"[ACTION] Unexpected deepseek_response type: {type(deepseek_response)}")
        return {"chat_message": "", "requests": [], "staging_results": [], "profile_data": []}

    action = deepseek_response.get("action")
    reasoning = deepseek_response.get("reasoning", "")
    requests_list = deepseek_response.get("data", {}).get("requests", [])
    
    result = {
        "chat_message": "",
        "requests": requests_list,
        "staging_results": [],
        "profile_data": []
    }

    last_user_msg = recent_msgs[-1]["content"] if recent_msgs else ""

    # CRITICAL: CFM question actions should NOT be here - they're handled in main thread
    if action in ["get_primary_question", "get_follow_up", "meta_transition", "respond"]:
        logger.warning(f"[ACTION] Unexpected action '{action}' in background thread - should be handled in main thread")
        return result

    if action in ["get_info", "query"]:
        if update_status:
            update_status("processing", "Retrieving information from story database...")
        
        logger.debug(f"[GET_INFO] Requests: {requests_list}")

        info_start = time.time()

        if len(requests_list) > 1:
            # Batch for multiple requests
            profile_data_list = fetch_profile_data_batch(requests_list, user_id)
            result["profile_data"] = profile_data_list
            logger.debug(f"[GET_INFO] Batch fetched {len(profile_data_list)} results")
        else:
            # Single request fallback
            for req in requests_list:
                data = fetch_profile_data(req, user_id)
                result["profile_data"].append({"request": req, "data": data})
                logger.debug(f"[GET_INFO] Single fetch: {req}")
        
        info_time = time.time() - info_start
        logger.info(f"[TIMING] Profile data fetch took {info_time:.3f}s for {len(requests_list)} requests")
        
        if result["profile_data"]:
            info_summary = json.dumps(result["profile_data"], indent=2)
            followup_messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"User asked: {last_user_msg}"},
                {"role": "assistant", "content": f"Your reasoning when requesting this info was: {reasoning}"},
                {"role": "system", "content": f"Here is the requested info:\n{info_summary}\n\nIf it is empty, there is no available information. Proceed with this understanding. Respond conversationally based on this."}
            ]

            followup_start = time.time()
            followup_resp = client.chat.completions.create(
                model="deepseek-chat",
                messages=followup_messages,
                stream=False
            )
            followup_time = time.time() - followup_start
            logger.info(f"[TIMING] Follow-up DeepSeek call took {followup_time:.3f}s")

            bot_reply_raw = followup_resp.choices[0].message.content.strip()
            
            parse_start = time.time()
            try:
                bot_reply_json = parse_deepseek_json(bot_reply_raw)
                bot_reply_json = normalize_deepseek_response(bot_reply_json)
                logger.debug(f"[HANDLE ACTION] [PROFILE DATA] Parsed JSON: {bot_reply_json}")
            except Exception:
                bot_reply_json = {"action": "respond", "data": {"message": bot_reply_raw}}
                logger.warning("[HANDLE ACTION] [PROFILE DATA] JSON parse failed, fallback to respond.")
            
            parse_time = time.time() - parse_start
            logger.info(f"[TIMING] Response parsing took {parse_time:.3f}s")

            followup_result = handle_action(bot_reply_json, user_id, recent_msgs, cfm_session, depth=depth+1, update_status=update_status)
            result = followup_result

    elif action == "stage_change":
        logger.debug(f"[STAGE_CHANGE] Requests: {requests_list}")
        
        if update_status:
            update_status("processing", "Staging changes to story database...")

        staging_start = time.time()
        staged_summaries = []
        duplicate_detected = False

        for req in requests_list:
            etype = req.get("entityType")
            if etype == "node":
                resp = process_node_request(req, user_id)
            elif etype == "link":
                resp = process_link_request(req, user_id)
            elif etype == "event":
                resp = process_event_request(req, user_id)
            else:
                resp = {"error": f"Unknown entityType {etype}"}

            if isinstance(resp, dict) and "error" in resp:
                if "pending" in resp["error"].lower() or "already exists" in resp["error"].lower():
                    logger.debug(f"[STAGE_CHANGE] Duplicate detected: {resp['error']}")
                    duplicate_detected = True

            staged_summaries.append(resp)

        staging_time = time.time() - staging_start
        logger.info(f"[TIMING] Staging operations took {staging_time:.3f}s")

        for s in staged_summaries:
            cfm_session.save_message(
                "system",
                f"STAGING RESULT: {json.dumps(s)}",
                action="stage_result",
                visible=False
            )

        result["staging_results"] = staged_summaries

        summary = json.dumps(staged_summaries, indent=2)
        followup_messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "assistant", "content": f"Your reasoning when requesting this stage change was: {reasoning}"},
            {"role": "system", "content": f"Changes staged successfully. Proceed conversationally based on this."}
        ]

        followup_start = time.time()
        try:
            followup_resp = client.chat.completions.create(
                model="deepseek-chat",
                messages=followup_messages,
                stream=False
            )
            followup_time = time.time() - followup_start
            logger.info(f"[TIMING] Follow-up DeepSeek call took {followup_time:.3f}s")

            bot_reply_raw = followup_resp.choices[0].message.content.strip()
            logger.debug(f"[LLM] Raw staging follow-up: {bot_reply_raw}")

            parse_start = time.time()
            try:
                bot_reply_json = parse_deepseek_json(bot_reply_raw)
                bot_reply_json = normalize_deepseek_response(bot_reply_json)
                logger.debug(f"[HANDLE ACTION] [STAGE_CHANGE] Parsed JSON: {bot_reply_json}")
            except Exception:
                bot_reply_json = {"action": "respond", "data": {"message": bot_reply_raw}}
                logger.warning("[HANDLE ACTION] [STAGE_CHANGE] JSON parse failed, fallback to respond.")
            
            parse_time = time.time() - parse_start
            logger.info(f"[TIMING] Response parsing took {parse_time:.3f}s")

            followup_result = handle_action(bot_reply_json, user_id, recent_msgs, cfm_session, depth=depth+1, update_status=update_status)
            result.update(followup_result)

        except Exception as e:
            logger.warning(f"[STAGE_CHANGE] Error triggering follow-up: {e}")
            if duplicate_detected:
                result["chat_message"] = "That entity is already staged and pending confirmation. I'll note it and we can continue the conversation."
            else:
                result["chat_message"] = "I staged the requested changes. Let's continue."

    action_time = time.time() - action_start
    logger.info(f"[TIMING] handle_action completed in {action_time:.3f}s at depth={depth}")
    
    return result

# -------------------- CHAT ENDPOINT --------------------
@app.route("/chat", methods=["POST"])
def chat():
    request_start = time.time()  # START TIMING
    logger.info(f"[CHAT] Incoming request: {request.json}")
    data = request.json
    user_message = data.get("message")
    user_id = data.get("user_id")
    session_id = data.get("session_id")

    if not user_message or not user_id:
        return jsonify({"error": "Message and user_id are required"}), 400

    # ------------------ CFM SESSION ------------------
    try:
        session_init_start = time.time()
        cfm_session = None
        if session_id:
            session_ref = db.reference(f"chatSessions/{user_id}/{session_id}")
            if session_ref.child("metadata").get():
                cfm_session = DTConversationFlowManager(user_id, session_id)
            else:
                cfm_session = DTConversationFlowManager.create_session(user_id)
                session_id = cfm_session.session_id
                logger.info(f"[WARN] Provided session_id not found. Created new: {session_id}")
        else:
            cfm_session = DTConversationFlowManager.create_session(user_id)
            session_id = cfm_session.session_id
            logger.info(f"[INFO] New session created: {session_id}")
        
        session_init_time = time.time() - session_init_start
        logger.info(f"[TIMING] Session init took {session_init_time:.3f}s")
    except Exception as e:
        return jsonify({"error": f"Failed to initialize CFM session: {e}"}), 500

    # ------------------ SAVE USER MESSAGE ------------------
    try:
        cfm_session.save_message(
            role="user",
            content=user_message,
            summarised=False,
            visible=True
        )
    except Exception as e:
        logger.warning(f"Failed to save incoming user message: {e}")

    # ------------------ SUMMARISATION ------------------
    try:
        summary_start = time.time()
        recent = cfm_session.get_recent_messages(limit=KEEP_LAST_N)
        summaries = recent.get("summaries", [])
        unsummarised = recent.get("unsummarised", [])
        all_unsummarised = cfm_session.get_recent_messages(maxed_out=True)["unsummarised"]

        summary_time = time.time() - summary_start
        logger.info(f"[TIMING] Summary fetch took {summary_time:.3f}s")

        # Only summarize if we have 10+ unsummarised messages
        if len(all_unsummarised) > KEEP_LAST_N + 10:
            to_summarise = all_unsummarised[:-KEEP_LAST_N]
            logger.debug(f"Summarising {len(to_summarise)} older messages")
            
            # Move summarization to background thread
            threading.Thread(
                target=lambda: cfm_session.summarise_and_store(
                    deepseek_client=client,
                    session_id=session_id,
                    unsummarised_msgs=to_summarise
                ),
                daemon=True
            ).start()

            logger.debug("[SUMMARISATION] Started background summarization thread")

        # Build DeepSeek messages
        deepseek_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for s in summaries:
            deepseek_messages.append({"role": "system", "content": s})
        for m in unsummarised:
            deepseek_messages.append({"role": m.get("role", "assistant"), "content": m.get("content")})
        deepseek_messages.append({"role": "user", "content": user_message})

        # ------------------ CALL DEEPSEEK ------------------
        llm_start = time.time()
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=deepseek_messages,
            stream=False
        )
        llm_duration = time.time() - llm_start
        logger.info(f"[TIMING] DeepSeek API call took {llm_duration:.3f}s")
        
        bot_reply_raw = response.choices[0].message.content.strip()
        logger.info(f"[LLM] Raw response: {bot_reply_raw}")
        
        parse_start = time.time()
        parsed = parse_deepseek_json(bot_reply_raw)
        bot_reply_json_list = parsed or [{"action": "respond", "data": {"message": bot_reply_raw}}]
        
        # Separate actions by type
        respond_actions = []
        cfm_question_actions = []  # Actions that need immediate CFM response
        background_actions = []     # True background actions
        
        for obj in bot_reply_json_list:
            if isinstance(obj, dict):
                action_type = obj.get("action")
                
                if action_type == "respond":
                    respond_actions.append(obj)
                elif action_type in ["get_primary_question", "get_follow_up", "meta_transition"]:
                    # These need immediate processing
                    cfm_question_actions.append(obj)
                else:
                    # get_info, stage_change, query, etc.
                    background_actions.append(obj)
        
        parse_time = time.time() - parse_start
        logger.info(f"[TIMING] Response parsing took {parse_time:.3f}s")
        logger.info(f"[CHAT] Found {len(respond_actions)} respond, {len(cfm_question_actions)} CFM questions, {len(background_actions)} background actions")
        
        # ------------------ GENERATE IMMEDIATE RESPONSE ------------------
        chat_message = None
        
        # Priority 1: Explicit respond actions
        for obj in respond_actions:
            msg = obj.get("data", {}).get("message", "")
            if msg:
                chat_message = parse_markdown(msg, "html")
                logger.info(f"[CHAT] Using explicit respond action")
                break
        
        # Priority 2: Process CFM question actions immediately
        if not chat_message and cfm_question_actions:
            logger.info(f"[CHAT] Processing {len(cfm_question_actions)} CFM question action(s) for immediate response")
            
            for cfm_action in cfm_question_actions:
                try:
                    action_type = cfm_action.get("action")
                    reasoning = cfm_action.get("reasoning", "")
                    
                    logger.debug(f"[CFM] Processing {action_type}")
                    
                    # Get question from CFM
                    cfm_result = cfm_session.handle_llm_next_question(cfm_action)
                    logger.debug(f"[CFM] CFM returned: {cfm_result}")
                    
                    # Extract raw question
                    raw_question = None
                    question_context = {}
                    selected = None  # Track which question was selected
                    
                    if cfm_result.get("type") == "primary":
                        raw_question = cfm_result.get("prompt")
                        question_context = {
                            "type": "primary",
                            "category": cfm_result.get("category"),
                            "angle": cfm_result.get("angle"),
                            "question_id": cfm_result.get("question_id")
                        }
                    
                    elif cfm_result.get("type") == "follow_up":
                        pool = cfm_result.get("pool", [])
                        if pool:
                            selected = random.choice(pool)
                            raw_question = selected.get("prompt")
                            question_context = {
                                "type": "follow_up",
                                "category": cfm_result.get("category"),
                                "question_id": selected.get("id")
                            }
                    
                    elif cfm_result.get("type") == "meta_transition":
                        pool = cfm_result.get("pool", [])
                        if pool:
                            selected = random.choice(pool)
                            raw_question = selected.get("prompt")
                        else:
                            raw_question = "Let's explore this from a different angle."
                        
                        question_context = {
                            "type": "meta_transition",
                            "transition_type": cfm_result.get("transition_type"),
                            "currentCategory": cfm_result.get("currentCategory"),
                            "currentAngle": cfm_result.get("currentAngle"),
                            "reason": cfm_result.get("reason", ""),
                            "question_id": selected.get("id") if selected else None
                        }
                    
                    if not raw_question:
                        logger.warning(f"[CFM] No question available from CFM result")
                        continue
                    
                    logger.debug(f"[CFM] Raw question: {raw_question[:100]}...")
                    
                    # === TRACK THE QUESTION IN METADATA ===
                    try:
                        metadata = cfm_session.get_metadata()
                        asked = metadata.get("asked", [])
                        
                        if cfm_result.get("type") == "primary":
                            asked.append({
                                "id": cfm_result.get("question_id"),
                                "action": "new_category",
                                "category": cfm_result.get("category"),
                                "angle": cfm_result.get("angle"),
                                "prompt": raw_question[:100]
                            })
                            
                            cfm_session.update_metadata({
                                "asked": asked,
                                "depth": metadata.get("depth", 0) + 1,
                                "followUpCount": 0,
                                "currentCategory": cfm_result.get("category"),
                                "currentAngle": cfm_result.get("angle")
                            })
                            logger.debug(f"[TRACKING] Logged primary question")
                        
                        elif cfm_result.get("type") == "follow_up" and selected:
                            asked.append({
                                "id": selected.get("id"),
                                "action": "follow_up",
                                "category": cfm_result.get("category"),
                                "prompt": raw_question[:100]
                            })
                            
                            cfm_session.update_metadata({
                                "asked": asked,
                                "depth": metadata.get("depth", 0) + 1,
                                "followUpCount": metadata.get("followUpCount", 0) + 1
                            })
                            logger.debug(f"[TRACKING] Logged follow-up")
                        
                        elif cfm_result.get("type") == "meta_transition" and selected:
                            asked.append({
                                "id": selected.get("id"),
                                "action": "meta_transition",
                                "transition_type": cfm_result.get("transition_type"),
                                "prompt": raw_question[:100]
                            })
                            
                            cfm_session.update_metadata({
                                "asked": asked,
                                "depth": metadata.get("depth", 0) + 1,
                                "followUpCount": 0
                            })
                            logger.debug(f"[TRACKING] Logged meta-transition")
                    
                    except Exception as e:
                        logger.warning(f"[TRACKING] Failed to track question: {e}")
                    # === END TRACKING ===
                    
                    # Build context for rewording
                    recent_context = []
                    for m in deepseek_messages[-5:]:
                        if m.get("role") in ["user", "assistant"]:
                            recent_context.append({
                                "role": m.get("role"),
                                "content": m.get("content")[:150]
                            })
                    
                    # Build rewording prompt with category transition instructions
                    reword_prompt = f"""You are helping with Socratic dialogue. You've received this question from the question bank:

                        "{raw_question}"

                        Context: {json.dumps(question_context, indent=2)}

                        Your reasoning for asking this: {reasoning}

                        Recent conversation:
                        {json.dumps(recent_context, indent=2)}

                        TASK: Reword this question into a natural, conversational prompt that:
                        1. Includes scaffolding (context/explanation BEFORE the question)
                        2. If this is a transition, includes a bridge that acknowledges previous discussion
                        3. Sounds warm and encouraging, not robotic
                        4. Is appropriate given the conversation flow
                        """

                    # Add special instructions for category transitions
                    if question_context.get("type") == "meta_transition":
                        transition_type = question_context.get("transition_type", "")
                        
                        if "category" in transition_type:
                            reword_prompt += """

                                CRITICAL - CATEGORY TRANSITION: This is a shift to a NEW CATEGORY. You MUST:
                                1. Acknowledge what we've explored in the previous category/topic
                                2. EXPLICITLY explain WHY we're moving to this new category
                                3. Name the new category clearly (e.g., "Let's shift to CHARACTER development...")
                                4. Explain the VALUE of exploring this new aspect

                                Example: "We've built a strong understanding of your story's CONFLICT. Now let's shift our focus to CHARACTER development, because understanding who your characters are will show us how they navigate these conflicts..."
                                """
                        elif "angle" in transition_type:
                            reword_prompt += """

                                ANGLE TRANSITION: This explores the same topic from a new angle. You MUST:
                                1. Acknowledge the specific details from the previous discussion
                                2. Use bridge language like "Now that we've explored X, let's consider Y..."
                                3. Explain how this new angle builds on what we've discussed
                                """

                    reword_prompt += "\n\nRespond with ONLY the conversational prompt text - no JSON, no formatting, just the text the user should see."
                    
                    reword_messages = [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": reword_prompt}
                    ]
                    
                    reword_start = time.time()
                    reword_resp = client.chat.completions.create(
                        model="deepseek-chat",
                        messages=reword_messages,
                        stream=False,
                        temperature=0.7
                    )
                    reword_time = time.time() - reword_start
                    logger.info(f"[TIMING] Question rewording took {reword_time:.3f}s")
                    
                    reworded = reword_resp.choices[0].message.content.strip()
                    
                    # Clean up any JSON formatting
                    if reworded.startswith("```"):
                        reworded = re.sub(r'```(?:json)?\s*', '', reworded)
                        reworded = reworded.strip()
                    
                    if reworded.startswith("{"):
                        try:
                            parsed_reword = json.loads(reworded)
                            if "message" in parsed_reword:
                                reworded = parsed_reword["message"]
                            elif "data" in parsed_reword and "message" in parsed_reword["data"]:
                                reworded = parsed_reword["data"]["message"]
                        except:
                            pass
                    
                    chat_message = parse_markdown(reworded, "html")
                    logger.info(f"[CHAT] Generated CFM response: {chat_message[:100]}...")
                    break
                    
                except RuntimeError as e:
                    # Handle CFM validation errors (e.g., duplicate questions)
                    error_msg = str(e)
                    logger.error(f"[CFM] Validation error: {error_msg}")
                    
                    # Generate a graceful response asking DeepSeek for alternative
                    fallback_prompt = f"""The conversation flow manager rejected your request with this error:
                        "{error_msg}"

                        This means you tried to ask a question that was recently asked or violates conversation flow rules.

                        TASK: Generate a natural, conversational message that:
                        1. Acknowledges the user's previous response
                        2. Smoothly transitions to a DIFFERENT angle or category
                        3. Does NOT repeat recent questions
                        4. Maintains engaging dialogue

                        User's last message was: "{user_message}"

                        Recent conversation context:
                        {json.dumps([{"role": m.get("role"), "content": m.get("content")[:100]} for m in deepseek_messages[-3:]], indent=2)}

                        Respond with ONLY the message text - no JSON."""

                    fallback_messages = [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": fallback_prompt}
                    ]
                    
                    try:
                        fallback_resp = client.chat.completions.create(
                            model="deepseek-chat",
                            messages=fallback_messages,
                            stream=False,
                            temperature=0.7,
                            max_tokens=150
                        )
                        chat_message = parse_markdown(fallback_resp.choices[0].message.content.strip(), "html")
                        logger.info(f"[CFM] Generated fallback response after error: {chat_message[:100]}...")
                        break
                    except Exception as fallback_error:
                        logger.error(f"[CFM] Fallback generation also failed: {fallback_error}")
                        chat_message = "I notice we've explored this angle thoroughly. What other aspects of your story would you like to discuss?"
                        break
                        
                except Exception as e:
                    # Handle other unexpected errors
                    logger.error(f"[CFM] Unexpected error processing CFM action: {e}")
                    import traceback
                    logger.error(traceback.format_exc())
                    
                    # Provide generic fallback
                    chat_message = "Let me help you explore a different aspect of your story. What element would you like to focus on next?"
                    break
        
        # Priority 3: Fallback to raw response if plain text
        if not chat_message:
            stripped = bot_reply_raw.strip()
            if not (stripped.startswith("{") or stripped.startswith("[")):
                chat_message = parse_markdown(bot_reply_raw, "html")
                logger.info("[CHAT] Using raw response as fallback")
            else:
                # No immediate response - this is OK if only background actions
                if background_actions:
                    logger.info("[CHAT] No immediate response, background processing will handle")
                else:
                    # This shouldn't happen - always provide some response
                    chat_message = "I'm thinking about how to proceed. Could you tell me more?"
                    logger.warning("[CHAT] No response generated, using fallback prompt")
        
        # ------------------ SAVE ASSISTANT MESSAGE ------------------
        try:
            if chat_message:
                cfm_session.save_message(
                    role="assistant",
                    content=chat_message,
                    visible=True
                )
        except Exception as e:
            logger.warning(f"Failed to save assistant message: {e}")

        # ------------------ RETURN IMMEDIATELY ------------------
        total_time = time.time() - request_start
        logger.info(f"[TIMING] Total request time: {total_time:.3f}s")
        
        result = {
            "chat_message": chat_message,
            "session_id": session_id,
            "mode": "deepthinking",
            "background_processing": len(background_actions) > 0
        }

        # ------------------ START BACKGROUND THREAD ------------------
        if background_actions:
            logger.info(f"[CHAT] Spawning background thread for {len(background_actions)} actions")
            threading.Thread(
                target=background_handle_action,
                args=(background_actions, user_id, deepseek_messages, cfm_session),
                daemon=True
            ).start()
        else:
            logger.info("[CHAT] No background actions to process")

        # ------------------ ENSURE RESPONSE EXISTS ------------------
        if not chat_message:
            if background_actions:
                # Generate dynamic acknowledgment for background processing
                logger.warning("[CHAT] No immediate response generated, creating background acknowledgment")
                
                action_summary = ", ".join(set(act.get("action", "unknown") for act in background_actions if isinstance(act, dict)))
                
                fallback_prompt = f"""The system is processing these background actions: {action_summary}

                    The user's message was: "{user_message}"

                    Generate a brief, natural acknowledgment (1-2 sentences) that:
                    1. Acknowledges their input
                    2. Indicates you're processing/thinking about it
                    3. Sounds conversational and warm

                    Respond with ONLY the message text - no JSON, no formatting."""

                try:
                    fallback_resp = client.chat.completions.create(
                        model="deepseek-chat",
                        messages=[
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": fallback_prompt}
                        ],
                        stream=False,
                        temperature=0.7,
                        max_tokens=100
                    )
                    chat_message = parse_markdown(fallback_resp.choices[0].message.content.strip(), "html")
                    logger.info(f"[CHAT] Generated background processing acknowledgment: {chat_message[:100]}...")
                except Exception as e:
                    logger.error(f"[CHAT] Failed to generate acknowledgment: {e}")
                    chat_message = "Let me think about that..."
            else:
                # No actions at all - this shouldn't happen
                logger.error("[CHAT] No actions generated and no response - critical error")
                chat_message = "I'm thinking about how to respond. Could you elaborate on that?"

        # ------------------ SAVE ASSISTANT MESSAGE ------------------
        try:
            if chat_message:
                cfm_session.save_message(
                    role="assistant",
                    content=chat_message,
                    visible=True
                )
        except Exception as e:
            logger.warning(f"Failed to save assistant message: {e}")

        # ------------------ RETURN IMMEDIATELY ------------------
        total_time = time.time() - request_start
        logger.info(f"[TIMING] Total request time: {total_time:.3f}s")

        result = {
            "chat_message": chat_message,  # NOW GUARANTEED TO EXIST
            "session_id": session_id,
            "mode": "deepthinking",
            "background_processing": len(background_actions) > 0
        }

        return jsonify(result), 200

    except Exception as e:
        total_time = time.time() - request_start
        logger.exception(f"[CHAT] Error after {total_time:.3f}s: {e}")
        return jsonify({"error": f"DeepSeek API error: {e}"}), 500
    
@app.route("/debug/cache-stats", methods=["GET"])
def debug_cache_stats():
    stats = get_cache_stats()
    return jsonify(stats), 200

@app.route("/stream/<user_id>")
def stream_updates(user_id):
    def event_stream():
        q = queue.Queue()

        # Listen to Firebase backgroundTasks updates
        ref = db.reference(f"backgroundTasks/{user_id}")

        listener = ref.listen(lambda event: q.put(event.data))

        try:
            while True:
                data = q.get()
                if data:
                    yield f"data: {json.dumps(data)}\n\n"
        except GeneratorExit:
            listener.close()

    return Response(event_stream(), mimetype="text/event-stream")

# -------------------- RUN SERVER --------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5003, debug=True, threaded=True)
