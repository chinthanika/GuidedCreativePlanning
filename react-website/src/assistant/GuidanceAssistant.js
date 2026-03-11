import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthValue } from '../Firebase/AuthContext';
import { database } from '../Firebase/firebase';
import { ref, get } from 'firebase/database';
import './guidance-assistant.css';

const API_BASE = process.env.REACT_APP_AI_SERVER_URL || 'http://localhost:5000';

// ─── TLC tool map ──────────────────────────────────────────────────────────────
const TOOL_MAP = {
    '/library': {
        name: 'Book Recommendations',
        tlcStage: 'Building Knowledge',
        aiRole: 'AI as Curator',
        description: 'Explore genre examples and curated story resources to build foundational knowledge',
    },
    '/mentor-text': {
        name: 'Mentor Text Analysis',
        tlcStage: 'Modelling & Deconstruction',
        aiRole: 'AI as Deconstructor',
        description: 'Analyse real texts to understand narrative structure, pacing, and character techniques',
    },
    '/map-generator': {
        name: 'Story Map Generator',
        tlcStage: 'Modelling → Joint Construction',
        aiRole: 'AI as Deconstructor then Reflective Guide',
        description: 'Generate a visual story map from your idea, then refine it with AI analysis',
    },
    '/story-map': {
        name: 'Story Map',
        tlcStage: 'Joint Construction',
        aiRole: 'AI as Reflective Guide',
        description: 'Build and refine your story structure with AI analysis and guided iteration',
    },
    '/story-timeline': {
        name: 'Story Timeline',
        tlcStage: 'Joint Construction',
        aiRole: 'AI as Reflective Guide',
        description: 'Plan your story chronology and check narrative coherence',
    },
    '/story-world': {
        name: 'Story World',
        tlcStage: 'Joint Construction',
        aiRole: 'AI as Reflective Guide',
        description: 'Develop your story setting and world details',
    },
    '/chatbot': {
        name: 'Reflective Chatbot',
        tlcStage: 'Joint Construction',
        aiRole: 'AI as Reflective Guide',
        description: 'Brainstorm ideas (CPS mode) or deepen your thinking (Socratic mode)',
    },
    '/story-editor': {
        name: 'Story Editor & Feedback',
        tlcStage: 'Independent Construction',
        aiRole: 'AI as Feedback Assistant',
        description: 'Write and receive formative feedback on your draft',
    },
};

// ─── System prompt builder ─────────────────────────────────────────────────────
function buildSystemPrompt(contextSnapshot) {
    const { currentPage, toolsUsed, tlcStagesReached, currentTool } = contextSnapshot;

    const toolList = Object.entries(TOOL_MAP).map(([path, t]) =>
        `  • ${t.name} (${path}): ${t.tlcStage} — ${t.description}`
    ).join('\n');

    const usedNames = (toolsUsed || []).map(path => TOOL_MAP[path]?.name).filter(Boolean);
    const unusedTools = Object.entries(TOOL_MAP)
        .filter(([path]) => !(toolsUsed || []).includes(path))
        .map(([, t]) => t.name);

    return `You are a friendly, concise navigation guide for a creative writing planning tool called StoryPath. Your job is to help students understand what tools are available, when to use them, and guide them to the right place based on where they are in their writing journey.

THE PEDAGOGICAL FRAMEWORK (TLC - Teaching Learning Cycle):
1. Building Knowledge — Students explore genre examples and story resources. Tools: Book Recommendations, Mentor Text Analysis.
2. Modelling & Deconstruction — Students analyse texts to understand narrative craft. Tools: Mentor Text Analysis, Story Map Generator.
3. Joint Construction — Students plan and develop their story with AI support. Tools: Story Map, Story Timeline, Story World, Reflective Chatbot (Brainstorming or Deep Thinking mode).
4. Independent Construction — Students write and refine their draft. Tools: Story Editor & Feedback Panel.

AVAILABLE TOOLS:
${toolList}

CURRENT USER CONTEXT:
- Currently on: ${currentTool?.name || 'Home'} (${currentPage || '/'})
- TLC stages reached: ${tlcStagesReached?.join(', ') || 'none yet'}
- Tools used so far: ${usedNames.length > 0 ? usedNames.join(', ') : 'none yet — they are just starting'}
- Tools not yet explored: ${unusedTools.join(', ')}

YOUR GUIDANCE RULES:
- If a student has a vague story idea and hasn't started → recommend the Brainstorming Chatbot (/chatbot) first
- If a student has never explored mentor texts → gently suggest Mentor Text Analysis or Book Recommendations
- If a student has ideas but no structure → suggest Story Map Generator, then Story Map
- If a student has a map but needs to sequence events → suggest Story Timeline
- If a student seems ready to write → guide them to Story Editor
- Always explain WHY you're recommending something in one sentence
- Be warm, encouraging, and brief — students are creative writers, not engineers
- Keep responses SHORT (2-4 sentences max) unless they ask a detailed question
- Never be pushy — offer suggestions, don't lecture
- If they ask what to do next, give ONE clear recommendation, not a list
- You can mention what TLC stage they're in but keep it natural, not academic`;
}

