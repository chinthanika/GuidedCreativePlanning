import time
import json
import random
import os
import requests

from utils.cache import (
    metadata_cache, summaries_cache, cache_stats,
    metadata_lock, summaries_lock,
    invalidate_metadata, invalidate_summaries
)

import logging
from logging.handlers import RotatingFileHandler

# ------------------ LOGGING SETUP ------------------
os.makedirs("logs", exist_ok=True)
log_file = "logs/bs_cfm_debug.log"
rotating_handler = RotatingFileHandler(
    log_file, mode='a', maxBytes=5*1024*1024, backupCount=3
)
formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
rotating_handler.setFormatter(formatter)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
logger.addHandler(rotating_handler)

# ------------------ CONFIG ------------------
SESSION_API_URL = "http://localhost:4000"

RATING_MAP = {"Low": 1, "Medium": 2, "High": 3}
REVERSE_MAP = {1: "Low", 2: "Medium", 3: "High"}

CPS_STAGES = ["Clarify", "Ideate", "Develop", "Implement"]
KEEP_LAST_N = 5  # how many summaries to keep for context


class BSConversationFlowManager:
    def __init__(self, uid: str, session_id: str):
        logger.debug(f"[SESSION INIT] Initialising session for UID={uid}, session_id={session_id}")
        if not uid or not session_id:
            logger.error("[SESSION INIT] Missing uid or session_id")
            raise ValueError("uid and session_id are required")

        self.uid = uid
        self.session_id = session_id

        # No direct DB refs. We will call Session API endpoints.
        # For local convenience we can fetch some metadata & ideas on init (cached).
        self._metadata_cache = None
        self._ideas_cache = None

        try:
            self._refresh_metadata_cache()
            self._refresh_ideas_cache()
            logger.debug("[SESSION INIT] Session API connection OK.")
        except Exception as e:
            logger.exception("[SESSION INIT] Failed to connect to Session API: %s", e)
            raise

    # ------------------ HTTP helpers ------------------
    def _url(self, path: str) -> str:
        return f"{SESSION_API_URL}{path}"

    def _post(self, path: str, payload: dict, timeout: float = 10.0) -> dict:
        try:
            r = requests.post(self._url(path), json=payload, timeout=timeout)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.exception(f"[HTTP POST] {path} failed: {e} | payload={payload}")
            raise

    def _get(self, path: str, params: dict = None, timeout: float = 10.0) -> dict:
        try:
            r = requests.get(self._url(path), params=params, timeout=timeout)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.exception(f"[HTTP GET] {path} failed: {e} | params={params}")
            raise

    # ------------------ SESSION MGMT ------------------
    @staticmethod
    def create_session(uid: str):
        shared_meta = {"title": "New Chat"}
        dt_meta = {
            "currentCategory": None,
            "currentAngle": None,
            "asked": [],
            "depth": 0,
            "followUpCount": 0,
        }
        bs_meta = {
            "stage": "Clarify",
            "parentSessionId": None,
            "hmwQuestions": [],
            "stageHistory": [],
            "fluencyScore": "Low",
            "flexibilityCategories": []
        }

        payload = {
            "uid": uid,
            "metadata_shared": shared_meta,
            "metadata_dt": dt_meta,
            "metadata_bs": bs_meta
        }

        res = requests.post(f"{SESSION_API_URL}/session/create", json=payload, timeout=10.0)
        res.raise_for_status()
        session_id = res.json().get("sessionID")
        logger.debug(f"[SESSION CREATE] Created session {session_id} for uid={uid}")
        return BSConversationFlowManager(uid, session_id)

    def _refresh_metadata_cache(self):
        """Internal refresh without cache checking."""
        payload = {"uid": self.uid, "sessionID": self.session_id}
        res = self._post("/session/get_metadata", payload)
        metadata = res.get("metadata", {}) if isinstance(res, dict) else {}
        self._metadata_cache = metadata
        logger.debug(f"[CACHE] Metadata cache refreshed: keys={list(metadata.keys())}")

    def _refresh_ideas_cache(self):
        payload = {"uid": self.uid, "sessionID": self.session_id}
        res = self._post("/cps/get_ideas", payload)
        ideas = res.get("ideas", {}) if isinstance(res, dict) else {}
        self._ideas_cache = ideas
        logger.debug(f"[CACHE] Ideas cache refreshed: count={len(ideas)}")

    def get_metadata(self):
        """Thread-safe cached metadata retrieval."""
        cache_key = f"dt:{self.uid}:{self.session_id}"
        
        with metadata_lock:
            if cache_key in metadata_cache:
                cache_stats["metadata_hits"] += 1
                logger.debug(f"[CACHE HIT] Metadata for {cache_key}")
                return metadata_cache[cache_key].get("deepthinking", {})
        
        # Cache miss
        cache_stats["metadata_misses"] += 1
        logger.debug(f"[CACHE MISS] Fetching metadata for {cache_key}")
        
        fetch_start = time.time()
        payload = {"uid": self.uid, "sessionID": self.session_id}
        res = self._post("/session/get_metadata", payload)
        fetch_time = time.time() - fetch_start
        logger.info(f"[TIMING] Metadata fetch took {fetch_time:.3f}s")
        
        metadata = res.get("metadata", {}) if isinstance(res, dict) else {}
        
        with metadata_lock:
            metadata_cache[cache_key] = metadata
            self._metadata_cache = metadata
        
        return metadata.get("brainstorming", {}) if metadata else {}

    def update_metadata(self, updates: dict):
        """Update with cache invalidation."""
        if not isinstance(updates, dict):
            raise ValueError("updates must be a dict")

        payload = {
            "uid": self.uid,
            "sessionID": self.session_id,
            "updates": updates,
            "mode": "deepthinking"
        }

        try:
            self._post("/session/update_metadata", payload)
        except Exception:
            logger.exception("Failed to update deepthinking metadata via Session API")
            raise

        # Invalidate cache
        cache_key = f"dt:{self.uid}:{self.session_id}"
        invalidate_metadata(cache_key)
        logger.debug(f"[CACHE INVALIDATE] Cleared metadata cache for {cache_key}")

        # Refresh local cache
        self._refresh_metadata_cache()

    def save_message(self, role: str, content: str, stage=None, visible=True, summarised=False, action=None):
        """Save message asynchronously."""
        logger.debug(f"[MESSAGE SAVE] Queueing message role={role}, stage={stage}")
        
        payload = {
            "uid": self.uid,
            "sessionID": self.session_id,
            "role": role,
            "content": content,
            "mode": "brainstorming",
            "extra": {
                "stage": stage, 
                "visible": visible, 
                "summarised": summarised, 
                "action": action}
        }
        
        import threading
        def save_async():
            try:
                res = self._post("/session/save_message", payload)
                msg_id = res.get("messageID")
                logger.debug(f"[MESSAGE SAVE] Message saved with ID={msg_id}")
            except Exception as e:
                logger.error(f"[MESSAGE SAVE] Failed: {e}")
        
        threading.Thread(target=save_async, daemon=True).start()
        return None

    # ----------- HMW MGMT -----------
    def add_hmw_question(self, question: str):
        logger.debug(f"[HMW ADD] Adding HMW question: {question}")
        payload = {"uid": self.uid, "sessionID": self.session_id, "question": {
            "question": question,
            "timestamp": int(time.time() * 1000)
        }}
        res = self._post("/cps/add_hmw", payload)
        hmw_id = res.get("hmwID")
        logger.debug(f"[HMW ADD] HMW saved with ID {hmw_id}")
        # refresh metadata cache (hmwQuestions is under brainstorming metadata)
        self._refresh_metadata_cache()
        # return updated length if present
        hmw_list = self._metadata_cache.get("brainstorming", {}).get("hmwQuestions", {}) or {}
        length = len(hmw_list)
        logger.debug(f"[HMW ADD] Total HMW questions now: {length}")
        return length

    # ----------- IDEA MGMT -----------
    def log_idea(self, idea_text: str, evaluations: dict = None):
        logger.debug(f"[IDEA LOG] Logging idea: {idea_text}, evaluations={evaluations}")
        data = {
            "text": idea_text,
            "category": evaluations.get("flexibilityCategory") if evaluations else None,
            "evaluations": evaluations or {},
            "createdAt": int(time.time() * 1000)
        }
        payload = {"uid": self.uid, "sessionID": self.session_id, "data": data}
        res = self._post("/cps/add_idea", payload)
        idea_id = res.get("ideaID")
        logger.debug(f"[IDEA LOG] Idea saved with ID={idea_id}")
        # refresh ideas cache and update metrics
        self._refresh_ideas_cache()
        self.update_idea_metrics()
        return idea_id

    def attach_evaluations(self, idea_id: str, evaluations: dict):
        """
        Attach multiple evaluations to an idea.
        """
        logger.debug(f"[IDEA EVAL] Attaching multiple evals to idea {idea_id}")

        payload = {"uid": self.uid, "sessionID": self.session_id}
        ideas = self._post("/cps/get_ideas", payload).get("ideas", {})

        if idea_id not in ideas:
            logger.error(f"Idea {idea_id} not found in session {self.session_id}")
            return {"error": "Idea not found"}

        idea = ideas[idea_id]
        idea["evaluations"] = evaluations

        # Re-save directly
        session = session(self.uid, self.session_id)
        idea_ref = session.session_ref.child("ideas").child(idea_id)
        idea_ref.set(idea)

        logger.info(f"Idea {idea_id} updated with evaluations {evaluations}")

        # refresh cache and metrics
        self._refresh_ideas_cache()
        self.update_idea_metrics()
        return {"success": True, "ideaID": idea_id}
    
    # ----------- HEURISTICS -----------
    def evaluate_fluency(self):
        logger.debug("[HEURISTIC] Evaluating fluency via Session API")
        payload = {"uid": self.uid, "sessionID": self.session_id}
        res = self._post("/cps/get_fluency", payload)
        fluency = res.get("fluency", {})
        # also update metadata via session API
        try:
            self._post("/session/update_metadata", {"uid": self.uid, "sessionID": self.session_id, "updates": {"fluencyScore": fluency.get("score")}, "mode": "brainstorming"})
            logger.debug(f"[HEURISTIC] Fluency metadata updated: {fluency}")
        except Exception:
            logger.exception("[HEURISTIC] Failed to update fluency metadata")
        return fluency

    def evaluate_flexibility(self):
        logger.debug("[HEURISTIC] Evaluating flexibility via Session API")
        payload = {"uid": self.uid, "sessionID": self.session_id}
        res = self._post("/cps/get_flexibility", payload)
        flexibility = res.get("flexibility", {})
        try:
            self._post("/session/update_metadata", {"uid": self.uid, "sessionID": self.session_id, "updates": {"flexibilityCategories": flexibility.get("categories", [])}, "mode": "brainstorming"})
            logger.debug(f"[HEURISTIC] Flexibility metadata updated: {flexibility}")
        except Exception:
            logger.exception("[HEURISTIC] Failed to update flexibility metadata")
        return flexibility

    # ----------- STAGE MGMT -----------
    def get_stage(self):
        logger.debug("[STAGE] Fetching current stage via metadata")
        metadata = self.get_metadata().get("brainstorming", {})
        stage = metadata.get("stage", "Clarify")
        logger.debug(f"[STAGE] Current stage: {stage}")
        return stage

    def switch_stage(self, new_stage: str, reasoning: str):
        logger.debug(f"[STAGE SWITCH] Switching stage to {new_stage} due to: {reasoning}")
        if new_stage not in CPS_STAGES:
            logger.error(f"[STAGE SWITCH] Invalid stage: {new_stage}")
            raise ValueError(f"Invalid CPS stage: {new_stage}")
        # update metadata: stage & stageHistory
        md = self.get_metadata().get("brainstorming", {})
        stage_history = md.get("stageHistory", [])
        stage_history.append({
            "from": md.get("stage"),
            "to": new_stage,
            "reasoning": reasoning,
            "timestamp": int(time.time() * 1000)
        })
        updates = {"stage": new_stage, "stageHistory": stage_history}
        payload = {"uid": self.uid, "sessionID": self.session_id, "updates": updates, "mode": "brainstorming"}
        self._post("/session/update_metadata", payload)
        logger.debug("[STAGE SWITCH] Stage updated successfully")

    def check_stage_progress(self):
        stage = self.get_stage()
        logger.debug(f"[STAGE CHECK] Checking progress for stage: {stage}")
        if stage == "Clarify":
            metadata = self.get_metadata().get("brainstorming", {})
            if len(metadata.get("hmwQuestions", {})) >= 3:
                logger.debug("[STAGE CHECK] Ready to move to Ideate")
                return {"ready": True, "suggestedNext": "Ideate"}
            return {"ready": False}

        if stage == "Ideate":
            fluency = self.evaluate_fluency()
            flexibility = self.evaluate_flexibility()
            if fluency.get("score") != "Low" and flexibility.get("score") != "Low":
                logger.debug("[STAGE CHECK] Ready to move to Develop")
                return {"ready": True, "suggestedNext": "Develop"}
            return {"ready": False}

        if stage == "Develop":
            ideas = self.get_all_ideas()
            refined = [i for i in ideas.values() if i.get("evaluations", {}).get("refined")]
            if len(refined) >= 2:
                logger.debug("[STAGE CHECK] Ready to move to Implement")
                return {"ready": True, "suggestedNext": "Implement"}
            return {"ready": False}

        if stage == "Implement":
            logger.debug("[STAGE CHECK] Already at Implement stage")
            return {"ready": True, "suggestedNext": None}

        return {"ready": False}
    
    # ----------- IDEA METRICS -----------
    def _compute_idea_metrics(self):
        if self._ideas_cache is None:
            self._refresh_ideas_cache()

        ideas = self._ideas_cache or {}

        # Fluency = count of ideas
        fluency = len(ideas)

        # Flexibility = number of distinct categories
        categories = set()
        originality_scores = []
        elaboration_scores = []

        for idea in ideas.values():
            if idea.get("category"):
                categories.add(idea["category"])

            evals = idea.get("evaluations", {}) or {}
            if "Originality" in evals:
                originality_scores.append(RATING_MAP.get(evals["Originality"], 0))
            if "Elaboration" in evals:
                elaboration_scores.append(RATING_MAP.get(evals["Elaboration"], 0))

        flexibility = len(categories)

        def avg_to_label(scores):
            if not scores:
                return None
            avg = round(sum(scores) / len(scores))
            return REVERSE_MAP.get(avg)

        originality_avg = avg_to_label(originality_scores)
        elaboration_avg = avg_to_label(elaboration_scores)

        return {
            "Fluency": fluency,
            "Flexibility": flexibility,
            "Originality": originality_avg,
            "Elaboration": elaboration_avg
        }

    def update_idea_metrics(self):
        metrics = self._compute_idea_metrics()
        updates = {"metrics": metrics}
        payload = {
            "uid": self.uid,
            "sessionID": self.session_id,
            "updates": updates,
            "mode": "brainstorming"
        }
        self._post("/session/update_metadata", payload)
        logger.debug(f"[IDEA METRICS] Updated brainstorming metrics: {metrics}")
        return metrics

    # ----------- DELEGATION TO AI -----------
    def request_ai_evaluation(self, idea_id: str, idea_text: str):
        logger.debug(f"[AI REQUEST] Requesting evaluation for idea_id={idea_id}")
        payload = {
            "action": "evaluate_idea",
            "params": {"ideaId": idea_id, "text": idea_text}
        }
        logger.debug(f"[AI REQUEST] Payload: {payload}")
        return payload

    def request_ai_refinement(self, idea_id: str, idea_text: str, focus: str = None):
        logger.debug(f"[AI REQUEST] Requesting refinement for idea_id={idea_id}, focus={focus}")
        payload = {
            "action": "refine_idea",
            "params": {"ideaId": idea_id, "text": idea_text, "focus": focus}
        }
        logger.debug(f"[AI REQUEST] Payload: {payload}")
        return payload

    def request_ai_combination(self, idea_ids: list, idea_texts: list):
        logger.debug(f"[AI REQUEST] Requesting combination for idea_ids={idea_ids}")
        payload = {
            "action": "combine_ideas",
            "params": {"ideaIds": idea_ids, "texts": idea_texts}
        }
        logger.debug(f"[AI REQUEST] Payload: {payload}")
        return payload

    def evaluate_idea(self, idea_id: str, evaluation: dict):
        """
        Instead of calling /cps/update_idea, we re-fetch the idea,
        attach evaluation, and re-add with the same ID overwritten.
        """
        logger.debug(f"[IDEA EVAL] Evaluating idea {idea_id}: {evaluation}")

        # Fetch all ideas
        payload = {"uid": self.uid, "sessionID": self.session_id}
        ideas = self._post("/cps/get_ideas", payload).get("ideas", {})

        if idea_id not in ideas:
            logger.error(f"Idea {idea_id} not found in session {self.session_id}")
            return {"error": "Idea not found"}

        # Attach/overwrite evaluation
        idea = ideas[idea_id]
        idea["evaluation"] = evaluation

        # Re-save under same ID (overwrite)
        session = session(self.uid, self.session_id)
        idea_ref = session.session_ref.child("ideas").child(idea_id)
        idea_ref.set(idea)

        logger.info(f"Idea {idea_id} updated with evaluation {evaluation}")
        return {"success": True, "ideaID": idea_id}

    def refine_idea(self, source_ids: list, new_idea: dict):
        logger.debug(f"[IDEA REFINE] Refining/combining ideas: {source_ids} into new idea")
        payload = {
            "uid": self.uid,
            "sessionID": self.session_id,
            "sourceIds": source_ids,
            "newIdea": new_idea
        }
        res = self._post("/cps/refine_idea", payload)
        logger.debug(f"[IDEA REFINE] Session API response: {res}")
        # refresh ideas and update metrics
        self._refresh_ideas_cache()
        self.update_idea_metrics()
        return res

    # ----------- MESSAGES & SUMMARISATION -----------
    def get_recent_messages(self, limit=10, maxed_out=False):
        """Return existing summaries (cached) + unsummarised messages."""
        cache_key = f"summaries:{self.uid}:{self.session_id}"
        
        try:
            # Try to get summaries from cache
            if cache_key in summaries_cache and not maxed_out:
                cache_stats["summaries_hits"] += 1
                cached_data = summaries_cache[cache_key]
                logger.debug(f"[CACHE HIT] Summaries for {cache_key}")
            else:
                cache_stats["summaries_misses"] += 1
                logger.debug(f"[CACHE MISS] Fetching summaries for {cache_key}")
                
                # Fetch fresh summaries
                self._refresh_metadata_cache()
                md = self._metadata_cache or {}
                summaries = md.get("shared", {}).get("summaries", {}) or {}
                summaries_list = [v for _, v in sorted(summaries.items())]
                
                cached_data = {"summaries": summaries_list}
                summaries_cache[cache_key] = cached_data

            # Always fetch fresh unsummarised messages (these change frequently)
            payload = {"uid": self.uid, "sessionID": self.session_id}
            res = self._post("/session/get_messages", payload)
            messages_snapshot = res.get("messages", {}) or {}

            if not messages_snapshot:
                dt_meta = self.get_metadata()
                return {"summaries": cached_data["summaries"], "unsummarised": [], "dt_metadata": dt_meta}

            msgs = sorted(messages_snapshot.items(), key=lambda kv: kv[1].get("timestamp", 0))
            unsummarised = []

            for msg_id, m in msgs:
                if m.get("summarised") is False or m.get("summarised") is None:
                    unsummarised.append({**m, "id": msg_id})

            if not maxed_out and len(unsummarised) > limit:
                unsummarised = unsummarised[-limit:]

            dt_meta = self.get_metadata()
            
            return {"summaries": cached_data["summaries"], "unsummarised": unsummarised, "dt_metadata": dt_meta}

        except Exception as e:
            logger.exception("[ERROR] get_recent_messages failed: %s", e)
            return {"summaries": [], "unsummarised": [], "dt_metadata": {}}
        
    def summarise_and_store(self, deepseek_client, session_id, unsummarised_msgs):
        logger.debug(f"[SUMMARISATION] Summarising {len(unsummarised_msgs)} messages")
        try:
            if not unsummarised_msgs:
                logger.debug("[SUMMARISATION] No messages to summarise, returning last summaries")
                return {"summaries": self.get_recent_messages(limit=KEEP_LAST_N)["summaries"], "unsummarised": []}

            summary_prompt = "Summarise these messages:\n" + "\n".join(
                [f"{m.get('role','unknown')}: {m.get('content','')}" for m in unsummarised_msgs]
            )
            logger.debug(f"[SUMMARISATION] Prompt: {summary_prompt}")

            response = deepseek_client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": "You are a helpful summariser."},
                    {"role": "user", "content": summary_prompt},
                ],
            )

            summary_text = response.choices[0].message.content
            logger.debug(f"[SUMMARISATION] Summarisation result: {summary_text}")

            # append summary to metadata.shared.summaries by fetching existing summaries and updating
            md = self.get_metadata()
            shared = md.get("shared", {})
            existing_summaries = shared.get("summaries", {}) or {}
            # follow Firebase 'push' style by making a random key
            ts_key = str(int(time.time() * 1000))
            existing_summaries[ts_key] = summary_text

            # update via session API
            updates = {"summaries": existing_summaries}
            payload = {"uid": self.uid, "sessionID": self.session_id, "updates": updates, "mode": "shared"}
            self._post("/session/update_metadata", payload)
            logger.debug("[SUMMARISATION] Stored summary via Session API")

            # mark messages summarised by calling a session endpoint to update message flags
            # This requires a Session API endpoint: POST /session/mark_messages_summarised
            msg_ids = [m["id"] for m in unsummarised_msgs]
            try:
                self._post("/session/mark_messages_summarised", {"uid": self.uid, "sessionID": self.session_id, "messageIDs": msg_ids})
                logger.debug("[SUMMARISATION] Marked messages summarised via Session API")
            except Exception:
                logger.exception("[SUMMARISATION] Failed to mark messages summarised via Session API (endpoint may be missing)")

            # refresh metadata cache
            self._refresh_metadata_cache()
            return {"summaries": list(existing_summaries.values())[-KEEP_LAST_N:], "unsummarised": []}

        except Exception as e:
            logger.exception(f"[SUMMARISATION ERROR] {e}")
            return {"summaries": [], "unsummarised": unsummarised_msgs}
