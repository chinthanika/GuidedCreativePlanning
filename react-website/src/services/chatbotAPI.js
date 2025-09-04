import { database } from '../Firebase/firebase';
import { ref, push, serverTimestamp } from "firebase/database";

// 🔹 Save a user message and trigger AI response
export const sendMessage = async (uid, sessionID, text) => {
  if (!uid) throw new Error("User not authenticated");

  const messagesRef = ref(database, `chatSessions/${uid}/${sessionID}/messages`);

  // Save user message
  await push(messagesRef, {
    sender: "user",
    text,
    timestamp: serverTimestamp(),
  });

  // Get AI response
  const botData = await getAIResponse(uid, text);

  // Save bot main message
  if (botData.chat_message) {
    await sendBotResponse(uid, sessionID, botData.chat_message);
  }

  // Save additional requests (get_info / query) as separate bot messages
  if (botData.requests && botData.requests.length > 0) {
    for (const req of botData.requests) {
      if (req.message) {
        await sendBotResponse(uid, sessionID, req.message);
      }
    }
  }

  // Optional: log staging results for debugging
  if (botData.staging_results && botData.staging_results.length > 0) {
    console.log("Staging results:", botData.staging_results);
  }
};

// Call backend AI API
async function getAIResponse(uid, userMessage) {
  try {
    const response = await fetch("http://10.163.1.202:5000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMessage, user_id: uid }),
    });

    const data = await response.json();

    // data structure: { chat_message, requests, staging_results }
    return data;
  } catch (error) {
    console.error("AI API error:", error);
    return { chat_message: "Sorry, something went wrong.", requests: [], staging_results: [] };
  }
}

// Save a bot message to Firebase
export const sendBotResponse = async (uid, sessionID, text) => {
  if (!uid) throw new Error("User not authenticated");

  const messagesRef = ref(database, `chatSessions/${uid}/${sessionID}/messages`);
  await push(messagesRef, {
    sender: "bot",
    text,
    timestamp: serverTimestamp(),
  });
};
