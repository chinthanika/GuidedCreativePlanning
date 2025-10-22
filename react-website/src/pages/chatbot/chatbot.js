import React from "react";
import ChatWindow from "../../components/chatbot/ChatWindow";
import PendingChanges from "../../components/chatbot/PendingChanges";
import { useAuthValue } from '../../Firebase/AuthContext';
import "./chatbot.css"; // new CSS for layout

export default function Chatbot() {
  const { currentUser } = useAuthValue();
  const uid = currentUser?.uid;

  return (
    <div className="chatbot-page-container">
      <div className="chat-window-container">
        <ChatWindow />
      </div>
      <div className="pending-changes-container">
        <PendingChanges userId={uid} />
      </div>
    </div>
  );
}
