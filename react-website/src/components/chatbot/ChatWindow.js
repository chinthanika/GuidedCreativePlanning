import React, { useRef, useState, useEffect, useCallback } from "react";
import { database } from '../../Firebase/firebase';
import { set, ref, onValue, push, get } from "firebase/database";
import { useAuthValue } from '../../Firebase/AuthContext';
import { sendMessage } from '../../services/chatbotAPI';
import "./chatbot.css";

import { BookOpen, Menu, MessageSquare } from 'lucide-react';

import RecommendationsPanel from "../../features/recommender/RecommendationPanel";
import PendingChanges from "./PendingChanges";
import SessionsPanel from "./SessionsPanel";

import { logPageView, logPageExit, logUIInteraction } from '../../utils/analytics';

const API_BASE = process.env.REACT_APP_AI_SERVER_URL || "http://localhost:5000";
// const API_BASE = "http://localhost:5000";

// ─── Thin fire-and-forget helpers ────────────────────────────────────────────

function logSessionStart(userId, sessionId, mode) {
  fetch(`${API_BASE}/api/chat/log-session-start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, sessionId, mode, timestamp: Date.now() })
  }).catch(() => {});
}

function logChatMessage(userId, sessionId, mode, messageLength, messageIndex, currentStage) {
  fetch(`${API_BASE}/api/chat/log-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      sessionId,
      mode,
      role: 'user',
      messageLength,
      messageIndex,
      currentStage: currentStage || null,
      timestamp: Date.now()
    })
  }).catch(() => {});
}

