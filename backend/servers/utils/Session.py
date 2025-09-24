import time
from firebase_admin import db

class Session:
    def __init__(self, uid: str, session_id: str):
        if not uid or not session_id:
            raise ValueError("uid and session_id are required")

        self.uid = uid
        self.session_id = session_id
        self.session_ref = db.reference(f"chatSessions/{uid}/{session_id}")
        self.metadata_ref = self.session_ref.child("metadata")
        self.messages_ref = self.session_ref.child("messages")

    # ---------------- SESSION MGMT ----------------
    @staticmethod
    def create(uid: str, metadata_shared: dict = None, metadata_dt: dict = None, metadata_bs: dict = None):
        """
        Create a new session with shared + mode-specific metadata.
        """
        session_ref = db.reference(f"chatSessions/{uid}")
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
            "ideas": {}  # kept even if DT mode
        }

        new_session_ref.set(base_data)
        return Session(uid, session_id)

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
