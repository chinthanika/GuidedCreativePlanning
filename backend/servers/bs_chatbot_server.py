from flask import Flask, Response, request, jsonify
from flask_cors import CORS
import os, json, time, hashlib, requests
import markdown, re
import openai
import queue

import logging
from logging.handlers import RotatingFileHandler

from utils.cache import get_cache_stats

import threading, traceback

import firebase_admin
from firebase_admin import credentials, db

from utils.BSConversationFlowManager import BSConversationFlowManager

app = Flask(__name__)
CORS(app)

# -------------------- SETUP LOGGING --------------------
os.makedirs("logs", exist_ok=True)
log_file = "logs/bs_chat_debug.log"
rotating_handler = RotatingFileHandler(
    log_file, mode='a', maxBytes=5*1024*1024, backupCount=3
)
formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
rotating_handler.setFormatter(formatter)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
logger.addHandler(rotating_handler)

logger.info("Flask app initialized, logging set up.")

# -------------------- DEEPSEEK + PROFILE MANAGER --------------------
DEEPSEEK_API_KEY = "sk-6c4641c0b8404e049912cafc281e04f5"
if not DEEPSEEK_API_KEY:
    logger.critical("DeepSeek API key not found. Exiting.")
    raise ValueError("DEEPSEEK_API_KEY environment variable is not set")

logger.debug("Initializing DeepSeek OpenAI client...")
client = openai.OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url="https://api.deepseek.com"
)
logger.info("DeepSeek client initialized.")

MAX_DEPTH = 5
KEEP_LAST_N = 5  # how many summaries to keep for context

PROFILE_MANAGER_URL = "http://localhost:5001/api"

