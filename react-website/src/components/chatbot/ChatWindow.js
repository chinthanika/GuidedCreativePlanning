import React, { useRef, useState, useEffect } from "react";
import { database } from '../../Firebase/firebase';
import { set, ref, onValue, push } from "firebase/database";
import { useAuthValue } from '../../Firebase/AuthContext';

import { sendMessage } from '../../services/chatbotAPI';
import "./chatbot.css";

const ChatWindow = () => {
    const { currentUser } = useAuthValue();
    const uid = currentUser?.uid;

    const [sessionID, setSessionID] = useState(null);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [messages, setMessages] = useState([]);


    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);


    // 🔹 Listen for changes in Firebase
    useEffect(() => {
        if (!uid) return;
        if (!sessionID) {
            const sessionsRef = ref(database, `chatSessions/${uid}`);
            const newSessionRef = push(sessionsRef);

            set(newSessionRef, {
                metadata: {
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    title: "New Chat",
                },
                messages: {},
            });

            setSessionID(newSessionRef.key);
            return;
        }

        const messagesRef = ref(database, `chatSessions/${uid}/${sessionID}/messages`);

        const unsubscribe = onValue(messagesRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const parsedMessages = Object.entries(data).map(([id, msg]) => ({
                    id,
                    ...msg,
                }));
                parsedMessages.sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));
                setMessages(parsedMessages);
            } else {
                setMessages([]);
            }
        });

        return () => unsubscribe();
    }, [uid, sessionID]);

    // 🔹 Handle sending a message
    const handleSend = async () => {
        if (input.trim() === "") return;

        setLoading(true); // Show typing dots immediately
        setInput("");     // Clear input immediately

        await sendMessage(uid, sessionID, input);

        setLoading(false); // Hide typing dots after bot response is saved
    };


    return (
        <div className="chatbot-page">
            <div className="chatbot-window">
                {/* Chat messages */}
                <div className="chat-messages">
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`message-wrapper ${msg.role === "user" ? "user" : "assistant"}`}
                        >
                            <div className={`message ${msg.role}`}>
                                {msg.role === "assistant" && msg.content.startsWith("<") ? (
                                    // If message starts with HTML, render it
                                    <div
                                        dangerouslySetInnerHTML={{ __html: msg.content }}
                                    />
                                ) : (
                                    // Otherwise render as plain text
                                    <p>{msg.content}</p>
                                )}
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="message-wrapper assistant">
                            <div className="message assistant typing">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input bar */}
                <div className="chat-input">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSend()}
                        placeholder="Type a message..."
                    />
                    <button onClick={handleSend}>Send</button>
                </div>
            </div>
        </div>
    );
};

export default ChatWindow;
