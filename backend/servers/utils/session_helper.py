"""
Session management helper for book recommendation testing.
Handles session creation, message seeding, and validation.
"""

import requests
import time
import logging
from typing import Optional, Dict, List

logger = logging.getLogger(__name__)


class SessionHelper:
    """Helper class for managing test sessions."""
    
    def __init__(self, session_api_url: str = "https://guidedcreativeplanning-session.onrender.com"):
        self.session_api_url = session_api_url
    
    def create_session(self, user_id: str, mode: str = "brainstorming") -> str:
        """
        Create a new session for the user.
        
        Args:
            user_id: Firebase user ID
            mode: "brainstorming" or "deepthinking"
            
        Returns:
            session_id: The created session ID
        """
        logger.info(f"[SESSION] Creating {mode} session for user {user_id}")
        
        # Prepare metadata based on mode
        shared_meta = {"title": "Test Chat - Book Recommendations"}
        
        if mode == "brainstorming":
            bs_meta = {
                "stage": "Clarify",
                "parentSessionId": None,
                "hmwQuestions": {},
                "stageHistory": [],
                "fluencyScore": "Low",
                "flexibilityCategories": []
            }
            dt_meta = {}
        else:  # deepthinking
            dt_meta = {
                "currentCategory": None,
                "currentAngle": None,
                "asked": [],
                "depth": 0,
                "followUpCount": 0
            }
            bs_meta = {}
        
        payload = {
            "uid": user_id,
            "metadata_shared": shared_meta,
            "metadata_dt": dt_meta,
            "metadata_bs": bs_meta
        }
        
        try:
            response = requests.post(
                f"{self.session_api_url}/session/create",
                json=payload,
                timeout=10
            )
            response.raise_for_status()
            
            session_id = response.json().get("sessionID")
            logger.info(f"[SESSION] Created session: {session_id}")
            return session_id
            
        except Exception as e:
            logger.error(f"[SESSION] Creation failed: {e}")
            raise
    
    def add_message(self, user_id: str, session_id: str, role: str, 
                   content: str, mode: str = "brainstorming") -> bool:
        """
        Add a message to the session.
        
        Args:
            user_id: Firebase user ID
            session_id: Session ID
            role: "user" or "assistant"
            content: Message content
            mode: "brainstorming" or "deepthinking"
            
        Returns:
            bool: Success status
        """
        payload = {
            "uid": user_id,
            "sessionID": session_id,
            "role": role,
            "content": content,
            "mode": mode,
            "extra": {
                "visible": True,
                "summarised": False,
                "stage": "Clarify" if mode == "brainstorming" else None
            }
        }
        
        try:
            response = requests.post(
                f"{self.session_api_url}/session/save_message",
                json=payload,
                timeout=10
            )
            response.raise_for_status()
            logger.debug(f"[SESSION] Message saved: {role} - {content[:50]}...")
            return True
            
        except Exception as e:
            logger.error(f"[SESSION] Message save failed: {e}")
            return False
    
    def seed_conversation(self, user_id: str, session_id: str, 
                         conversation: List[Dict[str, str]], 
                         mode: str = "brainstorming") -> int:
        """
        Seed a session with multiple messages.
        
        Args:
            user_id: Firebase user ID
            session_id: Session ID
            conversation: List of {"role": "user/assistant", "content": "..."}
            mode: "brainstorming" or "deepthinking"
            
        Returns:
            int: Number of messages successfully added
        """
        logger.info(f"[SESSION] Seeding {len(conversation)} messages")
        
        success_count = 0
        for msg in conversation:
            if self.add_message(
                user_id, 
                session_id, 
                msg["role"], 
                msg["content"], 
                mode
            ):
                success_count += 1
                time.sleep(0.1)  # Small delay to ensure ordering
        
        logger.info(f"[SESSION] Successfully seeded {success_count}/{len(conversation)} messages")
        return success_count
    
    def get_session_info(self, user_id: str, session_id: str) -> Optional[Dict]:
        """
        Get session metadata and message count.
        
        Args:
            user_id: Firebase user ID
            session_id: Session ID
            
        Returns:
            Dict with session info or None if error
        """
        try:
            # Get metadata
            meta_response = requests.post(
                f"{self.session_api_url}/session/get_metadata",
                json={"uid": user_id, "sessionID": session_id},
                timeout=10
            )
            meta_response.raise_for_status()
            
            # Get messages
            msg_response = requests.post(
                f"{self.session_api_url}/session/get_messages",
                json={"uid": user_id, "sessionID": session_id},
                timeout=10
            )
            msg_response.raise_for_status()
            
            messages = msg_response.json().get("messages", {})
            user_messages = [m for m in messages.values() if m.get("role") == "user"]
            
            return {
                "metadata": meta_response.json().get("metadata", {}),
                "total_messages": len(messages),
                "user_messages": len(user_messages)
            }
            
        except Exception as e:
            logger.error(f"[SESSION] Failed to get session info: {e}")
            return None


