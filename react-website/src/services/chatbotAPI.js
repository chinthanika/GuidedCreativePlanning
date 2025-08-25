import { useAuthValue } from '../Firebase/AuthContext';
import { database } from '../Firebase/firebase';
import { ref, push, serverTimestamp } from "firebase/database";

// Save a user message to Firebase
export const sendMessage = async (uid, text) => {
  if (!uid) throw new Error("User not authenticated");

  const messagesRef = ref(database, `chatSessions/${uid}/${sessionID}/messages`);

  const newMessage = {
    sender: "user",
    text,
    timestamp: serverTimestamp(),
  };

  await push(messageRef, newMessage);
};

// Save a bot response to Firebase
export const sendBotResponse = async (uid, text) => {
  if (!uid) throw new Error("User not authenticated");

  const messageRef = ref(database, `chatSessions/${uid}/messages`);

  const newMessage = {
    sender: "bot",
    text,
    timestamp: serverTimestamp(),
  };

  await push(messageRef, newMessage);
};