// ─── Opening message builder ───────────────────────────────────────────────────
async function fetchOpeningMessage(contextSnapshot, signal) {
    const { toolsUsed } = contextSnapshot;
    const hasUsedTools = toolsUsed && toolsUsed.length > 0;

    const userPrompt = hasUsedTools
        ? `The student just opened the guidance assistant. They are currently on ${contextSnapshot.currentTool?.name || 'the home page'}. They have previously used: ${toolsUsed.map(p => TOOL_MAP[p]?.name).filter(Boolean).join(', ')}. Give a brief, warm, personalised greeting that acknowledges where they are and offers one helpful nudge about what might be worth doing next. 2-3 sentences max.`
        : `The student just opened the guidance assistant for the first time. They are on ${contextSnapshot.currentTool?.name || 'the home page'}. Give a brief, warm welcome and one concrete suggestion for where to start. 2-3 sentences max.`;

    const response = await fetch(`${API_BASE}/api/guidance/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
            system: buildSystemPrompt(contextSnapshot),
            messages: [{ role: 'user', content: userPrompt }],
        }),
    });

    if (!response.ok) throw new Error('Failed to fetch opening message');
    const data = await response.json();
    return data.content;
}

// ─── Main component ────────────────────────────────────────────────────────────
const GuidanceAssistant = () => {
    const { currentUser } = useAuthValue();
    const location = useLocation();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [contextSnapshot, setContextSnapshot] = useState(null);
    const [hasNewMessage, setHasNewMessage] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const abortRef = useRef(null);

    // Build context snapshot from Firebase on open
    const buildContext = async () => {
        const currentPage = location.pathname;
        const currentTool = TOOL_MAP[currentPage] || null;
        let toolsUsed = [];
        let tlcStagesReached = [];

        if (currentUser?.uid) {
            try {
                const snap = await get(ref(database, `analytics/${currentUser.uid}/featureMetrics`));
                if (snap.exists()) {
                    const metrics = snap.val();
                    // Infer tools used from featureMetrics keys
                    const keyToPath = {
                        reflectiveChatbot: '/chatbot',
                        storyMap: '/story-map',
                        mentorText: '/mentor-text',
                        timeline: '/story-timeline',
                        bookRecs: '/library',
                        storyEditor: '/story-editor',
                    };
                    toolsUsed = Object.keys(metrics)
                        .map(k => keyToPath[k])
                        .filter(Boolean);

                    // Derive TLC stages
                    const stageMap = {
                        '/library': 'Building Knowledge',
                        '/mentor-text': 'Modelling & Deconstruction',
                        '/map-generator': 'Modelling & Deconstruction',
                        '/story-map': 'Joint Construction',
                        '/story-timeline': 'Joint Construction',
                        '/story-world': 'Joint Construction',
                        '/chatbot': 'Joint Construction',
                        '/story-editor': 'Independent Construction',
                    };
                    tlcStagesReached = [...new Set(toolsUsed.map(p => stageMap[p]).filter(Boolean))];
                }
            } catch (e) {
                console.warn('[GuidanceAssistant] Firebase fetch failed:', e);
            }
        }

        return { currentPage, currentTool, toolsUsed, tlcStagesReached };
    };

    // Open handler
    const handleOpen = async () => {
        setIsOpen(true);
        setHasNewMessage(false);

        if (messages.length === 0) {
            setIsTyping(true);
            try {
                const ctx = await buildContext();
                setContextSnapshot(ctx);

                abortRef.current = new AbortController();
                const opening = await fetchOpeningMessage(ctx, abortRef.current.signal);
                setMessages([{ role: 'assistant', content: opening }]);
            } catch (e) {
                if (e.name !== 'AbortError') {
                    setMessages([{
                        role: 'assistant',
                        content: "Hi! I'm your StoryPath guide. Ask me what to do next, or tell me about your story idea and I'll point you in the right direction! 📖",
                    }]);
                }
            } finally {
                setIsTyping(false);
            }
        }
    };

    const handleClose = () => {
        setIsOpen(false);
        abortRef.current?.abort();
    };


    useEffect(() => {
        if (isOpen) {
            setMessages([]);
            setContextSnapshot(null);
            handleOpen();
        }
        // eslint-disable-next-line
    }, [location.pathname]);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
    }, [isOpen]);

    const sendMessage = async () => {
        const text = input.trim();
        if (!text || isTyping) return;

        const ctx = contextSnapshot || await buildContext();
        if (!contextSnapshot) setContextSnapshot(ctx);

        const newMessages = [...messages, { role: 'user', content: text }];
        setMessages(newMessages);
        setInput('');
        setIsTyping(true);

        try {
            abortRef.current = new AbortController();
            const response = await fetch(`${API_BASE}/api/guidance/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortRef.current.signal,
                body: JSON.stringify({
                    system: buildSystemPrompt(ctx),
                    messages: newMessages.map(m => ({ role: m.role, content: m.content })),
                }),
            });

            if (!response.ok) throw new Error('API error');
            const data = await response.json();
            setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
        } catch (e) {
            if (e.name !== 'AbortError') {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: "Sorry, I couldn't connect right now. Try again in a moment!",
                }]);
            }
        } finally {
            setIsTyping(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // Don't render if not logged in
    if (!currentUser) return null;

    return (
        <div className="ga-root">
            {/* Chat window */}
            {isOpen && (
                <div className="ga-window">
                    <div className="ga-header">
                        <div className="ga-header-left">
                            <div className="ga-avatar-small">
                                <span>✦</span>
                            </div>
                            <div>
                                <p className="ga-header-title">StoryPath Guide</p>
                                <p className="ga-header-subtitle">
                                    {contextSnapshot?.currentTool?.name || 'Navigation assistant'}
                                </p>
                            </div>
                        </div>
                        <button className="ga-close-btn" onClick={handleClose} aria-label="Close">
                            ✕
                        </button>
                    </div>

                    <div className="ga-messages">
                        {messages.map((m, i) => (
                            <div key={i} className={`ga-message ga-message-${m.role}`}>
                                {m.role === 'assistant' && (
                                    <div className="ga-message-avatar">✦</div>
                                )}
                                <div className="ga-bubble">{m.content}</div>
                            </div>
                        ))}
                        {isTyping && (
                            <div className="ga-message ga-message-assistant">
                                <div className="ga-message-avatar">✦</div>
                                <div className="ga-bubble ga-typing">
                                    <span /><span /><span />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="ga-input-row">
                        <textarea
                            ref={inputRef}
                            className="ga-input"
                            placeholder="Ask me what to do next..."
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={1}
                        />
                        <button
                            className="ga-send-btn"
                            onClick={sendMessage}
                            disabled={!input.trim() || isTyping}
                            aria-label="Send"
                        >
                            ➤
                        </button>
                    </div>
                </div>
            )}

            {/* Floating trigger button */}
            <button
                className={`ga-trigger ${isOpen ? 'ga-trigger-open' : ''}`}
                onClick={isOpen ? handleClose : handleOpen}
                aria-label="Open StoryPath guide"
            >
                {isOpen ? (
                    <span className="ga-trigger-icon">✕</span>
                ) : (
                    <>
                        <span className="ga-trigger-icon">✦</span>
                        {hasNewMessage && <span className="ga-trigger-dot" />}
                    </>
                )}
            </button>
        </div>
    );
};

export default GuidanceAssistant;