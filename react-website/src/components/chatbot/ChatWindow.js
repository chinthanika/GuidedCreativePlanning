import React, { useState, useEffect } from "react";
import { database } from '../../Firebase/firebase';
import { ref, onValue } from "firebase/database";
import { sendMessage, sendBotResponse } from '../../services/chatbotAPI';
import "./chatbot.css";

const ChatWindow = ({ uid, sessionID }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");

    useEffect(() => {
        if (!uid || !sessionID) {
            console.log("No UID or sessionID provided to ChatWindow.");
            return;
        }

        const messagesRef = ref(database, `chatSessions/${uid}/${sessionID}/messages`);
        console.log("Listening to Firebase path:", `chatSessions/${uid}/${sessionID}/messages`);
        const unsubscribe = onValue(messagesRef, (snapshot) => {
            const data = snapshot.val();
            console.log("Firebase snapshot data:", data);
            if (data) {
                const parsedMessages = Object.entries(data).map(([id, msg]) => ({
                    id,
                    ...msg,
                }));
                parsedMessages.sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));
                console.log("Parsed and sorted messages:", parsedMessages);
                setMessages(parsedMessages);
            } else {
                console.log("No messages found in Firebase.");
                setMessages([]);
            }
        });

        return () => unsubscribe();
    }, [uid, sessionID]);

    const handleSend = async () => {
        if (!input.trim()) return;
        await sendMessage(uid, sessionID, input);
        const botReply = `Echo: ${input}`;
        await sendBotResponse(uid, sessionID, botReply);
        setInput("");
    };

    return (
        <div className="flex flex-col h-full border rounded-lg shadow-md p-4 bg-white">
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                {console.log("Rendering messages:", messages)}
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`p-2 rounded-lg max-w-xs ${msg.sender === "user"
                            ? "bg-gray-200 self-end text-right ml-auto"
                            : "bg-blue-100 self-start text-left mr-auto"
                        }`}
                    >
                        <p className={msg.sender === "user" ? "text-gray-700" : "text-blue-700"}>{msg.text}</p>
                    </div>
                ))}
            </div>
            <div className="flex space-x-2">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="flex-1 border rounded-lg p-2"
                    placeholder="Type a message..."
                />
                <button
                    onClick={handleSend}
                    className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
                >
                    Send
                </button>
            </div>
        </div>
    );
};

export default ChatWindow;