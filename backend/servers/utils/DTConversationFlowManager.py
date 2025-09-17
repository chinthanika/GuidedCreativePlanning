import time
import random
import json
from firebase_admin import db
import os

import logging
logger = logging.getLogger(__name__)

# Load your question bank JSON once
BASE_DIR = os.path.dirname(__file__)
with open(os.path.join(BASE_DIR, "question_banks", "question_bank.json"), "r", encoding="utf-8") as f:
    question_bank = json.load(f)

primary = question_bank.get("primary", {})
follow_up = question_bank.get("follow_up", {})
meta_transitions = question_bank.get("meta_transitions", {})


class DTConversationFlowManager:
    FOLLOW_UP_LIMIT = 2
    RECENT_LIMIT = 5

    def __init__(self, uid: str, session_id: str):
        if not uid or not session_id:
            raise ValueError("uid and session_id are required")

        self.uid = uid
        self.session_id = session_id
        self.session_ref = db.reference(f"chatSessions/{uid}/{session_id}")
        self.metadata_ref = self.session_ref.child("metadata")
        self.messages_ref = self.session_ref.child("messages")

    # ----------- SESSION MGMT -----------

    @staticmethod
    def create_session(uid: str):
        session_ref = db.reference(f"chatSessions/{uid}")
        new_session_ref = session_ref.push()
        session_id = new_session_ref.key

        initial_metadata = {
            "createdAt": int(time.time() * 1000),
            "updatedAt": int(time.time() * 1000),
            "title": "New Chat",
            "currentCategory": None,
            "currentAngle": None,
            "asked": [],
            "depth": 0,
            "followUpCount": 0,
        }

        new_session_ref.set({
            "metadata": initial_metadata,
            "messages": {}
        })

        return DTConversationFlowManager(uid, session_id)

    def get_metadata(self):
        snapshot = self.metadata_ref.get()
        return snapshot if snapshot else None

    def update_metadata(self, updates: dict):
        updates["updatedAt"] = int(time.time() * 1000)
        self.metadata_ref.update(updates)

    def save_message(self, role: str, content: str, action=None, category=None, angle=None,
                 follow_up_category=None, summarised=False, visible=True):
        """Save message with metadata fields for traceability.

        visible: if False, this message should be hidden from the UI but still available
                to the LLM and internal tooling (stored in Firebase).
        """
        new_message_ref = self.messages_ref.push()
        new_message_ref.set({
            "role": role,
            "content": content,
            "action": action,
            "category": category,
            "angle": angle,
            "follow_up_category": follow_up_category,
            "timestamp": int(time.time() * 1000),
            "summarised": summarised,
            "visible": visible
        })

    # ----------- MAIN QUESTION FLOW -----------

    def handle_llm_next_question(self, llm_response: dict):
        action = llm_response.get("action")
        data = llm_response.get("data", {})
        metadata = self.get_metadata()
        current_category = metadata.get("currentCategory") if metadata else None
        current_angle = metadata.get("currentAngle") if metadata else None

        if action == "get_primary_question":
            category = data.get("category")
            angle = data.get("angle")
            if not category or not angle:
                raise ValueError("get_primary_question missing category or angle")

            return self._select_primary_question(category, angle)

        elif action == "get_follow_up":
            category = data.get("category") or current_category
            if not category:
                raise ValueError("Follow-up requires an active category")
            return self._select_follow_up(category)

        elif action == "meta_transition":
            transition_type = data.get("type")
            new_category = data.get("new_category")
            new_angle = data.get("new_angle")

            if not transition_type:
                raise ValueError("meta_transition requires type")

            if new_category:
                self.update_metadata({"currentCategory": new_category})
            if new_angle:
                self.update_metadata({"currentAngle": new_angle})

            if transition_type in ["angle_to_angle", "category_to_category"]:
                category = new_category or current_category
                angle = new_angle or current_angle\
                
                if not angle or angle == "no_assigned_angle":
                    # fallback: pick a random angle available for this category
                    candidates = [q["angle"] for q in primary.values() if q.get("category") == category]
                    if not candidates:
                        raise RuntimeError(f"No angles available for category {category}")
                    angle = random.choice(candidates)

                return self._select_primary_question(category, angle)

            pool = [
                mt for mt in meta_transitions.values()
                if mt.get("transition_type") == transition_type
            ]
            return {
                "type": "meta_transition",
                "transition_type": transition_type,
                "pool": pool,
                "currentCategory": self.get_metadata().get("currentCategory"),
                "currentAngle": self.get_metadata().get("currentAngle")
            }

        raise ValueError(f"Unknown action: {action}")

    def next_question(self, action: str, category: str = None, angle: str = None):
        metadata = self.get_metadata()
        if not metadata:
            raise RuntimeError("No metadata found for session")

        asked = metadata.get("asked", [])
        next_q = None

        if action == "new_category":
            if not category or not angle:
                raise ValueError("category and angle required for new_category")
            next_q = self._select_primary_question(category, angle)

        elif action == "new_angle":
            if not angle:
                raise ValueError("angle required for new_angle")
            category = metadata.get("currentCategory")
            if not category:
                raise RuntimeError("no category in context")
            next_q = self._select_primary_question(category, angle)

        elif action == "follow_up":
            category = category or metadata.get("currentCategory")
            if not category:
                raise RuntimeError("no category in context")
            if metadata.get("followUpCount", 0) >= self.FOLLOW_UP_LIMIT:
                raise RuntimeError("Too many follow-ups, shift category/angle")
            return self._select_follow_up(category)

        elif action == "meta_transition":
            transition_type = angle or None
            if not transition_type:
                raise ValueError("transition_type required for meta_transition")
            pool = self._pool_meta_transition(transition_type)
            return {
                "pool": pool,
                "type": "meta_transition",
                "transition_type": transition_type,
                "currentCategory": self.get_metadata().get("currentCategory"),
                "currentAngle": self.get_metadata().get("currentAngle")
            }

        # log if primary question chosen
        if next_q:
            if any(q["id"] == next_q["id"] for q in asked[-self.RECENT_LIMIT:]):
                raise RuntimeError(f"Question {next_q['id']} already asked recently")

            asked.append({
                "id": next_q["id"],
                "action": action,
                "category": next_q.get("category"),
                "angle": next_q.get("angle"),
                "prompt": next_q.get("prompt")
            })
            self.update_metadata({
                "asked": asked,
                "depth": metadata.get("depth", 0) + 1,
                "followUpCount": 0
            })

        return next_q

    # ----------- HELPERS -----------

    def _select_primary_question(self, category, angle):
        metadata = self.get_metadata()
        asked = metadata.get("asked", [])

        # Block only if the last primary was the same category+angle
        if asked:
            last = asked[-1]
            if (
                last.get("action") in ["new_category", "new_angle"]
                and last.get("category") == category
                and last.get("angle") == angle
            ):
                raise RuntimeError(
                    f"Cannot ask the same primary twice in a row for {category}:{angle}"
                )

        # candidates can now reuse old questions, but not the same as last one
        candidates = [
            q for q in primary.values()
            if q.get("category") == category and q.get("angle") == angle
        ]

        if not candidates:
            raise RuntimeError(f"No primary questions defined for {category}:{angle}")

        question = random.choice(candidates)
        self.update_metadata({
            "currentCategory": category,
            "currentAngle": angle,
            "followUpCount": 0
        })
        return {
            "type": "primary",
            "question_id": question["id"],
            "category": category,
            "angle": angle,
            "prompt": question["prompt"]
        }


    def _select_follow_up(self, category):
        metadata = self.get_metadata()
        asked = metadata.get("asked", [])
        asked_ids = {q["id"] for q in asked}

        # Guardrail: if already at limit, auto-force meta transition
        if metadata.get("followUpCount", 0) >= self.FOLLOW_UP_LIMIT:
            return {
                "type": "meta_transition",
                "transition_type": "angle_to_angle",
                "reason": "Follow-up limit reached, forcing transition",
                "currentCategory": metadata.get("currentCategory"),
                "currentAngle": metadata.get("currentAngle")
            }

        pool = [
            q for q in follow_up.values()
            if q.get("category") == category and q["id"] not in asked_ids
        ]
        pool = self._filter_recent(pool, asked)
        if not pool:
            return {
                "type": "meta_transition",
                "transition_type": "angle_to_angle",
                "reason": "No unused follow-ups available, forcing transition",
                "currentCategory": metadata.get("currentCategory"),
                "currentAngle": metadata.get("currentAngle")
            }

        self.update_metadata({"followUpCount": metadata.get("followUpCount", 0) + 1})
        return {
            "type": "follow_up",
            "category": category,
            "pool": pool
        }


    def _pool_meta_transition(self, transition_type=None):
        metadata = self.get_metadata()
        asked = metadata.get("asked", [])
        pool = [
            mt for mt in meta_transitions.values()
            if (not transition_type or mt.get("transition_type") == transition_type)
        ]
        return self._filter_recent(pool, asked)

    def _filter_recent(self, pool, asked, limit=None):
        """Filter out any questions asked in the last `limit` turns."""
        limit = limit or self.RECENT_LIMIT
        recent_ids = [q["id"] for q in asked[-limit:]]
        return [q for q in pool if q["id"] not in recent_ids]
    
    def get_recent_messages(self, limit=10, maxed_out=False):
        """
            Return existing summaries + unsummarised messages.
            If maxed_out=True, return ALL unsummarised messages.


            Important changes:
            - Treat messages with missing 'summarised' field as unsummarised (i.e., summarised == False)
            - Preserve all roles (user, assistant, system)
            - Return the last `limit` unsummarised messages when maxed_out is False
            """
        try:
            # --- Fetch summaries ---
            summaries_snapshot = self.metadata_ref.child("summaries").get()
            summaries = []
            if summaries_snapshot:
                # Firebase .get() returns dict of {push_id: summary_str}
                summaries = [v for _, v in sorted(summaries_snapshot.items())]
                
            # --- Fetch messages ---
            snapshot = self.messages_ref.get()
            if not snapshot:
                return {"summaries": summaries, "unsummarised": []}


            msgs = sorted(snapshot.items(), key=lambda kv: kv[1].get("timestamp", 0))
            unsummarised = []


            for msg_id, m in msgs:
                # treat explicit False or missing field as unsummarised
                if m.get("summarised") is False or m.get("summarised") is None:
                    # include id to allow marking later
                    unsummarised.append({**m, "id": msg_id})


            if not maxed_out and len(unsummarised) > limit:
                unsummarised = unsummarised[-limit:]


            return {
                "summaries": summaries,
                "unsummarised": unsummarised
            }


        except Exception as e:
            logger.exception("[ERROR] get_recent_messages failed:")
            return {"summaries": [], "unsummarised": []}


    def summarise_and_store(self, deepseek_client, session_id, unsummarised_msgs):
        try:
            if not unsummarised_msgs:
                return {"summaries": self.get_recent_messages(limit=KEEP_LAST_N)["summaries"], "unsummarised": []}


            # build the summarisation prompt conservatively
            summary_prompt = "Summarise these messages:\n" + "\n".join(
                [f"{m.get('role','unknown')}: {m.get('content','')}" for m in unsummarised_msgs]
            )


            response = deepseek_client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": "You are a helpful summariser."},
                    {"role": "user", "content": summary_prompt},
                ],
            )


            summary_text = response.choices[0].message["content"]


            # store summary
            self.metadata_ref.child("summaries").push(summary_text)


            # mark messages as summarised (only those passed in)
            for m in unsummarised_msgs:
                try:
                    self.messages_ref.child(m["id"]).update({"summarised": True})
                except Exception:
                    logger.exception("Failed to mark message summarised")


            # return the latest summaries (we'll return last 5 to keep context sized)
            all_summaries_snapshot = self.metadata_ref.child("summaries").get() or {}
            all_summaries = [v for _, v in sorted(all_summaries_snapshot.items())]
            return {
                "summaries": all_summaries[-5:],
                "unsummarised": []
            }


        except Exception as e:
            logger.exception(f"Summarisation error: {e}")
            return {"summaries": [], "unsummarised": unsummarised_msgs}