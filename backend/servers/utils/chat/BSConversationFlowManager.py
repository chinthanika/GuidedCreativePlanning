import time
import json
import random
import os
import requests
import threading

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
SESSION_API_URL = "https://guidedcreativeplanning-session.onrender.com"

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
        self._metadata_cache = None
        self._ideas_cache = None

        try:
            self._refresh_metadata_cache()
            self._refresh_ideas_cache()
            logger.debug("[SESSION INIT] Session API connection OK.")
        except Exception as e:
            logger.exception("[SESSION INIT] Failed to connect to Session API: %s", e)
            raise

        try:
            requests.post(
                f"{SESSION_API_URL}/session/switch_mode",
                json={"uid": uid, "sessionID": session_id, "mode": "brainstorming"},
                timeout=5.0
            )
            logger.debug("[SESSION INIT] Switched to brainstorming mode")
        except Exception as e:
            logger.warning(f"[SESSION INIT] Failed to switch mode: {e}")

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
            "hmwQuestions": {},
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

        # ADD LOGGING TO DEBUG
        logger.debug(f"[SESSION CREATE] Sending payload: {payload}")
        
        res = requests.post(f"{SESSION_API_URL}/session/create", json=payload, timeout=10.0)
        res.raise_for_status()
        
        response_data = res.json()
        logger.debug(f"[SESSION CREATE] Response: {response_data}")
        
        session_id = response_data.get("sessionID")
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
        cache_key = f"bs:{self.uid}:{self.session_id}"
        
        with metadata_lock:
            if cache_key in metadata_cache:
                cache_stats["metadata_hits"] += 1
                logger.debug(f"[CACHE HIT] Metadata for {cache_key}")
                return metadata_cache[cache_key]
        
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
        
        return metadata

    def update_metadata(self, updates: dict, mode: str = "brainstorming"):
        """Update with cache invalidation."""
        if not isinstance(updates, dict):
            raise ValueError("updates must be a dict")

        payload = {
            "uid": self.uid,
            "sessionID": self.session_id,
            "updates": updates,
            "mode": mode
        }

        try:
            self._post("/session/update_metadata", payload)
        except Exception:
            logger.exception("Failed to update brainstorming metadata via Session API")
            raise

        # Invalidate cache
        cache_key = f"bs:{self.uid}:{self.session_id}"
        invalidate_metadata(cache_key)
        logger.debug(f"[CACHE INVALIDATE] Cleared metadata cache for {cache_key}")

        # Refresh local cache
        self._refresh_metadata_cache()

    def save_message(self, role: str, content: str, stage=None, visible=True, summarised=False, action=None, evaluations=None):
        """Save message asynchronously."""
        logger.debug(f"[MESSAGE SAVE] Queueing message role={role}, stage={stage}, evals={evaluations is not None}")
        
        extra = {
            "stage": stage, 
            "visible": visible, 
            "summarised": summarised, 
            "action": action
        }

        if evaluations:
            extra["evaluations"] = evaluations
            logger.debug(f"[MESSAGE SAVE] Storing evaluations: {evaluations}")

        payload = {
            "uid": self.uid,
            "sessionID": self.session_id,
            "role": role,
            "content": content,
            "mode": "brainstorming",
            "extra": extra
        }
        
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
        """
        Add HMW question with synchronous verification.
        Returns: total HMW count
        """
        logger.debug(f"[HMW ADD] Adding HMW question: {question}")
        payload = {
            "uid": self.uid, 
            "sessionID": self.session_id, 
            "question": {
                "question": question,
                "timestamp": int(time.time() * 1000)
            }
        }

        res = self._post("/cps/add_hmw", payload)
        hmw_id = res.get("hmwID")

        if not hmw_id:
            raise Exception("[HMW ADD] CRITICAL: No hmwID returned!")

        logger.debug(f"[HMW ADD] HMW saved with ID {hmw_id}")
        
        # Force cache invalidation
        cache_key = f"bs:{self.uid}:{self.session_id}"
        invalidate_metadata(cache_key)
        logger.debug(f"[HMW ADD] Invalidated cache for {cache_key}")

        # Refresh with retry to ensure HMW appears
        max_retries = 3
        for attempt in range(max_retries):
            time.sleep(0.3 * (attempt + 1))  # Progressive delay
            self._refresh_metadata_cache()
            
            # Verify HMW appears
            metadata = self.get_metadata()
            bs_meta = metadata.get("brainstorming", {})
            hmw_list = bs_meta.get("hmwQuestions", {}) or {}
            
            if hmw_id in hmw_list:
                logger.debug(f"[HMW ADD] HMW {hmw_id} confirmed after {attempt + 1} attempts")
                break
            
            if attempt < max_retries - 1:
                logger.warning(f"[HMW ADD] HMW {hmw_id} not visible yet, retry {attempt + 1}/{max_retries}")
        
        length = len(hmw_list)
        logger.debug(f"[HMW ADD] Total HMW questions now: {length}")
        return length

    # ----------- IDEA MGMT -----------
    def log_idea(self, idea_text: str, evaluations: dict = None):
        """
        Log idea with synchronous progress check after persistence.
        Returns: idea_id
        """
        logger.debug(f"[IDEA LOG] Logging idea: {idea_text}, evaluations={evaluations}")
        
        data = {
            "text": idea_text,
            "category": evaluations.get("flexibilityCategory") if evaluations else None,
            "evaluations": evaluations or {},
            "createdAt": int(time.time() * 1000),
            "refined": False
        }
        
        payload = {"uid": self.uid, "sessionID": self.session_id, "data": data}
        res = self._post("/cps/add_idea", payload)
        idea_id = res.get("ideaID")
        logger.debug(f"[IDEA LOG] Idea saved with ID={idea_id}")
        
        # Update category tracking if evaluation provided
        if evaluations and evaluations.get("flexibilityCategory"):
            self._add_category(evaluations["flexibilityCategory"])
        
        # CRITICAL: Force immediate cache refresh with retry logic
        max_retries = 3
        for attempt in range(max_retries):
            self._refresh_ideas_cache()
            
            # Verify the idea appears in cache
            if idea_id in (self._ideas_cache or {}):
                logger.debug(f"[IDEA LOG] Idea {idea_id} confirmed in cache after {attempt + 1} attempts")
                break
            
            if attempt < max_retries - 1:
                logger.warning(f"[IDEA LOG] Idea {idea_id} not yet in cache, retry {attempt + 1}/{max_retries}")
                time.sleep(0.3 * (attempt + 1))  # Progressive backoff
        
        # Update metrics with fresh cache
        self.update_idea_metrics()
        
        return idea_id

    def get_all_ideas(self):
        """
        Fetch all ideas for this session.
        Uses cached ideas if available, otherwise refreshes from Session API.
        """
        logger.debug("[IDEAS] Fetching all ideas")
        
        # Use cached ideas if available
        if self._ideas_cache is None:
            self._refresh_ideas_cache()
        
        return self._ideas_cache or {}


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
            self.update_metadata({"fluencyScore": fluency.get("score")}, mode="brainstorming")
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
            self.update_metadata(
                {"flexibilityCategories": flexibility.get("categories", [])},
                mode="brainstorming"
            )

            logger.debug(f"[HEURISTIC] Flexibility metadata updated: {flexibility}")
        except Exception:
            logger.exception("[HEURISTIC] Failed to update flexibility metadata")
        return flexibility

    # ----------- STAGE MGMT -----------
    def get_stage(self):
        logger.debug("[STAGE] Fetching current stage via metadata")
        metadata = self.get_metadata()
        bs_meta = metadata.get("brainstorming", {})
        stage = bs_meta.get("stage", "Clarify")

        logger.debug(f"[STAGE] Current stage: {stage}")
        return stage

    def switch_stage(self, new_stage: str, reasoning: str):
        logger.debug(f"[STAGE SWITCH] Switching stage to {new_stage} due to: {reasoning}")
        
        if new_stage not in CPS_STAGES:
            logger.error(f"[STAGE SWITCH] Invalid stage: {new_stage}")
            raise ValueError(f"Invalid CPS stage: {new_stage}")
        
        # update metadata: stage & stageHistory
        md = self._metadata_cache or self.get_metadata()
        bs_meta = md.get("brainstorming", {})
        stage_history = bs_meta.get("stageHistory", [])
        
        stage_history.append({
            "from": bs_meta.get("stage"),
            "to": new_stage,
            "reasoning": reasoning,
            "timestamp": int(time.time() * 1000)
        })

        updates = {"stage": new_stage, "stageHistory": stage_history}
        try:
            self.update_metadata(updates, mode="brainstorming")
            logger.debug("[STAGE SWITCH] Stage updated successfully")
        except Exception as e:
            logger.exception(f"[STAGE SWITCH] Failed: {e}")
            raise

    def check_stage_progress(self):
        stage = self.get_stage()
        logger.debug(f"[STAGE CHECK] Checking progress for stage: {stage}")
        
        bs_meta = self.get_metadata().get("brainstorming", {})
        ideas = self.get_all_ideas()
        
        # Get counts
        hmw_count = len(bs_meta.get("hmwQuestions", {}))
        idea_count = len(ideas)
        categories = bs_meta.get("flexibilityCategories", [])
        
        # Calculate quality metrics from ideas
        refined_count = sum(1 for i in ideas.values() if i.get("refined", False))
        high_quality_count = 0
        
        for idea in ideas.values():
            evals = idea.get("evaluations", {})
            if evals.get("elaboration") in ["Medium", "High"] or \
               evals.get("originality") in ["Medium", "High"]:
                high_quality_count += 1
        
        result = {
            "currentStage": stage,
            "ready": False,
            "suggestedNext": None,
            "reasoning": "",
            "metrics": {
                "hmwCount": hmw_count,
                "ideaCount": idea_count,
                "refinedCount": refined_count,
                "categoryCount": len(categories),
                "highQualityCount": high_quality_count
            }
        }
        
        # Stage-specific checks
        if stage == "Clarify":
            if hmw_count >= 3:
                result["ready"] = True
                result["suggestedNext"] = "Ideate"
                result["reasoning"] = f"Clarify complete: {hmw_count} HMW questions"
            else:
                result["reasoning"] = f"Need {3 - hmw_count} more HMW questions"
        
        elif stage == "Ideate":
            fluency_met = idea_count >= 5
            flexibility_met = len(categories) >= 2
            
            if fluency_met and flexibility_met:
                result["ready"] = True
                result["suggestedNext"] = "Develop"
                result["reasoning"] = f"{idea_count} ideas across {len(categories)} categories"
            else:
                missing = []
                if not fluency_met:
                    missing.append(f"{5 - idea_count} more ideas")
                if not flexibility_met:
                    missing.append(f"{2 - len(categories)} more categories")
                result["reasoning"] = f"Need: {', '.join(missing)}"
        
        elif stage == "Develop":
            if refined_count >= 2 and high_quality_count >= 2:
                result["ready"] = True
                result["suggestedNext"] = "Implement"
                result["reasoning"] = f"{refined_count} refined, {high_quality_count} high-quality"
            else:
                missing = []
                if refined_count < 2:
                    missing.append(f"{2 - refined_count} more refined ideas")
                if high_quality_count < 2:
                    missing.append(f"{2 - high_quality_count} more high-quality")
                result["reasoning"] = f"Need: {', '.join(missing)}"
        
        elif stage == "Implement":
            result["ready"] = True
            result["reasoning"] = "Already at Implement"
        
        logger.info(f"[STAGE CHECK] {result}")
        return result
    
    # ----------- IDEA METRICS -----------
    def _compute_idea_metrics(self):
        if self._ideas_cache is None:
            self._refresh_ideas_cache()

        ideas = self._ideas_cache or {}
        fluency = len(ideas)
        categories = set()
        originality_scores = []
        elaboration_scores = []

        for idea in ideas.values():
            if idea.get("category"):
                categories.add(idea["category"])

            evals = idea.get("evaluations", {}) or {}
            if "originality" in evals:
                originality_scores.append(RATING_MAP.get(evals["originality"], 0))
            if "elaboration" in evals:
                elaboration_scores.append(RATING_MAP.get(evals["elaboration"], 0))

        flexibility = len(categories)

        def avg_to_label(scores):
            if not scores:
                return None
            avg = round(sum(scores) / len(scores))
            return REVERSE_MAP.get(avg)

        return {
            "Fluency": fluency,
            "Flexibility": flexibility,
            "Originality": avg_to_label(originality_scores),
            "Elaboration": avg_to_label(elaboration_scores)
        }

    def update_idea_metrics(self):
        metrics = self._compute_idea_metrics()
        updates = {"metrics": metrics}
        self.update_metadata(updates, mode="brainstorming")
        logger.debug(f"[IDEA METRICS] Updated: {metrics}")
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

    def evaluate_idea(self, idea_id: str, evaluations: dict):
        """
        Add/update evaluations for an existing idea.
        
        Args:
            idea_id: Session API idea ID
            evaluations: Dict with flexibilityCategory, elaboration, originality, reasoning
        """
        logger.debug(f"[IDEA EVAL] Evaluating idea {idea_id}: {evaluations}")
        
        # Fetch current idea
        ideas = self.get_all_ideas()
        if idea_id not in ideas:
            logger.error(f"Idea {idea_id} not found in session {self.session_id}")
            return {"error": "Idea not found"}
        
        # Merge evaluations
        idea = ideas[idea_id]
        existing_evals = idea.get("evaluations", {})
        updated_evals = {**existing_evals, **evaluations}
        idea["evaluations"] = updated_evals
        
        # Update via Session API (you may need to add /cps/update_idea endpoint)
        try:
            payload = {
                "uid": self.uid,
                "sessionID": self.session_id,
                "ideaID": idea_id,
                "updates": {"evaluations": updated_evals}
            }
            self._post("/cps/update_idea", payload)
            logger.info(f"[IDEA EVAL] Idea {idea_id} evaluations updated")
        except Exception as e:
            logger.exception(f"[IDEA EVAL] Failed to update idea: {e}")
            return {"error": str(e)}
        
        # Update category tracking
        category = evaluations.get("flexibilityCategory")
        if category:
            self._add_category(category)
        
        # Refresh cache and metrics
        self._refresh_ideas_cache()
        self.update_idea_metrics()
        
        return {"success": True, "ideaID": idea_id, "evaluations": updated_evals}
    
    def refine_idea(self, source_ids: list, new_idea: dict):
        logger.debug(f"[IDEA REFINE] Refining/combining ideas: {source_ids}")
        
        payload = {
            "uid": self.uid,
            "sessionID": self.session_id,
            "sourceIds": source_ids,
            "newIdea": {
                **new_idea,
                "refined": True,
                "createdAt": int(time.time() * 1000)
            }
        }
        
        res = self._post("/cps/refine_idea", payload)
        logger.debug(f"[IDEA REFINE] Session API response: {res}")
        
        # Update category if provided
        if new_idea.get("evaluations", {}).get("flexibilityCategory"):
            self._add_category(new_idea["evaluations"]["flexibilityCategory"])
        
        # Refresh cache and metrics
        self._refresh_ideas_cache()
        self.update_idea_metrics()
        
        return res

    def _add_category(self, category: str):
        """Add category to flexibilityCategories if not exists."""
        bs_meta = self.get_metadata().get("brainstorming", {})
        categories = bs_meta.get("flexibilityCategories", [])
        
        if category not in categories:
            categories.append(category)
            self.update_metadata({"flexibilityCategories": categories}, mode="brainstorming")
            logger.debug(f"[CATEGORY] Added category: {category} (total: {len(categories)})")


    # ----------- MESSAGES & SUMMARISATION -----------
    def check_stage_progress_with_auto_advance(self):
        """
        Enhanced progress check that automatically advances stage when ready.
        Safe to call after any idea/hmw addition.
        
        Returns: dict with progress info including 'autoAdvanced' flag
        """
        logger.debug("[AUTO-PROGRESS] Checking stage progress with auto-advance")
        
        # Get current progress
        progress = self.check_stage_progress()
        
        current_stage = progress.get("currentStage")
        ready = progress.get("ready", False)
        next_stage = progress.get("suggestedNext")
        
        # Auto-advance if conditions met
        if ready and next_stage and current_stage != next_stage:
            logger.info(f"[AUTO-ADVANCE] Conditions met: {current_stage} → {next_stage}")
            logger.info(f"[AUTO-ADVANCE] Reasoning: {progress.get('reasoning')}")
            
            try:
                self.switch_stage(
                    next_stage,
                    reasoning=f"Auto-advanced: {progress.get('reasoning')}"
                )
                
                progress["autoAdvanced"] = True
                progress["previousStage"] = current_stage
                progress["currentStage"] = next_stage
                
                logger.info(f"[AUTO-ADVANCE]  [PASS] Stage advanced successfully")
                
            except Exception as e:
                logger.error(f"[AUTO-ADVANCE] Failed to switch stage: {e}")
                progress["autoAdvanced"] = False
                progress["autoAdvanceError"] = str(e)
        else:
            progress["autoAdvanced"] = False
            
            if not ready:
                logger.debug(f"[AUTO-PROGRESS] Not ready: {progress.get('reasoning')}")
            elif not next_stage:
                logger.debug(f"[AUTO-PROGRESS] No next stage suggested")
            elif current_stage == next_stage:
                logger.debug(f"[AUTO-PROGRESS] Already at suggested stage: {current_stage}")
        
        return progress
    
    def get_session_snapshot(self):
        """
        Generate complete session snapshot with progress tracking.
        UPDATED: Now includes auto-advance detection
        """
        logger.debug("[SNAPSHOT] Generating session snapshot")
        
        bs_meta = self.get_metadata().get("brainstorming", {})
        ideas_raw = self.get_all_ideas()
        
        # Convert HMW questions
        hmw_raw = bs_meta.get("hmwQuestions", {}) or {}
        hmw_questions = [q.get("question", "") for q in hmw_raw.values()]
        
        # Convert ideas with evaluations
        ideas = []
        categories_seen = set()
        
        for idea_id, idea in ideas_raw.items():
            ideas.append({
                "id": idea_id,
                "text": idea.get("text", ""),
                "evaluations": idea.get("evaluations", {}),
                "refined": idea.get("refined", False)
            })
            
            cat = idea.get("evaluations", {}).get("flexibilityCategory")
            if cat:
                categories_seen.add(cat)
        
        # Calculate scores
        idea_count = len(ideas)
        hmw_count = len(hmw_questions)
        category_count = len(categories_seen)
        refined_count = sum(1 for i in ideas if i.get("refined"))
        
        # Calculate quality
        high_quality_count = 0
        for idea in ideas:
            evals = idea.get("evaluations", {})
            if evals.get("elaboration") in ["Medium", "High"] or \
            evals.get("originality") in ["Medium", "High"]:
                high_quality_count += 1
        
        fluency_score = "High" if idea_count >= 7 else ("Medium" if idea_count >= 5 else "Low")
        flexibility_score = "High" if category_count >= 3 else \
                            ("Medium" if category_count >= 2 else "Low")
        
        # Get current stage
        current_stage = bs_meta.get("stage", "Clarify")
        
        # Calculate readiness
        ready = False
        next_stage = None
        progress_message = ""
        
        if current_stage == "Clarify":
            ready = hmw_count >= 3
            next_stage = "Ideate" if ready else None
            progress_message = f"{hmw_count}/3 HMWs" + (" - Ready!" if ready else f" - Need {3-hmw_count} more")
        
        elif current_stage == "Ideate":
            ready = idea_count >= 5 and category_count >= 2
            next_stage = "Develop" if ready else None
            if ready:
                progress_message = f"{idea_count}/5 ideas, {category_count}/2 categories - Ready!"
            else:
                missing = []
                if idea_count < 5:
                    missing.append(f"{5-idea_count} more ideas")
                if category_count < 2:
                    missing.append(f"{2-category_count} more categories")
                progress_message = f"{idea_count}/5 ideas, {category_count}/2 categories - Need: {', '.join(missing)}"
        
        elif current_stage == "Develop":
            ready = refined_count >= 2 and high_quality_count >= 2
            next_stage = "Implement" if ready else None
            if ready:
                progress_message = f"{refined_count}/2 refined, {high_quality_count}/2 high-quality - Ready!"
            else:
                missing = []
                if refined_count < 2:
                    missing.append(f"{2-refined_count} more refined")
                if high_quality_count < 2:
                    missing.append(f"{2-high_quality_count} more high-quality")
                progress_message = f"{refined_count}/2 refined, {high_quality_count}/2 high-quality - Need: {', '.join(missing)}"
        
        elif current_stage == "Implement":
            ready = True
            progress_message = "Implementation stage"
        
        # NEW: Check if stage was recently auto-advanced
        stage_history = bs_meta.get("stageHistory", [])
        recently_advanced = False
        if stage_history:
            latest_transition = stage_history[-1]
            reasoning = latest_transition.get("reasoning", "")
            if "Auto-advanced" in reasoning or "auto" in reasoning.lower():
                time_since = int(time.time() * 1000) - latest_transition.get("timestamp", 0)
                if time_since < 10000:  # Within last 10 seconds
                    recently_advanced = True
        
        snapshot = {
            "sessionId": self.session_id,
            "stage": current_stage,
            "hmwQuestions": hmw_questions,
            "ideas": ideas,
            "fluency": {
                "count": idea_count,
                "score": fluency_score,
                "threshold": 5,
                "met": idea_count >= 5
            },
            "flexibility": {
                "categories": list(categories_seen),
                "score": flexibility_score,
                "threshold": 2,
                "met": category_count >= 2
            },
            "stageProgress": {
                "current": current_stage,
                "ready": ready,
                "nextStage": next_stage,
                "message": progress_message,
                "recentlyAdvanced": recently_advanced,  # NEW FLAG
                "metrics": {
                    "hmwCount": hmw_count,
                    "ideaCount": idea_count,
                    "categoryCount": category_count,
                    "refinedCount": refined_count,
                    "highQualityCount": high_quality_count
                }
            },
            "stageHistory": stage_history,
            "metadata": {
                "hmwCount": hmw_count,
                "ideaCount": idea_count,
                "refinedCount": refined_count,
                "categories": list(categories_seen)
            }
        }
        
        logger.debug(f"[SNAPSHOT] Generated: stage={current_stage}, progress={progress_message}, recentlyAdvanced={recently_advanced}")
        
        return snapshot
    
    def get_recent_messages(self, limit=10, maxed_out=False):
        """Return existing summaries (cached) + unsummarised messages."""
        cache_key = f"summaries:{self.uid}:{self.session_id}"
        
        try:
            # Get summaries from cache
            if cache_key in summaries_cache and not maxed_out:
                cache_stats["summaries_hits"] += 1
                cached_data = summaries_cache[cache_key]
                logger.debug(f"[CACHE HIT] Summaries for {cache_key}")
            else:
                cache_stats["summaries_misses"] += 1
                logger.debug(f"[CACHE MISS] Fetching summaries")
                
                # Fetch fresh summaries
                self._refresh_metadata_cache()
                md = self._metadata_cache or {}
                summaries = md.get("shared", {}).get("summaries", {}) or {}
                summaries_list = [v for _, v in sorted(summaries.items())]
                
                cached_data = {"summaries": summaries_list}
                summaries_cache[cache_key] = cached_data

            # Always fetch fresh unsummarised messages
            payload = {"uid": self.uid, "sessionID": self.session_id}
            res = self._post("/session/get_messages", payload)
            messages_snapshot = res.get("messages", {}) or {}

            if not messages_snapshot:
                return {"summaries": cached_data["summaries"], "unsummarised": []}

            msgs = sorted(messages_snapshot.items(), 
                         key=lambda kv: kv[1].get("timestamp", 0))
            unsummarised = []

            for msg_id, m in msgs:
                if m.get("summarised") is False or m.get("summarised") is None:
                    unsummarised.append({**m, "id": msg_id})

            if not maxed_out and len(unsummarised) > limit:
                unsummarised = unsummarised[-limit:]
            
            return {"summaries": cached_data["summaries"], "unsummarised": unsummarised}

        except Exception as e:
            logger.exception("[ERROR] get_recent_messages failed: %s", e)
            return {"summaries": [], "unsummarised": []}
        
    def summarise_and_store(self, deepseek_client, session_id, unsummarised_msgs):
        """Background summarization (existing implementation kept)"""
        logger.debug(f"[SUMMARISATION] Summarising {len(unsummarised_msgs)} messages")
        
        try:
            if not unsummarised_msgs:
                return {"summaries": self.get_recent_messages(limit=KEEP_LAST_N)["summaries"], 
                       "unsummarised": []}

            summary_prompt = "Summarise these messages:\n" + "\n".join(
                [f"{m.get('role','unknown')}: {m.get('content','')}" 
                 for m in unsummarised_msgs]
            )

            response = deepseek_client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": "You are a helpful summariser."},
                    {"role": "user", "content": summary_prompt},
                ],
            )

            summary_text = response.choices[0].message.content
            
            # Store summary
            md = self.get_metadata()
            shared = md.get("shared", {})
            existing_summaries = shared.get("summaries", {}) or {}
            ts_key = str(int(time.time() * 1000))
            existing_summaries[ts_key] = summary_text

            updates = {"summaries": existing_summaries}
            self.update_metadata(updates, mode="shared")
            
            # Mark messages as summarised
            msg_ids = [m["id"] for m in unsummarised_msgs]
            try:
                self._post("/session/mark_messages_summarised", {
                    "uid": self.uid, 
                    "sessionID": self.session_id, 
                    "messageIDs": msg_ids
                })
            except Exception:
                logger.exception("[SUMMARISATION] Failed to mark messages")

            self._refresh_metadata_cache()
            return {"summaries": list(existing_summaries.values())[-KEEP_LAST_N:], 
                   "unsummarised": []}

        except Exception as e:
            logger.exception(f"[SUMMARISATION ERROR] {e}")
            return {"summaries": [], "unsummarised": unsummarised_msgs}