function logStageTransition(userId, sessionId, fromStage, toStage) {
  fetch(`${API_BASE}/api/chat/log-stage-transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      sessionId,
      mode: 'brainstorming',
      fromStage,
      toStage,
      trigger: 'auto',
      timestamp: Date.now()
    })
  }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────

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
  const [showSessions, setShowSessions] = useState(false);

  const messagesEndRef = useRef(null);

  // ── Analytics refs ──────────────────────────────────────────────────────────
  const pageEntryTimeRef     = useRef(null);   // page-level dwell time
  const userMessageCountRef  = useRef(0);      // running count of user msgs this session
  const prevBsStageRef       = useRef(null);   // last known BS CPS stage
  const modeRef              = useRef(mode);   // always-current mode for callbacks
  const sessionIDRef         = useRef(null);   // always-current sessionID for callbacks

  // Keep refs in sync with state
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { sessionIDRef.current = sessionID; }, [sessionID]);

  // ── Page view / exit ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;
    pageEntryTimeRef.current = Date.now();
    logPageView(uid, 'reflectiveChatbot', 'joint_construction');

    return () => {
      const duration = Date.now() - (pageEntryTimeRef.current || Date.now());
      logPageExit(uid, 'reflectiveChatbot', duration);
    };
  }, [uid]);

  // ── Scroll to bottom ────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, backgroundStatus]);

  // ── Background task listener ────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;

    const taskRef = ref(database, `backgroundTasks/${uid}`);
    const unsubscribe = onValue(taskRef, (snapshot) => {
      const tasks = snapshot.val();
      if (!tasks) { setBackgroundStatus(null); return; }

      const taskArray = Object.entries(tasks).map(([id, t]) => ({
        id, ...t, updatedAt: Number(t.updatedAt || 0),
      }));
      const latestTask = taskArray.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (!latestTask) { setBackgroundStatus(null); return; }

      if (latestTask.status === "processing") {
        setBackgroundStatus({ message: latestTask.message || "Processing...", type: "processing" });
      } else if (latestTask.status === "done") {
        setTimeout(() => setBackgroundStatus(null), 2000);
      } else if (latestTask.status === "error") {
        setBackgroundStatus({ message: "Something went wrong. Please try again.", type: "error" });
        setTimeout(() => setBackgroundStatus(null), 5000);
      }
    });

    return () => unsubscribe();
  }, [uid]);

  // ── BS stage-transition watcher ─────────────────────────────────────────────
  // Watches the session metadata in Firebase for CPS stage changes and logs them.
  useEffect(() => {
    if (!uid || !sessionID || mode !== 'brainstorming') return;

    const metaRef = ref(database, `chatSessions/${uid}/${sessionID}/metadata/brainstorming/stage`);
    const unsubscribe = onValue(metaRef, (snapshot) => {
      const currentStage = snapshot.val();
      if (!currentStage) return;

      const prev = prevBsStageRef.current;
      if (prev && prev !== currentStage) {
        // Stage changed — log the transition
        logStageTransition(uid, sessionID, prev, currentStage);

        // Also log mode_switch-style UI interaction so the dashboard sees it
        logUIInteraction(uid, 'reflectiveChatbot', 'cps_stage_reached', {
          stage: currentStage,
          sessionId: sessionID
        });
      }
      prevBsStageRef.current = currentStage;
    });

    return () => unsubscribe();
  }, [uid, sessionID, mode]);

  // ── Session initialisation ──────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;

    if (!sessionID) {
      const sessionsRef = ref(database, `chatSessions/${uid}`);
      get(sessionsRef).then((snapshot) => {
        const sessions = snapshot.val();
        if (sessions && Object.keys(sessions).length > 0) {
          const sorted = Object.entries(sessions).sort((a, b) => {
            const aTime = a[1]?.metadata?.updatedAt || 0;
            const bTime = b[1]?.metadata?.updatedAt || 0;
            return bTime - aTime;
          });
          const mostRecentId = sorted[0][0];
          const sessionMode  = sorted[0][1]?.metadata?.mode || 'brainstorming';
          setSessionID(mostRecentId);
          setMode(sessionMode);

          // Seed user-message count from existing session so the index is correct
          const existingMessages = sorted[0][1]?.messages || {};
          const existingUserMsgs = Object.values(existingMessages)
            .filter(m => m?.role === 'user').length;
          userMessageCountRef.current = existingUserMsgs;

          // Seed prev BS stage
          prevBsStageRef.current =
            sorted[0][1]?.metadata?.brainstorming?.stage || null;

          console.log('Loaded most recent session:', mostRecentId);
        } else {
          createNewSession();
        }
      }).catch(() => createNewSession());
      return;
    }

    // Listen to messages for this session
    const messagesRef = ref(database, `chatSessions/${uid}/${sessionID}/messages`);
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const parsed = Object.entries(data)
          .map(([id, msg]) => ({ id, ...msg }))
          .sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));
        setMessages(parsed);
      } else {
        setMessages([]);
      }
    });

    return () => unsubscribe();
  }, [uid, sessionID]);

  // ── Session creation ────────────────────────────────────────────────────────
  const createNewSession = useCallback(() => {
    if (!uid) return;

    const sessionsRef  = ref(database, `chatSessions/${uid}`);
    const newSessionRef = push(sessionsRef);

    set(newSessionRef, {
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        title: "New Chat",
        mode: modeRef.current
      },
      messages: {},
    });

    const newId = newSessionRef.key;
    setSessionID(newId);
    setMessages([]);
    userMessageCountRef.current = 0;
    prevBsStageRef.current = null;

    // Log session start
    logSessionStart(uid, newId, modeRef.current);

    console.log('Created new session:', newId);
  }, [uid]);

  // ── Mode switch ─────────────────────────────────────────────────────────────
  const handleModeSwitch = useCallback((newMode) => {
    if (newMode === mode) return;

    const prevMode = mode;
    setMode(newMode);

    // Log mode switch as UI interaction
    logUIInteraction(uid, 'reflectiveChatbot', 'mode_switch', {
      fromMode: prevMode,
      toMode: newMode,
      sessionId: sessionIDRef.current
    });
  }, [mode, uid]);

  // ── Session selection ───────────────────────────────────────────────────────
  const handleSelectSession = useCallback((selectedSessionId) => {
    if (selectedSessionId === sessionID) return;

    // Look up the session's mode so we can sync state
    get(ref(database, `chatSessions/${uid}/${selectedSessionId}/metadata`))
      .then((snap) => {
        const meta = snap.val() || {};
        const sessionMode = meta.mode || 'brainstorming';
        setMode(sessionMode);

        // Seed message count
        get(ref(database, `chatSessions/${uid}/${selectedSessionId}/messages`))
          .then((msgSnap) => {
            const msgs = msgSnap.val() || {};
            userMessageCountRef.current = Object.values(msgs)
              .filter(m => m?.role === 'user').length;
          }).catch(() => {});

        prevBsStageRef.current = meta?.brainstorming?.stage || null;
      }).catch(() => {});

    setSessionID(selectedSessionId);
    setMessages([]);
    setShowSessions(false);
  }, [sessionID, uid]);

  // ── New session ─────────────────────────────────────────────────────────────
  const handleNewSession = useCallback(() => {
    createNewSession();
    setShowSessions(false);
  }, [createNewSession]);

  // ── Send message ────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (input.trim() === "" || loading) return;

    const userText    = input.trim();
    const currentMode = modeRef.current;
    const currentSid  = sessionIDRef.current;

    setInput("");
    setLoading(true);

    // ── Log the user message ──
    const msgIndex = userMessageCountRef.current;
    userMessageCountRef.current += 1;

    // Grab current BS stage for the message log (brainstorming only)
    let currentBsStage = null;
    if (currentMode === 'brainstorming' && uid && currentSid) {
      try {
        const stageSnap = await get(
          ref(database, `chatSessions/${uid}/${currentSid}/metadata/brainstorming/stage`)
        );
        currentBsStage = stageSnap.val() || null;
      } catch (_) {}
    }

    logChatMessage(uid, currentSid, currentMode, userText.length, msgIndex, currentBsStage);

    try {
      const botData = await sendMessage(uid, currentSid, userText, currentMode);

      if (botData?.session_id && botData.session_id !== currentSid) {
        setSessionID(botData.session_id);
      }

      if (!botData?.chat_message && botData?.background_processing) {
        setBackgroundStatus({ message: "Processing your request...", type: "processing" });
      }

      setLoading(false);
    } catch (error) {
      setLoading(false);
      console.error("Send error:", error);
      setBackgroundStatus({ message: "Failed to send message. Please try again.", type: "error" });
      setTimeout(() => setBackgroundStatus(null), 5000);
    }
  };

  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="chatbot-page">
      <SessionsPanel
        userId={uid}
        currentSessionId={sessionID}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        isVisible={showSessions}
        onToggle={() => setShowSessions(false)}
      />

      <div className="chatbot-window">
        {/* Panel Toggle Bar */}
        <div className="panel-toggle-bar">
          <button
            onClick={() => {
              setShowSessions(!showSessions);
              setShowRecommendations(false);
              setShowPendingChanges(false);
            }}
            className={`panel-toggle-btn ${showSessions ? 'sessions-active' : ''}`}
          >
            <MessageSquare />
            Sessions
          </button>

          <button
            onClick={() => {
              setShowRecommendations(!showRecommendations);
              setShowSessions(false);
              setShowPendingChanges(false);
            }}
            className={`panel-toggle-btn ${showRecommendations ? 'recommend-active' : ''}`}
          >
            <BookOpen />
            Books
          </button>

          <button
            onClick={() => {
              setShowPendingChanges(!showPendingChanges);
              setShowSessions(false);
              setShowRecommendations(false);
            }}
            className={`panel-toggle-btn ${showPendingChanges ? 'pending-active' : ''}`}
          >
            <Menu />
            Pending
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="mode-switcher">
          <button
            onClick={() => handleModeSwitch("deepthinking")}
            className={mode === "deepthinking" ? "active" : ""}
          >
            Deepthinking
          </button>
          <button
            onClick={() => handleModeSwitch("brainstorming")}
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
                  {msg.role === "assistant" && msg.content?.startsWith("<") ? (
                    <div dangerouslySetInnerHTML={{ __html: msg.content }} />
                  ) : (
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

      {/* Right Side Panels */}
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
