import React, { useState, useEffect, useRef } from "react";

import { useAuthValue } from '../../Firebase/AuthContext';
import { database } from '../../Firebase/firebase';
import { ref, push, set, get, update, serverTimestamp, onValue, query, orderByChild } from "firebase/database";

import "./chatbot.css"; // optional styling

export default function ChatbotWindow() {
    const { currentUser } = useAuthValue();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [chatSessionId, setChatSessionId] = useState(null);

    const messagesEndRef = useRef(null);

    // ✅ Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    // ✅ Create a new chat session if none exists
    useEffect(() => {
        if (!currentUser) return;

        const newChatRef = push(ref(database, `chatSessions/${currentUser.uid}`));
        const newChatId = newChatRef.key;

        set(newChatRef, {
            metadata: {
                title: "New Chat",
                createdAt: Date.now(),
                updatedAt: Date.now()
            },
            messages: {}
        });

        setChatSessionId(newChatId);

        // Attach listener to messages
        const messagesRef = ref(database, `chatSessions/${currentUser.uid}/${newChatId}/messages`);
        const q = query(messagesRef, orderByChild("timestamp"));

        const unsubscribe = onValue(q, (snapshot) => {
            const msgs = [];
            snapshot.forEach((child) => {
                msgs.push({ id: child.key, ...child.val() });
            });
            setMessages(msgs);
        });

        return () => unsubscribe();
    }, [currentUser]);

    // ✅ Send message (push to Firebase)
    const sendMessage = async () => {
        if (!input.trim() || !chatSessionId) return;

        const messagesRef = ref(database, `chatSessions/${currentUser.uid}/${chatSessionId}/messages`);

        // User message
        await push(messagesRef, {
            sender: "user",
            text: input,
            timestamp: Date.now()
        });

        setInput("");

        // Temporary mock bot reply
        setTimeout(async () => {
            await push(messagesRef, {
                sender: "bot",
                text: "Echo: " + input,
                timestamp: Date.now()
            });
        }, 500);

        // Update metadata timestamp
        const metadataRef = ref(database, `chatSessions/${currentUser.uid}/${chatSessionId}/metadata`);
        await update(metadataRef, { updatedAt: Date.now() });
    };

    return (
        <div className="chatbot-window">
            <div className="chat-messages">
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`message ${msg.sender === "user" ? "user" : "bot"}`}
                    >
                        {msg.text}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <div className="chat-input">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                    placeholder="Type a message..."
                />
                <button onClick={sendMessage}>Send</button>
            </div>
        </div>
    );
}
