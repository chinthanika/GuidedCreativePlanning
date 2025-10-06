import React, { useRef, useState, useEffect } from "react";
import { database } from '../../Firebase/firebase';
import { set, ref, onValue, push } from "firebase/database";
import { useAuthValue } from '../../Firebase/AuthContext';

import { sendMessage } from '../../services/chatbotAPI';
import "./chatbot.css";

const ChatWindow = () => {
    const { currentUser } = useAuthValue();
    const uid = currentUser?.uid;
    const [mode, setMode] = useState("brainstorming");
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

    // Listen for background task completion
    useEffect(() => {
        if (!uid) return;

        const taskRef = ref(database, `backgroundTasks/${uid}`);
        const unsubscribe = onValue(taskRef, (snapshot) => {
            const tasks = snapshot.val();
            if (!tasks) return;

            const taskArray = Object.values(tasks);
            const latestTask = taskArray[taskArray.length - 1];
            if (!latestTask) return;

            if (latestTask.status === "error") {
                setMessages(prev => [
                    ...prev,
                    {
                        id: Date.now(),
                        role: "system",
                        content: "Background update failed.",
                        timestamp: Date.now(),
                        visible: true
                    }
                ]);
            }
        });

        return () => unsubscribe();
    }, [uid]);


    // Listen for changes in Firebase
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

    // Handle sending a message
    const handleSend = async () => {
        if (input.trim() === "") return;

        const userText = input.trim();
        setInput("");

        // Add user message to local state immediately
        const userMsgId = Date.now();
        setMessages(prev => [
            ...prev,
            { id: userMsgId, role: "user", content: userText, timestamp: Date.now(), visible: true }
        ]);

        // Show typing indicator
        setLoading(true);

        try {
            // Call backend - should return in <500ms
            const botData = await sendMessage(uid, sessionID, userText, mode);

            // Hide typing indicator
            setLoading(false);

            // Show instant chat response
            if (botData?.chat_message) {
                setMessages(prev => [
                    ...prev,
                    {
                        id: Date.now(),
                        role: "assistant",
                        content: botData.chat_message,
                        timestamp: Date.now(),
                        visible: true
                    }
                ]);
            }

            // If background processing, show spinner
            if (botData?.background_processing) {
                const processingMsgId = Date.now() + 1;
                setMessages(prev => [
                    ...prev,
                    {
                        id: processingMsgId,
                        role: "system",
                        content: "Processing profile updates…",
                        timestamp: Date.now(),
                        visible: true,
                        temp: true // Mark as temporary
                    }
                ]);

                // Remove processing message after 3 seconds
                setTimeout(() => {
                    setMessages(prev => prev.filter(msg => msg.id !== processingMsgId));
                }, 3000);
            }

            // Update session ID if new
            if (botData?.session_id && botData.session_id !== sessionID) {
                setSessionID(botData.session_id);
            }

        } catch (error) {
            setLoading(false);
            console.error("Send error:", error);
            setMessages(prev => [
                ...prev,
                {
                    id: Date.now(),
                    role: "system",
                    content: "Failed to send message. Please try again.",
                    timestamp: Date.now(),
                    visible: true
                }
            ]);
        }
    };

    return (
        <div className="chatbot-page">
            <div className="chatbot-window">
                <div className="mode-switcher">
                    <button
                        onClick={() => setMode("deepthinking")}
                        className={mode === "deepthinking" ? "active" : ""}
                    >
                        Deepthinking
                    </button>
                    <button
                        onClick={() => setMode("brainstorming")}
                        className={mode === "brainstorming" ? "active" : ""}
                    >
                        Brainstorming
                    </button>
                </div>

                {/* Chat messages */}
                <div className="chat-messages">
                    {messages
                        .filter((msg) => msg.visible !== false)
                        .map((msg) => (
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
