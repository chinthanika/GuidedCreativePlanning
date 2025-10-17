import { database } from '../Firebase/firebase';
import { ref, push } from "firebase/database";

let sessionID = null;

// Send message and get instant response
export const sendMessage = async (uid, currentSessionID, text, mode = "brainstorming") => {
  if (!uid) throw new Error("User not authenticated");

  const activeSessionID = currentSessionID || sessionID;

  // Call backend
  const botData = await getAIResponse(uid, text, activeSessionID, mode);

  // Save session ID for future calls
  if (botData.session_id) {
    sessionID = botData.session_id;
  }

  return botData;
};

// Call backend AI API
async function getAIResponse(uid, userMessage, currentSessionID, mode = "brainstorming") {
  try {
    const url = mode === "brainstorming"
      ? "http://10.163.5.63:5002/chat"
      : "http://10.163.10.109:5003/chat";

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMessage,
        user_id: uid,
        session_id: currentSessionID || null
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    return {
      chat_message: data.chat_message || null,
      background_processing: data.background_processing || false,
      session_id: data.session_id,
      mode: data.mode
    };
  } catch (error) {
    console.error("AI API error:", error);
    return { 
      chat_message: "Sorry, something went wrong.", 
      background_processing: false 
    };
  }
}