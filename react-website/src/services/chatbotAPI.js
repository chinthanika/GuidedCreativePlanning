import { database } from '../Firebase/firebase';
import { ref, push, serverTimestamp } from "firebase/database";

// Save a user message to Firebase AND trigger AI response
export const sendMessage = async (uid, sessionID, text) => {
  if (!uid) throw new Error("User not authenticated");

  const messagesRef = ref(database, `chatSessions/${uid}/${sessionID}/messages`);

  // 1. Save user message
  const newMessage = {
    sender: "user",
    text,
    timestamp: serverTimestamp(),
  };

  await push(messagesRef, newMessage);

  // 2. Call AI API to get bot response
  const botReply = await getAIResponse(text);

  // 3. Save bot response to Firebase
  await sendBotResponse(uid, sessionID, botReply);
};

async function getAIResponse(userMessage) {
  try {
    const response = await fetch("http://localhost:5001/chat", { // or your deployed API endpoint
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMessage }),
    });

    const data = await response.json();
    return data.reply; // adjust based on your backend structure
  } catch (error) {
    console.error("AI API error:", error);
    return "Sorry, something went wrong.";
  }
}

// Save a bot response to Firebase
export const sendBotResponse = async (uid, sessionID, text) => {
  if (!uid) throw new Error("User not authenticated");

  const messagesRef = ref(database, `chatSessions/${uid}/${sessionID}/messages`);

  const newMessage = {
    sender: "bot",
    text,
    timestamp: serverTimestamp(),
  };

  await push(messagesRef, newMessage);
};