# Pre-defined test conversations for seeding
TEST_CONVERSATIONS = {
    "fantasy_adventure": [
        {
            "role": "user",
            "content": "I want to write a story about a young wizard who discovers they have forbidden magic"
        },
        {
            "role": "assistant",
            "content": "That's an intriguing premise! Tell me more about this forbidden magic - what makes it forbidden?"
        },
        {
            "role": "user",
            "content": "It's shadow magic that was banned centuries ago because it's too powerful. But my character needs it to save their village from an ancient evil"
        },
        {
            "role": "assistant",
            "content": "I love the moral dilemma here. How does your character feel about using this forbidden power?"
        },
        {
            "role": "user",
            "content": "They're conflicted because everyone tells them it's evil, but they can feel that the magic itself isn't inherently bad"
        }
    ],
    
    "dystopian_thriller": [
        {
            "role": "user",
            "content": "I'm thinking of a dystopian world where emotions are controlled by the government"
        },
        {
            "role": "assistant",
            "content": "Fascinating concept! How does the government control emotions?"
        },
        {
            "role": "user",
            "content": "Through daily injections that suppress strong feelings. My protagonist stops taking them and starts feeling everything intensely"
        },
        {
            "role": "assistant",
            "content": "That's a powerful awakening. What happens when they experience real emotions for the first time?"
        },
        {
            "role": "user",
            "content": "At first it's overwhelming - they cry, laugh, get angry. Then they realize everyone around them is living like zombies and they want to help others wake up too"
        }
    ],
    
    "mystery_thriller": [
        {
            "role": "user",
            "content": "I want to write a mystery where nothing is as it seems"
        },
        {
            "role": "assistant",
            "content": "Mysteries with unreliable narrators can be very compelling! Who's telling the story?"
        },
        {
            "role": "user",
            "content": "A detective investigating a murder, but I want to reveal later that they might actually be the killer"
        },
        {
            "role": "assistant",
            "content": "That's a bold twist! How will you plant clues without giving it away too early?"
        },
        {
            "role": "user",
            "content": "I'm thinking of having them 'forget' key moments, or explain away their own suspicious behavior as part of the investigation"
        }
    ],
    
    "coming_of_age": [
        {
            "role": "user",
            "content": "I want to write about a teenager struggling with identity"
        },
        {
            "role": "assistant",
            "content": "Coming-of-age stories are so relatable. What specific aspect of identity are they exploring?"
        },
        {
            "role": "user",
            "content": "They're figuring out who they are outside of their family's expectations. Their parents want them to be a doctor but they want to be an artist"
        },
        {
            "role": "assistant",
            "content": "That tension between family duty and personal dreams is powerful. How does this conflict affect their relationships?"
        },
        {
            "role": "user",
            "content": "They feel like they're betraying their family, but staying silent is killing their spirit. They start creating art secretly"
        }
    ],
    
    "sci_fi_exploration": [
        {
            "role": "user",
            "content": "I'm working on a sci-fi story about first contact with aliens"
        },
        {
            "role": "assistant",
            "content": "First contact stories offer endless possibilities! What's unique about your aliens?"
        },
        {
            "role": "user",
            "content": "They communicate through color changes in their skin, not words. Humans have to learn an entirely new way of thinking to understand them"
        },
        {
            "role": "assistant",
            "content": "That's a fascinating communication barrier! How does that affect the relationship between species?"
        },
        {
            "role": "user",
            "content": "There are lots of misunderstandings at first. What humans see as aggression might be the aliens showing excitement, and vice versa"
        }
    ]
}