import time
from firebase_admin import db

class Session:
    def __init__(self, uid: str, session_id: str):
        if not uid or not session_id:
            raise ValueError("uid and session_id are required")

        self.uid = uid
        self.session_id = session_id
        self.session_ref = db.reference(f"chatSessions/{uid}/{session_id}")
        self.active_ref = db.reference(f"chatSessions/activeSessions/{uid}")
        self.metadata_ref = self.session_ref.child("metadata")
        self.messages_ref = self.session_ref.child("messages")

    # ---------------- SESSION MGMT ----------------
    @staticmethod
    def create(uid: str, metadata_shared: dict = None, metadata_dt: dict = None, metadata_bs: dict = None):
        """
        Create a new session with shared + mode-specific metadata and register it as active.
        """
        session_ref = db.reference(f"chatSessions/{uid}")
        active_ref = db.reference(f"chatSessions/activeSessions/{uid}")
        new_session_ref = session_ref.push()
        session_id = new_session_ref.key

        now = int(time.time() * 1000)
        metadata = {
            "shared": metadata_shared or {},
            "deepthinking": metadata_dt or {},
            "brainstorming": metadata_bs or {}
        }
        metadata["shared"].update({"createdAt": now, "updatedAt": now})

        base_data = {
            "currentMode": "deepthinking",  # default
            "metadata": metadata,
            "messages": {},
            "ideas": {}
        }

        # Save session
        new_session_ref.set(base_data)

        # Add to active sessions
        active_ref.child(session_id).set({"startedAt": now})
        
        return Session(uid, session_id)
    
    @classmethod
    def get_all_active_sessions(cls):
        """
        Returns a list of Session instances for all active sessions across all users.
        """
        root_ref = db.reference("chatSessions/activeSessions")
        all_active = root_ref.get() or {}

        active_sessions = []
        for uid, sessions in all_active.items():
            for session_id in sessions.keys():
                active_sessions.append(cls(uid, session_id))

        return active_sessions

    def end(self, uid: str, session_id: str):
        """
        End this session: mark as ended in metadata and remove from activeSessions.
        """
        now = int(time.time() * 1000)
        self.update_metadata({"ended": True, "endedAt": now}, mode="shared")
        self.active_ref.child(self.session_id).delete()


    def get_metadata(self, mode: str = None):
        """
        Get metadata. If mode is None, return full dict.
        """
        metadata = self.metadata_ref.get() or {}
        if mode:
            return metadata.get(mode, {})
        return metadata

    def update_metadata(self, updates: dict, mode: str = "shared"):
        """
        Update metadata for shared/deepthinking/brainstorming.
        """
        updates["updatedAt"] = int(time.time() * 1000)
        self.metadata_ref.child(mode).update(updates)

    def switch_mode(self, mode: str):
        """
        Switch between deepthinking <-> brainstorming.
        """
        if mode not in ["deepthinking", "brainstorming"]:
            raise ValueError("Invalid mode")
        self.session_ref.update({"currentMode": mode})
        self.update_metadata({}, mode="shared")  # refresh updatedAt

    def save_message(self, role: str, mode: str, content: str, **kwargs):
        """
        Save a message with arbitrary metadata (stage, action, etc.)
        """
        new_msg_ref = self.messages_ref.push()
        data = {
            "role": role,
            "mode": mode,
            "content": content,
            "timestamp": int(time.time() * 1000),
        }
        data.update(kwargs)
        new_msg_ref.set(data)
        return new_msg_ref.key

    def summarise(self, client, min_messages=10):
        """
        Summarise unsummarised messages in this session.
        Returns the summary text or None if not enough new messages.
        """
        messages = self.messages_ref.get() or {}
        unsummarised = [m for m in messages.values() if not m.get("summarised")]

        if len(unsummarised) < min_messages:
            print(f"Session {self.session_id} has less than {min_messages} unsummarised messages. Skipping.")
            return None

        content_texts = [f"{m['role']}: {m['content']}" for m in unsummarised if "content" in m]
        joined_text = "\n".join(content_texts)

        prompt = (
            "Summarise the following chat history for record-keeping and extract any relevant "
            "constructs, insights, or structured data that could be useful for the system:\n\n"
            f"{joined_text}"
        )

        try:
            resp = client.chat.completions.create(
                model="deepseek-chat",
                messages=[{"role": "user", "content": prompt}],
                stream=False
            )
            summary = resp.choices[0].message.content.strip()
        except Exception as e:
            print(f"DeepSeek summarisation failed for session={self.session_id}: {e}")
            raise

        # Save summary into metadata
        self.update_metadata({"lastSummary": summary}, mode="shared")

        # Mark messages as summarised
        for msg_id, msg in messages.items():
            if not msg.get("summarised"):
                self.messages_ref.child(msg_id).update({"summarised": True})

        print(f"Session summarised: {self.session_id}, summary length={len(summary)}")
        return summary