import React, { useRef, useState, useEffect } from "react";
import { database } from '../../Firebase/firebase';
import { set, ref, onValue, push } from "firebase/database";
import { useAuthValue } from '../../Firebase/AuthContext';
import { sendMessage } from '../../services/chatbotAPI';
import "./chatbot.css";

import { BookOpen, Menu } from 'lucide-react';

import RecommendationsPanel from "../../features/recommender/RecommendationPanel";
import PendingChanges from "./PendingChanges";

const ChatWindow = () => {
    const { currentUser } = useAuthValue();
    const uid = currentUser?.uid;
    const [mode, setMode] = useState("brainstorming");
    const [sessionID, setSessionID] = useState(null);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [messages, setMessages] = useState([]);
    const [backgroundStatus, setBackgroundStatus] = useState(null);

    const [showRecommendations, setShowRecommendations] = useState(false);
    const [showPendingChanges, setShowPendingChanges] = useState(false);

    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, backgroundStatus]);

    // Listen for background task completion
    useEffect(() => {
        if (!uid) return;

        const taskRef = ref(database, `backgroundTasks/${uid}`);
        const unsubscribe = onValue(taskRef, (snapshot) => {
            const tasks = snapshot.val();
            if (!tasks) {
                setBackgroundStatus(null);
                return;
            }

            const taskArray = Object.entries(tasks).map(([id, t]) => ({
                id,
                ...t,
                updatedAt: Number(t.updatedAt || 0),
            }));

            const latestTask = taskArray.sort((a, b) => b.updatedAt - a.updatedAt)[0];
            if (!latestTask) {
                setBackgroundStatus(null);
                return;
            }

            console.log("Latest background task:", latestTask);

            // Update status display
            if (latestTask.status === "processing") {
                setBackgroundStatus({
                    message: latestTask.message || "Processing...",
                    type: "processing"
                });
            } else if (latestTask.status === "done") {
                // Clear status after a brief delay
                setTimeout(() => setBackgroundStatus(null), 2000);
            } else if (latestTask.status === "error") {
                setBackgroundStatus({
                    message: "Something went wrong. Please try again.",
                    type: "error"
                });
                setTimeout(() => setBackgroundStatus(null), 5000);
            }
        });

        return () => unsubscribe();
    }, [uid]);

    // Listen for changes in Firebase messages
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
        if (input.trim() === "" || loading) return;

        const userText = input.trim();
        setInput("");

        // Show typing indicator
        setLoading(true);

        try {
            // Call backend
            const botData = await sendMessage(uid, sessionID, userText, mode);

            // Update session ID if new
            if (botData?.session_id && botData.session_id !== sessionID) {
                setSessionID(botData.session_id);
            }

            // If no immediate chat message but background work is happening
            if (!botData?.chat_message && botData?.background_processing) {
                setBackgroundStatus({
                    message: "Processing your request...",
                    type: "processing"
                });
            }

            // Hide typing indicator
            setLoading(false);

        } catch (error) {
            setLoading(false);
            console.error("Send error:", error);

            // Show error message
            setBackgroundStatus({
                message: "Failed to send message. Please try again.",
                type: "error"
            });

            setTimeout(() => setBackgroundStatus(null), 5000);
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
                {/* Toggle Buttons */}
                <div className="panel-toggle-bar">
                    <button
                        onClick={() => {
                            setShowRecommendations(!showRecommendations);
                            if (!showRecommendations) setShowPendingChanges(false);
                        }}
                        className={`panel-toggle-btn ${showRecommendations ? 'recommend-active' : ''}`}
                    >
                        <BookOpen />
                        Recommend Books
                    </button>
                    <button
                        onClick={() => {
                            setShowPendingChanges(!showPendingChanges);
                            if (!showPendingChanges) setShowRecommendations(false);
                        }}
                        className={`panel-toggle-btn ${showPendingChanges ? 'pending-active' : ''}`}
                    >
                        <Menu />
                        Pending Changes
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
                                        <div
                                            dangerouslySetInnerHTML={{ __html: msg.content }}
                                        />
                                    ) : (
                                        <p>{msg.content}</p>
                                    )}
                                </div>
                            </div>
                        ))}

                    {/* Loading indicator */}
                    {loading && (
                        <div className="message-wrapper assistant">
                            <div className="message assistant typing">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    )}

                    {/* Background status */}
                    {backgroundStatus && !loading && (
                        <div className="message-wrapper system">
                            <div className={`message system ${backgroundStatus.type}`}>
                                <p>{backgroundStatus.message}</p>
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
                        onKeyDown={(e) => e.key === "Enter" && !loading && handleSend()}
                        placeholder="Type a message..."
                        disabled={loading}
                    />
                    <button onClick={handleSend} disabled={loading}>
                        {loading ? "..." : "Send"}
                    </button>
                </div>
            </div>
            {/* Side Panels */}
            {showRecommendations && (
                <RecommendationsPanel
                    sessionId={sessionID}
                    userId={uid}
                    conversationHistory={messages.filter(m => m.role === 'user')}
                    isVisible={showRecommendations}
                    onToggle={() => setShowRecommendations(false)}
                />
            )}

            {showPendingChanges && (
                <PendingChanges
                    userId={uid}
                    isVisible={showPendingChanges}
                    onToggle={() => setShowPendingChanges(false)}
                />
            )}
        </div>
    );
};

export default ChatWindow;