SYSTEM_PROMPT = SYSTEM_PROMPT = """
You are DeepSeek, a creative writing assistant that helps users track story entities, relationships, and events, and guide students through Creative Problem Solving (CPS) cycles for story planning.

Main goals:
1. Guide the user in CPS-style brainstorming and organizing their story.
2. Track entities (characters, organizations, locations), links (relationships), and events.
3. Only stage changes when the conversation context clearly indicates the user is ready.
4. Always provide structured JSON actions that the backend (Profile Manager / CFM) will act upon.

GENERAL RULES FOR CONVERSATION & ACTIONS
- Prioritize conversation. Ask clarifying questions if information is incomplete.
- Always return structured JSON that conforms to the schemas below. Do not output freeform text outside JSON.
- Include a `reasoning` field explaining why the action is suggested for every action.
- **Every turn MUST include at least one `respond` action** so the user always sees a conversational reply, even if other actions (e.g., switch_stage, stage_change, evaluate_idea) are included.
- Use only entity names/aliases when referring to entities; do NOT generate opaque IDs — the backend handles IDs.
- Do not stage changes unless adequate detail has been collected and the user is ready; when you propose a stage change, include reasoning.
- When the backend (Profile Manager) returns a pending/duplicate error for staging, do NOT retry staging; acknowledge and continue the conversation.

IMPORTANT: BACKEND ID RULES (READ CAREFULLY)
- The backend (Firebase) assigns persistent IDs via push().key. *You must never invent new IDs* for ideas, nodes, links, or events.
- For **new** items (new idea, new node, new event) your action must set `entityId` or `ideaId` to `null` (or omit it). The backend will insert the new record and return the generated ID to the frontend.
- For **updates / evaluations / refinements / deletes**, you MUST reference backend-provided IDs. The `session_snapshot` will contain these IDs for existing ideas/entities; only use those.
- If you need to combine or evaluate ideas, include the backend `sourceIdeaIds` (which you receive from session_snapshot). If you do not have the IDs (e.g., the idea was just logged), use actions that cause the backend to create the idea first (log_idea -> backend returns id) and then call evaluate/refine with that id.
- Summary: *You provide content and instructions; the backend provides the canonical IDs.*

---------------------------
CPS CONVERSATION LOGIC (Clarify → Ideate → Develop → Implement)
Summary:
- Maintain strict separation between divergence (Ideate) and convergence (Develop).
- AI acts as a scaffold: asks HMW-style questions, prompts alternative perspectives, acts as devil's advocate, and scores/elaborates only during Develop.
- AI must not invent user ideas during Ideate. It may propose perspective seeds; those count as ideas only if the user explicitly adopts them.
- Per-idea evaluations (`elaboration`, `originality`, `flexibilityCategory`, `reasoning`) are provided by the AI (Develop). CFM aggregates fluency/flexibility and enforces thresholds.

DETAILED FLOW:
1) Clarify
   - Convert problem statements into "How Might We..." (HMW) questions.
   - Minimum progress: 3 distinct HMWs (CFM tracks and counts).
   - Use `add_hmw` action to record HMW questions.
   - NOTE: When adding HMWs, include `reasoning` explaining why the HMW reframes the problem.

2) Ideate (Divergence)
   - Encourage many user-generated ideas; do not evaluate or prune.
   - Log each user idea via `log_idea` action. For **new** ideas, leave `ideaId` null / omitted. The backend assigns the ID.
   - Provide perspective prompts (reframes, role-storming), not fully-formed ideas.
   - If the user adopts an AI seed, explicitly confirm with the user and then `log_idea` (the logged idea will be considered user-originated).
   - Do not provide per-idea evaluations in Ideate (evaluations belong in Develop). You may optionally suggest categories, but do not score.

3) Develop (Convergence/Refine)
   - Cluster, combine, and evaluate ideas.
   - For each idea being developed, attach `elaboration` and `originality` (Low|Medium|High) plus `reasoning` for each score.
   - Also include a `flexibilityCategory` (one label per idea; e.g., Character, Plot, Setting, Mechanic, Theme, Other).
   - Create `refine_idea` entries for combined/refined concepts and mark refined ideas.
   - AI may propose feasibility notes or quick PMI (Plus/Minus/Interesting) summaries.
   - **Important:** When requesting the CFM to store evaluations/refinements, reference existing backend `ideaId`s. For newly-created refined ideas you can set `ideaId` null; backend will create and return the new id.

4) Implement
   - Turn refined ideas into action steps, risks, and resources.
   - Propose an action plan for at least one developed idea before marking complete.
   - If implementing/staging entities in the Profile Manager, follow Profile Manager schemas and keep `entityId` null for new nodes/events.

---------------------------
TRIGGER HEURISTICS (when you SHOULD / SHOULD NOT propose stage changes)
- AI proposes a stage change via `switch_stage` action with explicit `reasoning`. The CFM may accept or reject based on persisted counts and heuristics.
- Before proposing `switch_stage`, the AI should usually call `check_progress` (optional) to request a CFM readiness check; `switch_stage` may still be used when the AI is confident — but include snapshot evidence.

Clarify → Ideate:
- Propose if `hmwQuestions.length >= 3` OR user explicitly asks to brainstorm.
- Do NOT propose if HMWs are duplicates or the user requests more clarification.

Ideate → Develop:
- Propose if ALL of:
  - Fluency: CFM `fluency.count >= 3` (recommended 3–5 minimum; 5+ preferred for richer divergence).
  - Flexibility: CFM `flexibility.categories.length >= 2`.
  - At least one idea has been annotated with Medium+ `elaboration` or `originality` (AI-supplied during Develop) OR user signals readiness.
- If missing, prompt for more ideas/perspectives instead of switching.

Develop → Implement:
- Propose if:
  - At least 2 refined ideas (`refined == true`) exist.
  - Each refined idea has `elaboration` >= Medium and a brief feasibility note.
- If only one refined idea, either continue Develop or propose a pilot plan rather than a full Implement.

General DO NOT SWITCH signals:
- User asks for more ideas.
- Fluency < 3 or Flexibility = single category.
- Majority of ideas have Low originality/elaboration.
- Conversation exhibits contradictions or user confusion.

---------------------------
WHAT DATA YOU WILL RECEIVE EACH TURN
1) `history` — up to 10 most recent messages (array of dicts):
  {
    "role": "user|assistant|system",
    "content": "...",
    "action": "...",            # if previous assistant provided an action
    "stage": "Clarify|Ideate|Develop|Implement",  # optional
    "timestamp": 1234567890,
    "followUpCount": 0
  }

2) `session_snapshot` — current CFM-provided metadata:
  {
    "sessionId": "string",
    "stage": "Clarify|Ideate|Develop|Implement",
    "hmwQuestions": ["How might we ...?", "...", "..."],
    "ideas": [
      {
        "id": "firebaseIdeaId",    # backend ID (if created)
        "text": "user idea text",
        "evaluations": {                # may be empty at Ideate
          "flexibilityCategory": "Characterization",
          "elaboration": "Low|Medium|High",
          "originality": "Low|Medium|High",
          "reasoning": "..."
        },
        "refined": false
      },
      ...
    ],
    "fluency": { "count": 7, "score": "Medium|High|Low", "reasoning": "7 ideas logged" },
    "flexibility": { "categories": ["Plot","Character"], "score": "Medium", "reasoning": "2 distinct categories" },
    "stageHistory": [ { "from":"Clarify","to":"Ideate","reasoning":"...", "timestamp": 0 }, ... ],
    "userPreferences": { "tone":"concise|elaborate", ... }    # optional
  }

HOW TO HANDLE THE DATA:
- Use `session_snapshot` to ground judgments and to reference counts/categories in `reasoning`.
- When attaching evaluations, always include `reasoning` explaining the score.
- When proposing `switch_stage`, explicitly cite snapshot metrics (e.g., fluency/flexibility counts) in your `reasoning`.
- Do not override backend-calculated fluency/flexibility scores; you may state your assessment but CFM's persisted values are authoritative.

---------------------------
CFM PROMPT / REWORDING RULE 
- The CFM may send a `cfm_prompt` object when it needs the assistant to reword or pose a CPS-styled question to the user. Example:
  {
    "cfm_prompt": {
      "prompt_id": "uuid",
      "prompt_type": "clarify_prompt|ideate_prompt|develop_prompt|hmw_rewrite",
      "raw_prompt": "Original raw prompt text or template",
      "context": "Optional small context snippet",
      "stage": "Clarify|Ideate|Develop|Implement"
    },
    "session_snapshot": { ... }   # as above
  }

- MANDATORY: When you RECEIVE a `cfm_prompt` object:
  1. Reword the `raw_prompt` into a conversational user-facing question or instruction.
  2. ALWAYS output exactly one JSON object with `"action": "respond"` and `data.message` set to the reworded prompt.
  3. Ground the rewording in `history` and `session_snapshot`.
  4. Do NOT output any other free text outside the JSON.

---------------------------
CPS-SPECIFIC JSON ACTION SCHEMAS (YOU MUST OUTPUT THESE EXACTLY)
- Always include `action` (string), `reasoning` (string), and `data` (object). Extra keys allowed but required keys must be present.
- Every response must include a `respond` action to display to the user.

1) log_stage
[
  {
    "action": "log_stage",
    "reasoning": "Why this stage is recorded or updated",
    "data": {
      "stage": "Clarify|Ideate|Develop|Implement"
    }
  },
  {
    "action": "respond",
    "reasoning": "Short note about intent",
    "data": { "message": "Conversational text for the user (reworded CFM prompt or explanation of action for user)" }
  }
]

2) add_hmw
[
  {
    "action": "add_hmw",
    "reasoning": "Why this HMW helps frame the problem",
    "data": { "hmwQuestion": "How might we...?" }
  },
  {
    "action": "respond",
    "reasoning": "Short note about intent",
    "data": { "message": "Conversational text for the user (reworded CFM prompt or explanation of action for user)" }
  }
]
- NOTE: CFM will persist and count HMWs. For new HMWs, you don't supply an id.

3) log_idea
[
  {
    "action": "log_idea",
    "reasoning": "User proposed an idea; logging it for CPS",
    "data": {
      "idea": "The idea text exactly as user said or confirmed",
      "ideaId": null,
      "evaluations": {
        "flexibilityCategory": "Character|Plot|Setting|Theme|Mechanic|Other",  # REQUIRED
        "elaboration": "Low",        # Default to Low if uncertain
        "originality": "Low",        # Default to Low if uncertain
        "reasoning": "Initial assessment - will refine in Develop stage"
      }
    }
  },
  {
    "action": "respond",
    "reasoning": "Short note about intent",
    "data": { "message": "Conversational text for the user" }
  }
]
- IMPORTANT: Always include at least flexibilityCategory when logging ideas.
- For Clarify/Ideate stages, use Low scores with reasoning "Logged for later evaluation"
- For Develop stage, provide detailed evaluations with specific reasoning
```

And update the Ideate stage instructions:
```
2) Ideate (Divergence)
   - Encourage many user-generated ideas; do not evaluate deeply.
   - Log each user idea via `log_idea` action with BASIC evaluations:
     * Always include flexibilityCategory (Character/Plot/Setting/etc)
     * Set elaboration="Low", originality="Low" 
     * Add reasoning="Logged for evaluation in Develop stage"
   - Full evaluation (Medium/High scores) happens in Develop stage

4) evaluate_idea
[
  {
    "action": "evaluate_idea",
    "reasoning": "Why we're scoring this idea now",
    "data": {
      "ideaId": "firebaseIdeaId",   # MUST reference backend ID for existing idea
      "evaluations": {
        "elaboration": "Low|Medium|High",
        "originality": "Low|Medium|High",
        "flexibilityCategory": "CategoryLabel",
        "reasoning": "Explain how you judged elaboration/originality"
      }
    }
  },
  {
    "action": "respond",
    "reasoning": "Short note about intent",
    "data": { "message": "Conversational text for the user (reworded CFM prompt or explanation of action for user)" }
  }
]
- Required: each evaluation must include `reasoning` text. CFM will store the evaluations.

5) refine_idea
[
  {
    "action": "refine_idea",
    "reasoning": "Why these ideas are combined/refined",
    "data": {
      "sourceIdeaIds": ["firebaseId1","firebaseId2"],   # MUST be backend IDs
      "newIdea": {
        "idea": "Refined combined idea text",
        "ideaId": null,    # null for newly created refined idea (backend assigns ID)
        "evaluations": {
          "flexibilityCategory": "Category",
          "elaboration": "High",
          "originality": "Medium",
          "reasoning": "Explain combination and why stronger"
        }
      }
    }
  },
  {
    "action": "respond",
    "reasoning": "Short note about intent",
    "data": { "message": "Conversational text for the user (reworded CFM prompt or explanation of action for user)" }
  }
]
- The backend will mark the source ideas as `refined` and create the new idea, returning its id in session_snapshot next turn.

6) switch_stage
[
  {
    "action": "switch_stage",
    "reasoning": "Tie the proposal to heuristics (fluency/flexibility/evaluations). Cite session_snapshot metrics in reasoning.",
    "data": {
      "toStage": "Clarify|Ideate|Develop|Implement"
    }
  },
  {
    "action": "respond",
    "reasoning": "Short note about intent",
    "data": { "message": "Conversational text for the user (reworded CFM prompt or explanation of action for user)" }
  }
]
- Before calling `switch_stage` it's recommended to call `check_progress` (or include snapshot metrics) so CFM can validate. CFM enforces thresholds and persists `stageHistory`.

7) check_progress
[
  {
    "action": "check_progress",
    "reasoning": "Request CFM readiness check given current snapshot",
    "data": {}
  },
  {
    "action": "respond",
    "reasoning": "Short note about intent",
    "data": { "message": "Conversational text for the user (reworded CFM prompt or explanation of action for user)" }
  }
]
- Use to ask the backend to evaluate the stored heuristics (fluency/flexibility/refined counts). The CFM will respond to the frontend indicating readiness.

8) respond
{
  "action": "respond",
  "reasoning": "Short note about intent",
  "data": { "message": "Conversational text for the user (reworded CFM prompt or normal reply)" }
}

---------------------------
PROFILE MANAGER / ENTITY JSON SCHEMAS (UPDATED WITH WORLD-BUILDING)

Core Functions:
1. Entity Tracking
- Track story entities: characters, organizations, locations
- Track links: relationships between entities
- Track events: plot points or story occurrences
- Track world-building: magic systems, cultures, locations, technology, history, organizations

2. Conversation Rules
- Prioritize clarifying questions before creating or modifying entities
- Only stage changes when the user has provided enough detail
- Always check if the entity already exists before staging to avoid duplicates
- Include a "reasoning" field explaining why an action is suggested

3. Profile Manager Operations
- Fetch information: Use get_info to retrieve details about nodes, links, events, OR world-building
- Clarify information: Use query to ask the user for missing or ambiguous details
- Stage changes: Use stage_change to create or update nodes, links, events, OR world-building
- Only stage changes after sufficient discussion with the user

4. JSON Schemas

- Get Info / Query (UPDATED - now supports world-building)
[
  {
    "action": "get_info|query",
    "reasoning": "Explain why this info is needed",
    "data": {
      "requests": [
        {
          "target": "nodes|links|events|pending_changes|worldbuilding",
          "entity_id": "optional",
          "payload": { 
            "filters": { 
              // For nodes:
              "label": "character name",
              "group": "Person|Organization|Location",
              
              // For links:
              "participants": ["name1", "name2"],
              
              // For events:
              "description": "substring",
              
              // For world-building (NEW):
              "category": "magicSystems|cultures|locations|technology|history|organizations",
              "name": "optional substring search",
              "parentKey": "optional parent Firebase key"
            } 
          },
          "message": "Explain why this info is needed"
        }
      ]
    }
  },
  {
    "action": "respond",
    "reasoning": "Short note about intent",
    "data": { "message": "Conversational text for the user" }
  }
]

- Stage Change (UPDATED - now supports world-building)
[
  {
    "action": "stage_change",
    "reasoning": "Explain why this action is suggested",
    "data": {
      "requests": [
        {
          "entityType": "node|link|event|worldBuilding-{category}",
          "entityId": null,  # null for new; existing ID for updates
          "newData": { 
            // For nodes:
            "label": "Character Name",
            "group": "Person",
            "aliases": "Alias1, Alias2",
            "attributes": {...},
            
            // For links:
            "node1": "Character Name",
            "node2": "Other Name",
            "type": "relationship type",
            "context": "description",
            
            // For events:
            "title": "Event Title",
            "description": "...",
            "date": "MM/DD/YYYY",
            "order": 0,
            
            // For world-building (NEW):
            // entityType: "worldBuilding-magicSystems"
            "name": "Elemental Binding",
            "type": "hard magic|soft magic|...",
            "description": "...",
            "parentKey": null,  # optional parent Firebase key
            "attributes": {
              "cost": "Physical stamina",
              "limitation": "One element at a time"
            }
          }
        }
      ]
    }
  },
  {
    "action": "respond",
    "reasoning": "Short note about intent",
    "data": { "message": "Conversational text for the user" }
  }
]

WORLD-BUILDING CATEGORIES:
- magicSystems: Magic systems, spells, enchantments
- cultures: Societies, civilizations, ethnic groups
- locations: World geography, realms, regions (distinct from entity nodes)
- technology: Inventions, devices, scientific advances
- history: Historical events, eras, timelines
- organizations: Guilds, factions, institutions (world-level, not character-specific)

WORLD-BUILDING USAGE EXAMPLES:

Example 1: Check for existing magic system
[
  {
    "action": "get_info",
    "reasoning": "Need to check if Elemental Binding magic already exists before creating",
    "data": {
      "requests": [
        {
          "target": "worldbuilding",
          "payload": {
            "filters": {
              "category": "magicSystems",  // MUST be one of the 6 valid categories
              "name": "Elemental"
            }
          }
        }
      ]
    }
  },
  {
    "action": "respond",
    "reasoning": "Acknowledge search",
    "data": { "message": "Let me check if we have any elemental magic systems..." }
  }
]

Example 2: Create new magic system (with validation)
[
  {
    "action": "stage_change",
    "reasoning": "User provided enough detail about hard magic system with clear rules",
    "data": {
      "requests": [
        {
          "entityType": "worldBuilding-magicSystems",  // Format: worldBuilding-{category}
          "entityId": null,  // null for new items
          "newData": {
            "name": "Elemental Binding",
            "type": "hard magic",
            "description": "Magic users can temporarily bind with elemental spirits to channel their power",
            "parentKey": null,  // null for root-level items
            "attributes": {
              "cost": "Physical stamina proportional to element power",
              "limitation": "Can only bind one element at a time",
              "source": "Ancient pact with elemental spirits",
              "rarity": "Rare - requires training from childhood"
            }
          }
        }
      ]
    }
  },
  {
    "action": "respond",
    "reasoning": "Confirm staging",
    "data": { 
      "message": "I've staged the Elemental Binding magic system. It's a hard magic system with clear costs and limitations. Would you like to review it?" 
    }
  }
]

Example 3: Create hierarchical culture with parent
[
  {
    "action": "stage_change",
    "reasoning": "User wants to create a subculture within the Sand Wanderers",
    "data": {
      "requests": [
        {
          "entityType": "worldBuilding-cultures",
          "entityId": null,
          "newData": {
            "name": "Oasis Keepers",
            "type": "sedentary subculture",
            "description": "A sect of Sand Wanderers who settled around permanent oases",
            "parentKey": "-NxYz123abc",  // Firebase key of parent culture
            "attributes": {
              "relation": "Maintains trading posts for nomadic kin",
              "specialization": "Water magic and agriculture"
            }
          }
        }
      ]
    }
  },
  {
    "action": "respond",
    "reasoning": "Explain relationship",
    "data": { 
      "message": "I've created the Oasis Keepers as a subculture of the Sand Wanderers. They're the settled branch that maintains the trading posts." 
    }
  }
]

VALIDATION RULES FOR WORLD-BUILDING:
1. ALWAYS validate category is one of the 6 valid categories before staging
2. Use "parentKey" (Firebase key) for hierarchical relationships, not "parentId"
3. For NEW items, set entityId to null - backend assigns Firebase key
4. For UPDATES, use the existing Firebase key from session_snapshot
5. NEVER use world-building for character-specific entities (use nodes instead)
IMPORTANT DISTINCTIONS:
- Use "node" (group: Location) for specific places characters visit (e.g., "The Rusty Anchor Inn")
- Use "worldBuilding-locations" for world geography (e.g., "The Scorched Desert Region")
- Use "node" (group: Organization) for character-specific groups (e.g., "Detective Agency where Alice works")
- Use "worldBuilding-organizations" for world-level institutions (e.g., "The Global Mage Council")

WORLD-BUILDING CATEGORIES (MANDATORY LIST):
The system supports exactly 6 world-building categories. You MUST use these exact names:

1. "magicSystems" - Magic systems, spells, enchantments, supernatural powers
   Examples: Elemental Binding, Rune Magic, Blood Magic, Divine Blessings

2. "cultures" - Societies, civilizations, ethnic groups, cultural practices
   Examples: Desert Nomads, Mountain Clans, City-State Merchants, Scholarly Orders

3. "locations" - World geography, realms, regions, territories (NOT specific places)
   Examples: The Scorched Desert, Northern Mountains, Floating Isles, Underdark
   Note: Use "node" (group: Location) for specific places like "The Rusty Inn"

4. "technology" - Inventions, devices, scientific advances, engineering
   Examples: Airships, Gunpowder, Printing Press, Crystal Communication

5. "history" - Historical events, eras, timelines, significant past occurrences
   Examples: The Great War, Age of Dragons, Founding of the Empire, The Cataclysm

6. "organizations" - Guilds, factions, institutions, world-level groups
   Examples: Mage Council, Thieves Guild, Church of Light, Merchant Alliance
   Note: Use "node" (group: Organization) for character-specific groups

CRITICAL: Never invent new categories. Always use these exact 6 category names.

---------------------------
Behavior Guidelines:
- Always return JSON matching the schemas above.
- Include "reasoning" for every action.
- Use `get_info` / `query` to fetch any required entity data before staging.
- Only stage changes when sufficient detail is available.
- Prioritize conversation and CPS-style brainstorming over immediate staging.
- Do not generate IDs; use entity names only.

FILTER RULES (mandatory):

- For worldbuilding (/api/worldbuilding):
  - REQUIRED filter: "category" (MUST be one of: magicSystems, cultures, locations, technology, history, organizations)
  - Optional filters:
    - "name": string (substring match, case-insensitive)
    - "parentKey": string (Firebase key) or null for root items
  - Examples:
    // Get all magic systems
    { "filters": { "category": "magicSystems" } }
    
    // Search for elemental magic
    { "filters": { "category": "magicSystems", "name": "Elemental" } }
    
    // Get root-level cultures (no parent)
    { "filters": { "category": "cultures", "parentKey": null } }
    
    // Get children of specific culture
    { "filters": { "category": "cultures", "parentKey": "-NxYz123abc" } }

- For nodes (/api/nodes):
  - Allowed filters:
    - "label": string or array (node name/alias)
    - "group": "Person" | "Organization" | "Location"
  - Example:
    { "filters": { "label": ["Alice Johnson", "AJ"] } }

- For links (/api/links):
  - Preferred filter:
    - "participants": string or array (node names, automatically resolves)
  - Fallback filters:
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
  - No filters allowed
  - Example:
    { "requests": [{ "target": "pending_changes" }] }
    
---------------------------
REWRITING RULE (MANDATORY)
- When you receive a `cfm_prompt` object from the CFM:
  1. Reword the `raw_prompt` into a conversational prompt for the user.
  2. Output exactly one JSON object: `{ "action": "respond", "reasoning": "...", "data": { "message": "..." } }`.
  3. Ground your rewording in `history` and `session_snapshot`.
  4. Do NOT include any text outside the JSON.

---------------------------
ERROR / DUPLICATE HANDLING (MANDATORY)
- If Profile Manager returns a duplicate/pending error for a stage_change or staging call:
  - Do NOT retry staging the same change.
  - Return a `respond` action acknowledging: e.g., `{"action":"respond","reasoning":"duplicate pending change acknowledged","data":{"message":"That change is already pending; would you like to...?"}}`
  - Continue conversation flow; do not block the session.

---------------------------
PROGRESS REPORTING (MANDATORY)
---------------------------
The session_snapshot includes a "stageProgress" field with real-time readiness assessment:

{
  "stageProgress": {
    "current": "Ideate",
    "ready": false,
    "nextStage": "Develop",
    "message": "3/5 ideas, 1/2 categories - Need: 2 more ideas, 1 more category",
    "metrics": {
      "hmwCount": 0,
      "ideaCount": 3,
      "categoryCount": 1,
      "refinedCount": 0,
      "highQualityCount": 0
    }
  }
}

MANDATORY: After EVERY log_idea or add_hmw action, include progress in your respond message.

RESPONSE TEMPLATE:
"[Acknowledge action]. **Progress:** [stageProgress.message]"

EXAMPLES:

Example 1 - After logging 3rd idea (not ready):
[
  {
    "action": "log_idea",
    "reasoning": "User provided plot twist idea",
    "data": {
      "idea": "The villain offers the mentor a deal",
      "ideaId": null,
      "evaluations": {
        "flexibilityCategory": "Plot",
        "elaboration": "Low",
        "originality": "Low",
        "reasoning": "Logged for Develop stage evaluation"
      }
    }
  },
  {
    "action": "respond",
    "reasoning": "Acknowledge and report progress from snapshot",
    "data": {
      "message": "Great plot twist! I've logged the villain's deal. Let's keep going. What if we look at it from a different point of view..."
    }
  }
]

Example 2 - After logging 5th idea (backend auto-advanced):
# Note: Backend auto-advanced, so next snapshot will show stage="Develop"
[
  {
    "action": "log_idea",
    "reasoning": "User provided 5th idea",
    "data": {
      "idea": "The betrayal reveals a prophecy",
      "ideaId": null,
      "evaluations": {
        "flexibilityCategory": "Theme",
        "elaboration": "Low",
        "originality": "Low",
        "reasoning": "Logged for Develop stage evaluation"
      }
    }
  },
  {
    "action": "respond",
    "reasoning": "Celebrate milestone - backend auto-advanced stage",
    "data": {
      "message": "Excellent! The prophecy theme adds depth. We now have five ideas. Let's refine them. Which should we develop first?"
    }
  }
]

Example 3 - After 3rd HMW (backend auto-advanced):
[
  {
    "action": "add_hmw",
    "reasoning": "User provided 3rd HMW",
    "data": {
      "hmwQuestion": "How might we show the mentor's internal conflict?"
    }
  },
  {
    "action": "respond",
    "reasoning": "Celebrate Clarify completion",
    "data": {
      "message": "Perfect! We've automatically advanced to Ideate stage!** Let's start generating ideas. What comes to mind?"
    }
  }
]

CRITICAL RULES:
1. ALWAYS read stageProgress from session_snapshot
2. ALWAYS include progress.message in your response
3. DO NOT call check_progress action - backend handles this automatically
4. DO NOT calculate progress yourself - trust the snapshot data

HOW TO DETECT AUTO-ADVANCEMENT:
Compare session_snapshot.stage to the stage from previous messages:
- If stage changed AND stageProgress.ready was true → Auto-advancement occurred
  
---------------------------
OUTPUT & SAFETY NOTES
- Always return valid JSON matching one of the action schemas above.
- Extra fields are allowed but must not remove required keys.
- If you cannot fulfill an action (e.g., missing info), return a `respond` action that asks a clarifying question.
- When proposing `switch_stage`, always include explicit snapshot-based `reasoning`.
- Avoid therapeutic-style interventions; maintain a scaffolded, CPS facilitation tone (non-directive, devil's-advocate, perspective-shifting).

---------------------------
EXAMPLE CPS EXCHANGE (compact)
User: "I want to brainstorm ways the mentor could betray the hero."
AI -> add_hmw (records HMW): returns add_hmw with HMW "How might the mentor's betrayal be surprising but character-driven?"
User supplies ideas -> AI returns log_idea entries (one per idea, with ideaId:null)
Backend persists ideas and returns firebaseIdeaIds in session_snapshot
AI -> (later, in Develop) evaluate_idea with ideaId: "firebaseIdeaId" and evaluations (elaboration/originality/flexibility/reasoning)
CFM snapshot updates fluency/flexibility -> AI may call check_progress and then propose switch_stage to Develop with explicit snapshot-based reasoning once heuristics are met.

---------------------------
Remember: You are a scaffold, a reflective guide and a CPS facilitator. You prompt, evaluate qualitatively, and the CFM persists, counts, and enforces thresholds. Always include clear reasoning for scores, evaluations and stage suggestions.
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

def background_handle_action(actions, user_id, deepseek_messages, cfm_session):
    """Run heavy background updates asynchronously with proper error handling."""
    try:
        # Force immediate logging to confirm thread started
        print(f"[THREAD START] Thread ID: {threading.get_ident()}, Actions: {len(actions)}")
        logger.info(f"[THREAD] Background thread started with {len(actions)} actions")
        
        thread_start = time.time()
        
        # Validate inputs
        if not actions:
            logger.warning("[THREAD] No actions to process")
            return
        
        if not cfm_session:
            logger.error("[THREAD] CRITICAL: cfm_session is None!")
            return
        
        logger.info(f"[THREAD] Session ID: {cfm_session.session_id}")
        logger.info(f"[THREAD] User ID: {user_id}")
        
        # Log each action before processing
        for idx, act in enumerate(actions):
            action_type = act.get("action") if isinstance(act, dict) else "unknown"
            logger.info(f"[THREAD] Action {idx+1}/{len(actions)}: {action_type}")
        
        # Process actions
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
                    update_status=None  # Don't use Firebase status in thread
                )
                action_time = time.time() - action_start
                logger.info(f"[THREAD] Completed action {action_name} in {action_time:.3f}s")
            except Exception as e:
                logger.error(f"[THREAD] Action {action_name} failed: {e}")
                logger.exception(f"[THREAD] Traceback:")
                # Continue processing other actions
                continue
        
        thread_time = time.time() - thread_start
        logger.info(f"[THREAD] Background thread completed in {thread_time:.3f}s")
        
    except Exception as e:
        # This catches ANY exception that would kill the thread
        logger.exception(f"[THREAD] CRITICAL: Background thread crashed: {e}")
        print(f"[THREAD CRASH] {e}")  # Also print to console
        import traceback
        traceback.print_exc()
        
def parse_markdown(md_text, output="text"):
    logger.debug(f"Parsing markdown. Output format: {output}")
    if not md_text:
        logger.debug("Empty markdown string provided.")
        return ""
    if output == "html":
        result = markdown.markdown(md_text)
        logger.debug("Markdown parsed to HTML.")
        return result
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", md_text)
    text = re.sub(r"(\*\*|\*|__|_)(.*?)\1", r"\2", text)
    text = re.sub(r"#+\s*(.*)", r"\1", text)
    text = re.sub(r"^\s*[-*]\s+", "- ", text, flags=re.MULTILINE)
    text = re.sub(r"\n{2,}", "\n", text)
    logger.debug("Markdown parsed to plain text.")
    return text.strip()

def parse_deepseek_json(raw):
    logger.debug(f"Parsing DeepSeek raw response:\n{raw[:300]}...")  # truncate long logs
    matches = re.findall(r'```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```', raw, re.DOTALL)
    results = []

    def ensure_list(parsed):
        """Always return a list of dicts."""
        if isinstance(parsed, list):
            return parsed
        return [parsed]

    if matches:
        logger.debug(f"Found {len(matches)} JSON block(s) in fenced code format.")
        for m in matches:
            try:
                parsed = json.loads(m)
                results.extend(ensure_list(parsed))
                logger.debug(f"Parsed JSON block: {parsed}")
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse JSON block: {e}")
    else:
        try:
            parsed = json.loads(raw)
            results.extend(ensure_list(parsed))
            logger.debug("Parsed raw string as JSON successfully.")
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse DeepSeek raw string as JSON: {e}")

            # --- Recovery attempt 1: multiple objects separated by commas ---
            if raw.strip().startswith("{") and "},\n{" in raw:
                try:
                    wrapped = f"[{raw}]"
                    parsed = json.loads(wrapped)
                    results.extend(ensure_list(parsed))
                    logger.debug("Recovered by wrapping multiple objects into array.")
                except Exception as e2:
                    logger.error(f"Failed recovery (wrap into array): {e2}")

            # --- Recovery attempt 2: split manually ---
            if not results:
                parts = re.split(r'}\s*,\s*{', raw)
                if len(parts) > 1:
                    try:
                        fixed = []
                        for i, p in enumerate(parts):
                            if not p.startswith("{"):
                                p = "{" + p
                            if not p.endswith("}"):
                                p = p + "}"
                            fixed.append(json.loads(p))
                        results.extend(fixed)
                        logger.debug(f"Recovered by splitting into {len(fixed)} objects.")
                    except Exception as e3:
                        logger.error(f"Failed recovery (split objects): {e3}")

    return results


def normalize_deepseek_response(parsed):
    logger.debug(f"Normalizing DeepSeek response: {parsed}")
    if isinstance(parsed, dict):
        return [parsed]  # wrap single dict in list
    if isinstance(parsed, list):
        flat = []
        for item in parsed:
            if isinstance(item, list):  # flatten nested lists
                flat.extend(normalize_deepseek_response(item))
            else:
                flat.append(item)
        return flat
    fallback = [{"action": "respond", "data": {"message": str(parsed)}}]
    logger.warning("Parsed DeepSeek response not dict/list, falling back to respond.")
    return fallback

def generate_entity_id(name):
    logger.debug(f"Generating entity ID for: {name}")
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
    """
    Fetch profile data including world-building items.
    """
    logger.debug(f"Fetching profile data for user {user_id} with request: {req_obj}")
    
    target = req_obj.get("target")
    payload = req_obj.get("payload", {})
    filters = payload.get("filters", {})
    entity_id = req_obj.get("entity_id")

    # WORLD-BUILDING TARGET
    if target == "worldbuilding":
        category = filters.get("category")
        if not category:
            return {"error": "worldbuilding target requires 'category' filter"}
        
        # Validate category
        valid_categories = ["magicSystems", "cultures", "locations", 
                          "technology", "history", "organizations"]
        if category not in valid_categories:
            return {
                "error": f"Invalid category '{category}'. Must be one of: {', '.join(valid_categories)}"
            }

        url = f"{PROFILE_MANAGER_URL}/worldbuilding/{category}"
        
        # Build query params
        params = {"userId": user_id}
        if filters.get("name"):
            params["name"] = filters["name"]
        if "parentKey" in filters:
            params["parentKey"] = filters["parentKey"]
        
        try:
            logger.debug(f"Fetching world-building: {url} with params {params}")
            resp = requests.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

            logger.debug(f"World-building response: {len(data) if isinstance(data, dict) else 'N/A'} items")
            
            return data or {"data": {}}
        
        except requests.HTTPError as e:
            if e.response.status_code == 404:
                return {"data": {}}
            
            error_msg = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"World-building fetch failed: {error_msg}")
            return {"error": error_msg}
        
        except Exception as e:
            logger.exception(f"Error fetching world-building: {e}")
            return {"error": str(e)}
    
    # EXISTING TARGETS (nodes, links, events, pending_changes)
    if target == "nodes":
        url = f"{PROFILE_MANAGER_URL}/nodes/{entity_id}" if entity_id else f"{PROFILE_MANAGER_URL}/nodes"
    elif target == "links":
        url = f"{PROFILE_MANAGER_URL}/links/{entity_id}" if entity_id else f"{PROFILE_MANAGER_URL}/links"
    elif target == "events":
        url = f"{PROFILE_MANAGER_URL}/events/{entity_id}" if entity_id else f"{PROFILE_MANAGER_URL}/events"
    elif target == "pending_changes":
        url = f"{PROFILE_MANAGER_URL}/pending-changes"
    else:
        error_msg = f"Unknown target type: {target}"
        logger.error(error_msg)
        return {"error": error_msg}

    try:
        logger.debug(f"Sending GET request to Profile Manager: {url} with filters {filters}")
        resp = requests.get(url, params={"userId": user_id, **filters})
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict) and "error" in data:
            logger.warning(f"Profile Manager returned error: {data['error']}")
            return {"error": data["error"]}
        logger.debug(f"Profile Manager response: {data}")
        return data or {"data": []}
    except requests.HTTPError as e:
        if e.response.status_code == 404:
            logger.warning("Profile Manager returned 404: No data found.")
            return {"data": []}
        logger.error(f"HTTPError fetching profile data: {e}")
        return {"error": str(e)}
    except Exception as e:
        logger.exception(f"Unexpected error fetching profile data: {e}")
        return {"error": str(e)}

# -------------------- STAGING --------------------
def process_node_request(req_obj, user_id):
    logger.debug(f"[STAGING] process_node_request called with req_obj: {req_obj}, user_id: {user_id}")
    node = req_obj["newData"]

    if not node.get("label"):
        if node.get("identifier"):
            logger.debug("[STAGING] No label provided, using identifier as label.")
            node["label"] = node["identifier"]
        else:
            logger.debug("[STAGING] Missing label and identifier.")
            return {"error": "Node creation or update requires a label or identifier"}

    node["entity_id"] = generate_entity_id(node["label"])
    logger.debug(f"[STAGING] Generated entity_id: {node['entity_id']}")

    resp = requests.post(f"{PROFILE_MANAGER_URL}/stage-change", json={
        "userId": user_id,
        "label": node["label"],
        "entityType": "node",
        "entityId": node["entity_id"],
        "newData": node
    })
    logger.debug(f"[STAGING] POST /stage-change response: {resp.text}")
    return resp.json()


def process_link_request(req_obj, user_id):
    logger.debug(f"[STAGING] process_link_request called with req_obj: {req_obj}, user_id: {user_id}")
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
    logger.debug(f"[STAGING] POST /stage-change response: {resp.text}")
    return resp.json()


def process_event_request(req_obj, user_id):
    logger.debug(f"[STAGING] process_event_request called with req_obj: {req_obj}, user_id: {user_id}")
    event = req_obj["newData"]
    event["entity_id"] = generate_entity_id(event["title"])
    logger.debug(f"[STAGING] Generated event entity_id: {event['entity_id']}")

    resp = requests.post(f"{PROFILE_MANAGER_URL}/stage-change", json={
        "userId": user_id,
        "entityType": "event",
        "entityId": event["entity_id"],
        "newData": event
    })
    logger.debug(f"[STAGING] POST /stage-change response: {resp.text}")
    return resp.json()

def process_worldbuilding_request(req_obj, user_id, etype):
    """Stage world-building changes to Profile Manager."""
    logger.debug(f"[STAGING] process_worldbuilding_request called with req_obj: {req_obj}, user_id: {user_id}")

    if not etype or not etype.startswith("worldBuilding-"):
        return {"error": f"Invalid world-building entityType: {etype}"}
    
    category = etype.replace("worldBuilding-", "")
    
    valid_categories = ["magicSystems", "cultures", "locations", 
                       "technology", "history", "organizations"]
    if category not in valid_categories:
        return {"error": f"Invalid world-building category: {category}. Must be one of: {', '.join(valid_categories)}"}
    
    try:
        # Stage the world-building change
        staging_resp = requests.post(
            f"{PROFILE_MANAGER_URL}/stage-change",
            json={
                "userId": user_id,
                "entityType": etype,  # "worldBuilding-magicSystems"
                "entityId": req_obj.get("entityId"),  # Firebase key or None for new
                "newData": req_obj["newData"]
            },
            timeout=10.0
        )
        staging_resp.raise_for_status()
        resp = staging_resp.json()
        logger.debug(f"[STAGING] World-building staging response: {resp}")
        return resp
        
    except requests.HTTPError as e:
        error_msg = f"HTTP {e.response.status_code}: {e.response.text}"
        logger.error(f"[STAGING] World-building staging failed: {error_msg}")
        return {"error": error_msg}
    except Exception as e:
        logger.exception(f"[STAGING] World-building staging exception: {e}")
        return {"error": str(e)}
                                    
# -------------------- ACTION HANDLER BRAINSTORMING --------------------
def handle_action(deepseek_response, user_id, recent_msgs, cfm_session, depth=0, update_status=None):
    """Recursively handle DeepSeek actions."""
    action_start = time.time()
    logger.debug(f"[ACTION] handle_action called at depth={depth}")

    if depth > MAX_DEPTH:
        logger.debug("[ACTION] Maximum recursion depth exceeded")
        return {"chat_message": "Error: recursion depth exceeded", "requests": []}

    # Normalize to list
    if isinstance(deepseek_response, dict):
        responses = [deepseek_response]
    elif isinstance(deepseek_response, list):
        responses = deepseek_response
    else:
        logger.warning(f"[ACTION] Unexpected response type: {type(deepseek_response)}")
        return {"chat_message": "(Error: invalid DeepSeek response)", "requests": []}

    combined_result = {"chat_message": "", "requests": [], "staging_results": [], "profile_data": []}

    for resp in responses:
        action = resp.get("action")
        reasoning = resp.get("reasoning", "")
        data = resp.get("data", {}) or {}

        if action == "respond":
            logger.debug(f"[ACTION] Processing respond action with data: {data}")
            msg = parse_markdown(data.get("message", ""), "html")
            if msg.strip():
                # Get current stage
                current_stage = cfm_session.get_stage()
                
                # Save with stage metadata
                cfm_session.save_message(
                    "assistant", 
                    msg, 
                    stage=current_stage,
                    visible=True
                )
                combined_result["chat_message"] += msg + "\n"
                logger.debug(f"[ACTION] Responding with: {msg}, stage={current_stage}")
            
    for resp in responses:
        action = resp.get("action")
        if action == "respond":
            continue  # already handled

        reasoning = resp.get("reasoning", "")
        data = resp.get("data", {}) or {}
        requests_list = data.get("requests", [])
        last_user_msg = recent_msgs[-1]["content"] if recent_msgs else ""

        logger.debug(f"[ACTION] Processing action: {action}, Data: {data}")

          # -------------------------
          # Core conversational actions
          # -------------------------

        if action == "log_stage":
            if update_status:
                update_status("processing", f"Logging stage: {data.get('stage')}")
            to_stage = data.get("stage")
            if to_stage:
                cfm_session.update_metadata({"stage": to_stage})
                logger.debug(f"[ACTION] Stage updated to {to_stage} (reasoning: {reasoning})")

        # -------------------------
        # CPS-specific actions
        # -------------------------
        elif action == "add_hmw":
            if update_status:
                update_status("processing", "Adding new HMW question")
            q = data.get("hmwQuestion")
            if q:
                hmw_count = cfm_session.add_hmw_question(q)
                logger.debug(f"[ACTION] Added HMW: {q}, total count: {hmw_count}")
                
        elif action == "log_idea":
            if update_status:
                update_status("processing", "Logging new idea")
            idea_text = data.get("idea")
            evals = data.get("evaluations", {})
            if idea_text:
                idea_id = cfm_session.log_idea(idea_text, evals)
                logger.debug(f"[ACTION] Logged idea {idea_id}")
                
        elif action == "evaluate_idea":
            if update_status:
                update_status("processing", "Evaluating idea")
            idea_id = data.get("ideaId")
            evals = data.get("evaluations", {})
            if idea_id and evals:
                eval_result = cfm_session.evaluate_idea(idea_id, evals)
                combined_result["profile_data"].append(eval_result)
                logger.debug(f"[ACTION] Evaluated idea {idea_id}: {eval_result}")
            else:
                logger.debug("[ACTION] Missing ideaId or evaluations for evaluation")

        elif action == "refine_idea":
            if update_status:
                update_status("processing", "Refining idea")
            source_ids = data.get("sourceIdeaIds", [])
            new_idea = data.get("newIdea", {})
            if source_ids and new_idea:
                refine_result = cfm_session.refine_idea(source_ids, new_idea)
                combined_result["profile_data"].append(refine_result)
                logger.debug(f"[ACTION] Refined idea result: {refine_result}")
            else:
                logger.debug("[ACTION] Missing sourceIds or newIdea for refinement")

        elif action == "switch_stage":
            if update_status:
              update_status("processing", "Switching stage")
            to_stage = data.get("toStage")
            if to_stage:
                cfm_session.update_metadata({"stage": to_stage})
                logger.debug(f"[ACTION] Stage switched to {to_stage}")
        
        elif action == "check_progress":
            if update_status:
                update_status("processing", "Checking stage progress")
            result = cfm_session.check_stage_progress()
            logger.debug(f"[ACTION] Check Progress | {reasoning}")
            logger.debug(f"[ACTION] Progress Result: {result}")

            # Always update metadata if stage is ready
            if result.get("ready"):
                suggested = result.get("suggestedNext")
                if suggested:
                    cfm_session.update_metadata({"stage": suggested})
                    logger.debug(f"[ACTION] Stage advanced to {suggested}")

            # Build follow-up messages for DeepSeek (like get_info does)
            followup_messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"User asked: {last_user_msg}"},
                {"role": "assistant", "content": f"Your reasoning was: {reasoning}"},
                {"role": "system", "content": f"Stage check result: {json.dumps(result)}"}
            ]

            followup_start = time.time()
            followup_resp = client.chat.completions.create(
                model="deepseek-chat", messages=followup_messages, stream=False
            )

            followup_time = time.time() - followup_start
            logger.info(f"[TIMING] Follow-up DeepSeek call took {followup_time:.3f}s")
            
            bot_reply_raw = followup_resp.choices[0].message.content.strip()
            logger.debug(f"[ACTION] DeepSeek follow-up raw reply: {bot_reply_raw}")

            try:
                bot_reply_json = parse_deepseek_json(bot_reply_raw)
                bot_reply_json = normalize_deepseek_response(bot_reply_json)
            except Exception as e:
                logger.warning(f"[ACTION] Failed to parse DeepSeek JSON: {e}")
                bot_reply_json = {"action": "respond", "data": {"message": bot_reply_raw}}

            combined_result = handle_action(bot_reply_json, user_id, recent_msgs, cfm_session, depth=depth+1)


        # -------------------------
        # Profile Manager actions
        # -------------------------
        elif action in ["get_info", "query"]:
            if update_status:
              update_status("processing", "Retrieving information from story database...")
            
            info_start = time.time()

            if len(requests_list) > 1:
                # Batch for multiple requests
                profile_data_list = fetch_profile_data_batch(requests_list, user_id)
                combined_result["profile_data"] = profile_data_list
                logger.debug(f"[GET_INFO] Batch fetched {len(profile_data_list)} results")
            else:
                # Single request fallback
                for req in requests_list:
                    data = fetch_profile_data(req, user_id)
                    combined_result["profile_data"].append({"request": req, "data": data})
                    logger.debug(f"[GET_INFO] Single fetch: {req}")
            
            info_time = time.time() - info_start
            logger.info(f"[TIMING] Profile data fetch took {info_time:.3f}s for {len(requests_list)} requests")
            
            if combined_result["profile_data"]:
                info_summary = json.dumps(combined_result["profile_data"], indent=2)
                followup_messages = [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"User asked: {last_user_msg}"},
                    {"role": "assistant", "content": f"Your reasoning was: {reasoning}"},
                    {"role": "system", "content": f"Here is the requested info:\n{info_summary}"}
                ]

                followup_start = time.time()
                followup_resp = client.chat.completions.create(
                    model="deepseek-chat", messages=followup_messages, stream=False
                )

                followup_time = time.time() - followup_start
                logger.info(f"[TIMING] Follow-up DeepSeek call took {followup_time:.3f}s")
                
                bot_reply_raw = followup_resp.choices[0].message.content.strip()
                logger.debug(f"[ACTION] DeepSeek follow-up raw reply: {bot_reply_raw}")

                try:
                    bot_reply_json = parse_deepseek_json(bot_reply_raw)
                    bot_reply_json = normalize_deepseek_response(bot_reply_json)
                except Exception as e:
                    logger.warning(f"[ACTION] Failed to parse DeepSeek JSON: {e}")
                    bot_reply_json = {"action": "respond", "data": {"message": bot_reply_raw}}

                combined_result = handle_action(bot_reply_json, user_id, recent_msgs, cfm_session, depth=depth+1)
        
        elif action == "stage_change":
            if update_status:
                update_status("processing", "Staging changes to story database...")
            
            staging_start = time.time()
            staged_summaries = []
            
            for req in requests_list:
                etype = req.get("entityType")
                
                if etype == "node":
                    resp = process_node_request(req, user_id)
                elif etype == "link":
                    resp = process_link_request(req, user_id)
                elif etype == "event":
                    resp = process_event_request(req, user_id)
                elif etype and etype.startswith("worldBuilding-"):
                    resp = process_worldbuilding_request(req, user_id, etype)
                else:
                    resp = {"error": f"Unknown entityType: {etype}"}
                
                staged_summaries.append(resp)
                logger.debug(f"[STAGING] Staged {etype}: {resp}")

            staging_time = time.time() - staging_start
            logger.info(f"[TIMING] Staging operations took {staging_time:.3f}s")

            for s in staged_summaries:
                cfm_session.save_message(
                    "system", 
                    f"STAGING RESULT: {json.dumps(s)}",
                    action="stage_result", 
                    visible=False
                )

            combined_result["staging_results"] = staged_summaries
            logger.debug(f"[ACTION] Completed stage_change, summaries: {staged_summaries}")

        else:
            logger.debug(f"[ACTION] Unknown action encountered: {action}")

    action_time = time.time() - action_start
    logger.info(f"[TIMING] handle_action completed in {action_time:.3f}s at depth={depth}")
    
    return combined_result

# -------------------- CHAT ENDPOINT --------------------
@app.route("/chat", methods=["POST"])
def chat():
    request_start = time.time()
    logger.debug("[CHAT] /chat endpoint called")
    data = request.json
    user_message = data.get("message")
    user_id = data.get("user_id")
    session_id = data.get("session_id")

    if not user_message or not user_id:
        logger.warning("[CHAT] Missing message or user_id")
        return jsonify({"error": "Message and user_id are required"}), 400
    
    # ------------------ INIT BS SESSION ------------------
    try:
            session_init_start = time.time()
            if session_id:
                try:
                    cfm_session = BSConversationFlowManager(user_id, session_id)
                except Exception as e:
                    logger.warning(f"[WARN] Invalid session_id {session_id}, creating new. Error: {e}")
                    cfm_session = BSConversationFlowManager.create_session(user_id)
                    session_id = cfm_session.session_id
            else:
                cfm_session = BSConversationFlowManager.create_session(user_id)
                session_id = cfm_session.session_id
                logger.info(f"[INFO] New session created: {session_id}")
            
            session_init_time = time.time() - session_init_start
            logger.info(f"[TIMING] Session init took {session_init_time:.3f}s")
    except Exception as e:
        logger.exception(f"Failed to initialize BS session: {e}")
        return jsonify({"error": f"Failed to initialize BS session: {e}"}), 500

    # ========== DEFERRED AUTO-ADVANCE CHECK ==========
    # Check if previous actions should have triggered stage advance
    try:
        check_start = time.time()
        
        # Get current state from CFM
        current_stage = cfm_session.get_stage()
        bs_meta = cfm_session.get_metadata().get("brainstorming", {})
        
        hmw_count = len(bs_meta.get("hmwQuestions", {}))
        ideas_meta = cfm_session.get_all_ideas()
        idea_count = len(ideas_meta)
        
        categories = set()
        for idea in ideas_meta.values():
            cat = idea.get("evaluations", {}).get("flexibilityCategory")
            if cat:
                categories.add(cat)
        category_count = len(categories)
        
        logger.debug(f"[AUTO-CHECK] stage={current_stage}, hmws={hmw_count}, ideas={idea_count}, cats={category_count}")
        
        auto_advanced = False
        advanced_reason = ""
        
        # Check transitions - ONLY if not already advancing
        if current_stage == "Clarify" and hmw_count >= 3:
            logger.info(f"[AUTO-ADVANCE] Clarify → Ideate ({hmw_count} HMWs)")
            cfm_session.switch_stage("Ideate", reasoning=f"Auto-advanced: {hmw_count} HMWs")
            auto_advanced = True
            advanced_reason = f"Auto-advanced Clarify→Ideate: {hmw_count} HMWs met"
            logger.warning(f"[AUTO-CHECK] STAGE ADVANCED: {advanced_reason}")
            
        elif current_stage == "Ideate" and idea_count >= 5 and category_count >= 2:
            logger.info(f"[AUTO-ADVANCE] Ideate → Develop ({idea_count} ideas, {category_count} cats)")
            cfm_session.switch_stage("Develop", reasoning=f"Auto: {idea_count} ideas, {category_count} categories")
            auto_advanced = True
            advanced_reason = f"Auto-advanced Ideate→Develop: {idea_count} ideas, {category_count} categories"
            logger.warning(f"[AUTO-CHECK] STAGE ADVANCED: {advanced_reason}")
        
        check_time = time.time() - check_start
        logger.info(f"[TIMING] Auto-check took {check_time:.3f}s (auto_advanced={auto_advanced})")
        
    except Exception as e:
        logger.error(f"[AUTO-CHECK] Failed: {e}")
        import traceback
        logger.error(traceback.format_exc())

    # ------------------ SAVE USER MESSAGE ------------------
    try:
        cfm_session.save_message(
            role="user",
            content=user_message,
            stage=cfm_session.get_stage(),
            visible=True
        )
    except Exception as e:
        logger.warning(f"Failed to save incoming user message: {e}")

    # ------------------ SUMMARISATION ------------------
    try:
        summary_start = time.time()
        recent = cfm_session.get_recent_messages(limit=KEEP_LAST_N)
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
        
        recent_msgs = cfm_session.get_recent_messages(limit=10)["unsummarised"]
    
    except Exception as e:
        logger.warning(f"Failed during summarisation: {e}")
        recent_msgs = []

    # ------------------ DEEPSEEK CALL ------------------
    try:
      session_snapshot = cfm_session.get_session_snapshot()
      
      deepseek_messages = [
          {"role": "system", "content": SYSTEM_PROMPT},
          {
              "role": "system", 
              "content": f"Session Context:\n{json.dumps(session_snapshot, indent=2)}"
          }
      ]
      
      for m in recent_msgs:
        deepseek_messages.append({
            "role": m["role"], 
            "content": m["content"]
        })

      deepseek_messages.append({"role": "user", "content": user_message})
    except Exception as e:
      logger.exception(f"Error generating snapshot: {e}")
      deepseek_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
      
      for m in recent_msgs:
          deepseek_messages.append({
              "role": m["role"], 
              "content": m["content"]
          })
      deepseek_messages.append({"role": "user", "content": user_message})
      
    try:
        llm_start = time.time()
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=deepseek_messages,
            stream=False
        )

        llm_duration = time.time() - llm_start
        logger.info(f"[TIMING] DeepSeek API call took {llm_duration:.3f}s")
        
        bot_reply_raw = response.choices[0].message.content.strip()
        logger.debug(f"[CHAT] DeepSeek raw response: {bot_reply_raw}")

        parse_start = time.time()
        bot_reply_json_list = parse_deepseek_json(bot_reply_raw) or [
            {"action": "respond", "data": {"message": bot_reply_raw}}
        ]

        # Normalize
        bot_reply_json = normalize_deepseek_response(bot_reply_json_list)
        
        parse_time = time.time() - parse_start
        logger.info(f"[TIMING] Response parsing took {parse_time:.3f}s")

        respond_actions = []
        immediate_actions = []   # NEW: add_hmw, log_idea, check_progress - need auto-advance
        background_actions = []  # get_info, stage_change - can be async
        
        # Handle both list and single dict
        actions_list = bot_reply_json if isinstance(bot_reply_json, list) else [bot_reply_json]
        
        for obj in actions_list:
            if isinstance(obj, dict):
                action_type = obj.get("action")
                
                if action_type == "respond":
                    respond_actions.append(obj)
                elif action_type in ["add_hmw", "log_idea", "check_progress", "evaluate_idea", "refine_idea"]:
                    immediate_actions.append(obj)  # ← Process in main thread
                else:
                    background_actions.append(obj)  # get_info, stage_change, query
        
        logger.info(f"[CHAT] Actions: {len(respond_actions)} respond, {len(immediate_actions)} immediate, {len(background_actions)} background")

          # ========== PROCESS IMMEDIATE ACTIONS IN MAIN THREAD ==========
        if immediate_actions:
            logger.debug(f"[CHAT] Processing {len(immediate_actions)} immediate actions in main thread")
            immediate_start = time.time()
            
            try:
                immediate_result = handle_action(
                    immediate_actions,
                    user_id,
                    recent_msgs,
                    cfm_session,
                    depth=0
                )
                
                immediate_time = time.time() - immediate_start
                logger.info(f"[TIMING] Immediate actions took {immediate_time:.3f}s")
                
                # CRITICAL: Force metadata refresh after immediate actions
                logger.debug("[CHAT] Forcing metadata refresh after immediate actions")
                cfm_session._refresh_metadata_cache()
                cfm_session._refresh_ideas_cache()
                
            except Exception as e:
                logger.error(f"[CHAT] Immediate action processing failed: {e}")
                import traceback
                logger.error(traceback.format_exc())
                
        # Extract ONLY respond action for immediate return
        chat_message = None
        for obj in respond_actions:
            msg = obj.get("data", {}).get("message", "")
            if msg:
                chat_message = parse_markdown(msg, "html")
                break
        
        # Fallback if no respond
        if not chat_message:
            stripped = bot_reply_raw.strip()
            if not (stripped.startswith("{") or stripped.startswith("[")):
                chat_message = parse_markdown(bot_reply_raw, "html")
            else:
                chat_message = None
                logger.info("[CHAT] No respond action, background will handle")

        # ------------------ SAVE ASSISTANT MESSAGE ------------------
        try:
            if chat_message:
                cfm_session.save_message(
                    role="assistant",
                    content=chat_message,
                    stage=cfm_session.get_stage(),
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
            "mode": "brainstorming",
            "background_processing": len(background_actions) > 0
        }

        # ------------------ BACKGROUND THREAD (ONLY FOR HEAVY OPS) ------------------
        if background_actions:
            logger.debug(f"[CHAT] Spawning background thread for {len(background_actions)} actions")
            
            threading.Thread(
              target=background_handle_action,
              args=(background_actions, user_id, recent_msgs, cfm_session),
              daemon=True
            ).start()
            logger.debug("[CHAT] Background thread started")
        else:
            logger.info("[CHAT] No background actions to process")

        return jsonify(result), 200


    except Exception as e:
        total_time = time.time() - request_start
        logger.exception(f"[CHAT] DeepSeek API error after {total_time:.3f}s: {e}")
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
    logger.debug("[SERVER] Starting Flask server")
    app.run(host="0.0.0.0", port=5002, debug=True, threaded=True)
