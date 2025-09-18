import { database } from '../Firebase/firebase';
import { ref, push, serverTimestamp } from "firebase/database";

let sessionID = null;

//  Save a user message and trigger AI response
export const sendMessage = async (uid, currentSessionID, text) => {
  if (!uid) throw new Error("User not authenticated");

  // Always use the most up-to-date sessionID
  const activeSessionID = currentSessionID || sessionID;
  const messagesRef = ref(database, `chatSessions/${uid}/${activeSessionID}/messages`);

  // Get AI response
  const botData = await getAIResponse(uid, text, activeSessionID);
  console.log("AI response data:", botData);

};

// Call backend AI API
async function getAIResponse(uid, userMessage, currentSessionID) {
  try {
    const response = await fetch("http://10.163.5.92:5001/chat", {
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
