import { database } from '../Firebase/firebase';
import { ref, push, serverTimestamp } from "firebase/database";
import { useEffect } from 'react';

let sessionID = null;

// Cleanup session on window unload
function useSessionCleanup(uid, sessionID) {
  useEffect(() => {
    const handleUnload = () => {
      if (uid && sessionID) {
        navigator.sendBeacon(
          "http://localhost:4000/session/end",
          JSON.stringify({ uid, sessionID })
        );
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [uid, sessionID]);
}

//  Save a user message and trigger AI response
export const sendMessage = async (uid, currentSessionID, text, mode = "brainstorming") => {
  if (!uid) throw new Error("User not authenticated");

  // Always use the most up-to-date sessionID
  const activeSessionID = currentSessionID || sessionID;
  const messagesRef = ref(database, `chatSessions/${uid}/${activeSessionID}/messages`);

  // Get AI response
  const botData = await getAIResponse(uid, text, activeSessionID, mode);
  console.log("AI response data:", botData);

};

// Call backend AI API
async function getAIResponse(uid, userMessage, currentSessionID, mode = "brainstorming") {
  try {
    const url = mode === "brainstorming"
      ? "http://10.163.12.87:5002/chat" // brainstorming backend
      : "http://10.163.12.87:5003/chat"; // deepthinking backend

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMessage,
        user_id: uid,
        session_id: currentSessionID || null
      }),
    });

    const data = await response.json();

    // Save session ID globally for future calls
    if (data.session_id) {
      sessionID = data.session_id;
    }

    console.log("Active sessionID:", sessionID);
    return {
      chat_message: data.chat_message || null,
      requests: data.requests || [],
      staging_results: data.staging_results || [],
      profile_data: data.profile_data || null,
      session_id: data.session_id,  // 🔹 always return for frontend
    };
  } catch (error) {
    console.error("AI API error:", error);
    return { chat_message: "Sorry, something went wrong.", requests: [], staging_results: [] };
  }
}


// Save a bot message to Firebase
export const sendBotResponse = async (uid, sessionID, text) => {
  if (!uid) throw new Error("User not authenticated");
};
