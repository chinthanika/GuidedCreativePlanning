import React, { useState, useEffect } from 'react';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    AreaChart, Area
} from 'recharts';
import {
    Users, Activity, Clock, TrendingUp, Download,
    RefreshCw, Eye, Map, BookOpen, FileText, Zap, CheckCircle,
    AlertCircle, GitMerge, Layers, Calendar, MessageSquare,
    Brain, Lightbulb, ArrowRight, Repeat
} from 'lucide-react';
import './admin-dashboard.css';

const API_BASE = process.env.REACT_APP_AI_SERVER_URL || "http://localhost:5000";
const COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];

// ─── Formatting helpers ────────────────────────────────────────────────────────
const fmtSec = (ms)   => ms != null ? `${(ms / 1000).toFixed(1)}s`          : '—';
const fmtMin = (ms)   => ms != null ? `${Math.round(ms / 60000)}m`           : '—';
const pct    = (n, d) => (d && d > 0) ? `${((n / d) * 100).toFixed(0)}%`    : '—';
const orDash = (v)    => (v != null && v !== '') ? v                          : '—';
const round1 = (v)    => v != null ? Number(v).toFixed(1)                    : '—';

// ─── Root ──────────────────────────────────────────────────────────────────────
const AdminDashboard = () => {
    const [selectedUserId, setSelectedUserId] = useState('');
    const [allUsers,       setAllUsers]       = useState([]);
    const [userData,       setUserData]       = useState(null);
    const [studySummary,   setStudySummary]   = useState(null);
    const [loading,        setLoading]        = useState(false);
    const [error,          setError]          = useState(null);
    const [viewMode,       setViewMode]       = useState('overview');

    useEffect(() => { loadAllUsers(); }, []);

    const loadAllUsers = async () => {
        try {
            const r = await fetch(`${API_BASE}/admin/analytics/users-list`);
            if (r.ok) setAllUsers((await r.json()).users || []);
        } catch (e) { console.error('Failed to load users:', e); }
    };

    const loadStudySummary = async () => {
        setLoading(true); setError(null);
        try {
            const r = await fetch(`${API_BASE}/admin/analytics/study-summary`);
            if (r.ok) setStudySummary(await r.json());
            else throw new Error('Failed to load study summary');
        } catch (e) { setError(e.message); }
        finally     { setLoading(false); }
    };

    const loadUserAnalytics = async (userId) => {
        setLoading(true); setError(null);
        try {
            const r = await fetch(`${API_BASE}/admin/analytics/user/${userId}`);
            if (r.ok) { setUserData(await r.json()); setViewMode('user'); }
            else throw new Error('Failed to load user analytics');
        } catch (e) { setError(e.message); }
        finally     { setLoading(false); }
    };

    const handleExportCSV = async () => {
        try {
            const r = await fetch(`${API_BASE}/admin/analytics/export-csv`);
            if (r.ok) {
                const blob = await r.blob();
                const url  = window.URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href = url; a.download = `study_analytics_${Date.now()}.csv`;
                document.body.appendChild(a); a.click();
                document.body.removeChild(a); window.URL.revokeObjectURL(url);
            }
        } catch (e) { setError('Failed to export CSV'); }
    };

    useEffect(() => { if (viewMode === 'overview') loadStudySummary(); }, [viewMode]);

    if (loading) return (
        <div className="admin-dashboard-loading">
            <div className="admin-dashboard-loading-spinner"><RefreshCw className="w-16 h-16" /></div>
            <p className="admin-dashboard-loading-text">Loading analytics...</p>
        </div>
    );

    return (
        <div className="admin-dashboard">
            <div className="admin-dashboard-header">
                <div className="admin-dashboard-title-section">
                    <div>
                        <h1 className="admin-dashboard-title">📊 Study Analytics Dashboard</h1>
                        <p className="admin-dashboard-subtitle">Comprehensive metrics for the TLC Framework study</p>
                    </div>
                    <div className="admin-dashboard-button-group">
                        <button onClick={() => setViewMode('overview')}
                            className={`admin-dashboard-button ${viewMode === 'overview' ? 'admin-dashboard-button-primary' : ''}`}>
                            <Users className="w-4 h-4" /> Overview
                        </button>
                        <button onClick={handleExportCSV} className="admin-dashboard-button">
                            <Download className="w-4 h-4" /> Export CSV
                        </button>
                        <button
                            onClick={viewMode === 'overview' ? loadStudySummary : () => loadUserAnalytics(selectedUserId)}
                            className="admin-dashboard-button">
                            <RefreshCw className="w-4 h-4" /> Refresh
                        </button>
                    </div>
                </div>

                <div className="admin-dashboard-user-selector">
                    <label className="admin-dashboard-label">View Specific User</label>
                    <div className="admin-dashboard-select-group">
                        <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}
                            className="admin-dashboard-select">
                            <option value="">Select a user...</option>
                            {allUsers.map(u => (
                                <option key={u.userId} value={u.userId}>
                                    {u.userId} ({u.totalInteractions} interactions)
                                </option>
                            ))}
                        </select>
                        <button onClick={() => selectedUserId && loadUserAnalytics(selectedUserId)}
                            disabled={!selectedUserId}
                            className="admin-dashboard-button admin-dashboard-button-primary">
                            Load User Data
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="admin-dashboard-error">
                    <p className="admin-dashboard-error-text">❌ {error}</p>
                </div>
            )}

            {viewMode === 'overview' && studySummary && <OverviewView data={studySummary} />}
            {viewMode === 'user'     && userData      && <UserView    data={userData}     />}
        </div>
    );
};

// ─── Overview ──────────────────────────────────────────────────────────────────
const OverviewView = ({ data }) => {
    const toolUsageData = Object.entries(data.toolPopularity || {}).map(([name, usage]) => ({ name, usage }));
    const stageTimeData = Object.entries(data.avgStageTime   || {}).map(([stage, time]) => ({
        name: stage.replace(/_/g, ' '), minutes: Math.round(time / 60000)
    }));

    // Chatbot overview aggregates (populated by backend study-summary endpoint)
    const chatStats = data.chatbotStats || {};

    return (
        <div className="admin-dashboard-content">
            <div className="admin-dashboard-stats-grid">
                <StatCard icon={<Users      className="w-6 h-6" />} label="Total Participants"  value={data.totalParticipants || 0}                                                         color="purple" />
                <StatCard icon={<Activity   className="w-6 h-6" />} label="Avg Recursions/User" value={data.recursionStats?.avgRecursionsPerUser?.toFixed(1) || '0.0'}                      color="pink"   />
                <StatCard icon={<TrendingUp className="w-6 h-6" />} label="Total Tool Uses"     value={Object.values(data.toolPopularity || {}).reduce((a, b) => a + b, 0)}                 color="blue"   />
                <StatCard icon={<Clock      className="w-6 h-6" />} label="Avg Timeline Score"  value={data.outcomeAverages?.avgTimelineCoherence?.toFixed(1) || 'N/A'}                     color="green"  />
            </div>

            <div className="admin-dashboard-charts-grid">
                <ChartCard title="Tool Usage Across All Participants">
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={toolUsageData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                            <XAxis dataKey="name" stroke="#52525B" />
                            <YAxis stroke="#52525B" />
                            <Tooltip />
                            <Bar dataKey="usage" fill="#7C3AED" />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Average Time per TLC Stage">
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={stageTimeData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                            <XAxis dataKey="name" stroke="#52525B" />
                            <YAxis stroke="#52525B" />
                            <Tooltip />
                            <Bar dataKey="minutes" fill="#EC4899" />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            <div className="admin-dashboard-info-card">
                <h3 className="admin-dashboard-info-title">🔄 Recursion Patterns</h3>
                <div className="admin-dashboard-info-grid">
                    <InfoItem label="Total Recursions"       value={data.recursionStats?.totalRecursions || 0} />
                    <InfoItem label="Most Common Transition" value={data.recursionStats?.mostCommonTransition?.[0] || 'N/A'}
                              sub={`${data.recursionStats?.mostCommonTransition?.[1] || 0} times`} />
                    <InfoItem label="Average per User"       value={data.recursionStats?.avgRecursionsPerUser?.toFixed(1) || '0.0'} />
                </div>
            </div>

            {/* Chatbot aggregate block — only shown if backend supplies it */}
            {(chatStats.totalChatSessions != null) && (
                <div className="admin-dashboard-info-card">
                    <h3 className="admin-dashboard-info-title">
                        <MessageSquare className="w-5 h-5" style={{ color: '#7C3AED' }} />
                        Reflective Chatbot — Study-Wide Summary
                    </h3>
                    <div className="admin-dashboard-info-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
                        <InfoItem label="Total Chat Sessions"      value={orDash(chatStats.totalChatSessions)}                        />
                        <InfoItem label="BS Sessions"              value={orDash(chatStats.totalBsSessions)}   sub="Brainstorming"    />
                        <InfoItem label="DT Sessions"              value={orDash(chatStats.totalDtSessions)}   sub="Deep Thinking"    />
                        <InfoItem label="Avg Msgs / Session"       value={round1(chatStats.avgMessagesPerSession)}                    />
                        <InfoItem label="Avg Msg Length (chars)"   value={round1(chatStats.avgUserMessageLength)}                     />
                        <InfoItem label="Total CPS Recursions"     value={orDash(chatStats.totalCpsRecursions)} sub="backward transitions" />
                        <InfoItem label="Avg BS Ideas / Session"   value={round1(chatStats.avgIdeasPerSession)}                       />
                        <InfoItem label="Avg BS Creativity Score"  value={round1(chatStats.avgCreativityScore)} sub="fluency+flex+elab+orig" />
                    </div>
                </div>
            )}

            <div className="admin-dashboard-info-card">
                <h3 className="admin-dashboard-info-title">👥 Study Group Distribution</h3>
                <div className="admin-dashboard-info-grid">
                    <InfoItem label="Tool First"    value={data.studyGroups?.tool_first    || 0} color="#7C3AED" />
                    <InfoItem label="No Tool First" value={data.studyGroups?.no_tool_first || 0} color="#EC4899" />
                </div>
            </div>
        </div>
    );
};

// ─── User View ─────────────────────────────────────────────────────────────────
const UserView = ({ data }) => {
    const toolUsageData = Object.entries(data.toolUsage             || {}).map(([name, count]) => ({ name, count }));
    const stageTimeData = Object.entries(data.stageTimeDistribution || {}).map(([stage, time]) => ({
        name: stage.replace(/_/g, ' '), minutes: Math.round(time / 60000)
    }));

    const smScores = (data.outcomeMetrics?.storyMapHealthScores || []).map(entry => typeof entry === 'object' ? entry.score : entry)
    const tlScores = (data.outcomeMetrics?.timelineCoherenceScores || []).map((s, i) => ({ run: i + 1, score: s }));

    const recentJourney = (data.journey || []).slice(-10).reverse();

    return (
        <div className="admin-dashboard-content">
            {/* User header */}
            <div className="admin-dashboard-info-card">
                <h2 className="admin-dashboard-chart-title">User: {data.userId}</h2>
                <div className="admin-dashboard-info-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
                    <InfoItem label="Study Group"        value={data.userMetadata?.studyGroup || 'N/A'} />
                    <InfoItem label="Total Interactions" value={data.totalToolInteractions    || 0}     />
                    <InfoItem label="Recursions"         value={data.recursionCount           || 0}     />
                    <InfoItem label="Condition"          value={data.userMetadata?.condition  || 'N/A'} />
                </div>
            </div>

            <div className="admin-dashboard-charts-grid">
                <ChartCard title="Tool Usage">
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie data={toolUsageData} dataKey="count" nameKey="name"
                                 cx="50%" cy="50%" outerRadius={80} label>
                                {toolUsageData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip /><Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Time per TLC Stage">
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={stageTimeData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                            <XAxis dataKey="name" stroke="#52525B" />
                            <YAxis stroke="#52525B" />
                            <Tooltip />
                            <Bar dataKey="minutes" fill="#16A34A" />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {/* Longitudinal score improvement */}
            {(smScores.length >= 2 || tlScores.length >= 2) && (
                <div className="admin-dashboard-info-card">
                    <h3 className="admin-dashboard-info-title">📈 Score Improvement Over Time</h3>
                    <p className="admin-dashboard-info-subtext">
                        Each point is one AI analysis run. A rising line means the student is improving their structure between sessions.
                    </p>
                    <div className="admin-dashboard-charts-grid" style={{ marginTop: '1rem' }}>
                        {smScores.length >= 2 && (
                            <ChartCard title="Story Map Analysis Score">
                                <ResponsiveContainer width="100%" height={220}>
                                    <LineChart data={smScores}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                                        <XAxis dataKey="run" label={{ value: 'Run #', position: 'insideBottom', offset: -2 }} />
                                        <YAxis domain={[0, 100]} />
                                        <Tooltip />
                                        <Line type="monotone" dataKey="score" stroke="#7C3AED" strokeWidth={2} dot />
                                    </LineChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        )}
                        {tlScores.length >= 2 && (
                            <ChartCard title="Timeline Coherence Score">
                                <ResponsiveContainer width="100%" height={220}>
                                    <LineChart data={tlScores}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                                        <XAxis dataKey="run" label={{ value: 'Run #', position: 'insideBottom', offset: -2 }} />
                                        <YAxis domain={[0, 100]} />
                                        <Tooltip />
                                        <Line type="monotone" dataKey="score" stroke="#EC4899" strokeWidth={2} dot />
                                    </LineChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        )}
                    </div>
                </div>
            )}

            {/* Feature-specific dedicated sections */}
            {data.featureMetrics?.storyMap          && <StoryMapMetricsSection          metrics={data.featureMetrics.storyMap}          />}
            {data.featureMetrics?.mentorText         && <MentorTextMetricsSection         metrics={data.featureMetrics.mentorText}         />}
            {data.featureMetrics?.timeline           && <TimelineMetricsSection           metrics={data.featureMetrics.timeline}           />}
            {data.featureMetrics?.reflectiveChatbot  && <ReflectiveChatbotMetricsSection  metrics={data.featureMetrics.reflectiveChatbot}
                                                                                          chatSessions={data.chatSessions || {}}           />}

            {/* Generic fallback for anything else */}
            {Object.entries(data.featureMetrics || {})
                .filter(([k]) => !['storyMap', 'mentorText', 'timeline', 'reflectiveChatbot'].includes(k))
                .length > 0 && (
                <div className="admin-dashboard-feature-metrics">
                    <h3 className="admin-dashboard-chart-title">📊 Other Feature Metrics</h3>
                    <div className="admin-dashboard-feature-metrics-list">
                        {Object.entries(data.featureMetrics)
                            .filter(([k]) => !['storyMap', 'mentorText', 'timeline', 'reflectiveChatbot'].includes(k))
                            .map(([feature, metrics]) => (
                                <FeatureMetricsCard key={feature} feature={feature} metrics={metrics} />
                            ))}
                    </div>
                </div>
            )}

            {/* Recent journey */}
            <div className="admin-dashboard-journey">
                <h3 className="admin-dashboard-chart-title">🛤️ Recent Tool Journey (Last 10 Events)</h3>
                <div className="admin-dashboard-journey-list">
                    {recentJourney.map((ev, i) => (
                        <div key={i} className="admin-dashboard-journey-item">
                            <div className="admin-dashboard-journey-item-left">
                                <span className="admin-dashboard-journey-time">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                                <span className="admin-dashboard-journey-tool">{ev.tool}</span>
                                <span className="admin-dashboard-journey-action">{ev.interactionType}</span>
                            </div>
                            <span className={`admin-dashboard-journey-badge ${ev.stage}`}>{ev.stage?.replace(/_/g, ' ')}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Stage transitions */}
            {data.stageTransitions?.length > 0 && (
                <div className="admin-dashboard-transitions">
                    <h3 className="admin-dashboard-chart-title">🔄 Stage Transitions</h3>
                    <div className="admin-dashboard-transitions-list">
                        {data.stageTransitions.map((t, i) => (
                            <div key={i} className={`admin-dashboard-transition-item ${t.transitionType}`}>
                                <div className="admin-dashboard-journey-item-left">
                                    <span className="admin-dashboard-journey-time">{new Date(t.timestamp).toLocaleString()}</span>
                                    <span className="admin-dashboard-journey-tool">{t.from} → {t.to}</span>
                                    <span className="admin-dashboard-journey-action">via {t.tool}</span>
                                </div>
                                <span className={`admin-dashboard-transition-badge ${t.transitionType}`}>{t.transitionType}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Reflective Chatbot Section ────────────────────────────────────────────────
//
// DATA PATHS (written by logger.py + new ai_server endpoints):
//
//  featureMetrics/reflectiveChatbot/
//    totalSessions           — from /api/chat/log-session-start
//    bsSessions              — BS-mode session count
//    dtSessions              — DT-mode session count
//    totalMessages           — all messages (user + assistant)
//    userMessages            — user messages only
//    avgUserMessageLength    — running average character count
//    totalUserMessageChars   — cumulative chars (for avg)
//    totalModeSwitches       — from log_ui_interaction mode_switch handler
//    modeSwitches/           — { bs_to_dt: N, dt_to_bs: N }
//    focusAreas/             — { character: N, plot: N, setting: N, theme: N, conflict: N }
//    focusAreasByMode/       — nested by mode
//    totalRecursions         — backward CPS stage transitions
//    totalTimeInFeature      — cumulative page-dwell ms (from page-exit logs)
//
//  chatSessions/{sessionId}/messageLengths/  — push-list of { index, length, timestamp, stage? }
//  (passed in as chatSessions prop)
//
//  Brainstorming-specific (written by BSConversationFlowManager):
//    bsChatbot/ideas/        — push-list of ideas with { scamperTechnique, fluency, flexibility,
//                              elaboration, originality }
//    bsChatbot/stageHistory/ — per-session CPS stage transitions
//
const ReflectiveChatbotMetricsSection = ({ metrics, chatSessions }) => {
    const totalSessions    = metrics.totalSessions      || 0;
    const bsSessions       = metrics.bsSessions         || 0;
    const dtSessions       = metrics.dtSessions         || 0;
    const totalMessages    = metrics.totalMessages      || 0;
    const userMessages     = metrics.userMessages       || 0;
    const assistantMsgs    = totalMessages - userMessages;
    const avgMsgLength     = metrics.avgUserMessageLength;
    const totalSwitches    = metrics.totalModeSwitches  || 0;
    const totalRecursions  = metrics.totalRecursions    || 0;
    const totalTimeMs      = metrics.totalTimeInFeature;

    // Mode distribution pie
    const modeData = [
        { name: 'Brainstorming (CPS)', count: bsSessions },
        { name: 'Deep Thinking (Socratic)', count: dtSessions },
    ].filter(d => d.count > 0);

    // Focus area bar chart
    const focusData = Object.entries(metrics.focusAreas || {})
        .map(([name, count]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), count }))
        .sort((a, b) => b.count - a.count);

    // Mode switches breakdown
    const modeSwitchEntries = Object.entries(metrics.modeSwitches || {});

    // ── Message-length trend across all sessions ────────────────────────────
    // chatSessions is a map: { sessionId: { messageLengths: { pushKey: { index, length, timestamp, stage } } } }
    // We flatten and sort by timestamp to build a cross-session trend line.
    const allLengthEntries = [];
    Object.values(chatSessions || {}).forEach(session => {
        const msgs = session.messageLengths || {};
        Object.values(msgs).forEach(m => {
            if (m.length != null) allLengthEntries.push(m);
        });
    });
    allLengthEntries.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const messageLengthTrend = allLengthEntries.map((m, i) => ({
        msgNum: i + 1,
        length: m.length,
        stage:  m.stage || null,
    }));

    // ── Per-session message count distribution ──────────────────────────────
    const sessionMsgCounts = Object.values(chatSessions || {}).map(s => {
        const msgs = s.messageLengths || {};
        return Object.keys(msgs).length;
    }).filter(n => n > 0).sort((a, b) => a - b);
    const avgMsgsPerSession = sessionMsgCounts.length
        ? (sessionMsgCounts.reduce((a, b) => a + b, 0) / sessionMsgCounts.length).toFixed(1)
        : null;

    // ── CPS stage transition history (across sessions) ──────────────────────
    // Sourced from analytics/{userId}/stageTransitions filtered to bsChatbot
    // The parent passes data.stageTransitions — we receive what we can derive here.
    // We just count recursions from metrics.totalRecursions.

    // ── Brainstorming creativity metrics ───────────────────────────────────
    // bsChatbot ideas are stored separately under bsChatbot/ideas in Firebase.
    // The parent UserView passes featureMetrics.reflectiveChatbot; creativity
    // sub-metrics may arrive in metrics.creativityMetrics if the backend
    // aggregates them. We support both paths.
    const creativity = metrics.creativityMetrics || {};
    const avgFluency      = creativity.avgFluency;
    const avgFlexibility  = creativity.avgFlexibility;
    const avgElaboration  = creativity.avgElaboration;
    const avgOriginality  = creativity.avgOriginality;
    const totalIdeas      = creativity.totalIdeas || metrics.totalIdeas;
    const avgIdeasSession = creativity.avgIdeasPerSession || metrics.avgIdeasPerBsSession;

    // SCAMPER coverage
    const scamperCoverage = metrics.scamperCoverage || creativity.scamperCoverage || {};
    const scamperData = Object.entries(scamperCoverage)
        .map(([technique, count]) => ({ name: technique, count }))
        .sort((a, b) => b.count - a.count);

    // CPS stage distribution (how many times each stage was reached)
    const cpsStageData = Object.entries(metrics.cpsStageReach || {})
        .map(([stage, count]) => ({ name: stage, count }));

    const hasCreativity = avgFluency != null || totalIdeas != null || scamperData.length > 0;

    return (
        <div className="admin-dashboard-story-map-section" style={{ borderColor: '#8b5cf655' }}>
            <h3 className="admin-dashboard-section-title">
                <MessageSquare className="w-6 h-6" style={{ color: '#8b5cf6' }} />
                Reflective Chatbot Analytics
                <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#6b7280', marginLeft: '0.75rem' }}>
                    TLC: Joint Construction — AI as Reflective Guide
                </span>
            </h3>

            {/* ── Top-level counts ── */}
            <div className="admin-dashboard-stats-grid">
                <StatCard icon={<MessageSquare className="w-5 h-5" />} label="Total Sessions"      value={totalSessions}                      color="purple" />
                <StatCard icon={<Activity      className="w-5 h-5" />} label="Total Messages"      value={totalMessages}                      color="blue"   />
                <StatCard icon={<Repeat        className="w-5 h-5" />} label="CPS Recursions"      value={totalRecursions}                    color="pink"   />
                <StatCard icon={<Clock         className="w-5 h-5" />} label="Time on Page"        value={fmtMin(totalTimeMs)}                color="green"  />
            </div>

            {/* ── Framework validation card ── */}
            <div className="admin-dashboard-info-card admin-dashboard-validation-card" style={{ marginTop: '1.5rem' }}>
                <h3 className="admin-dashboard-info-title">
                    <TrendingUp className="w-5 h-5" style={{ color: '#8b5cf6' }} />
                    Metacognitive Deepening — Framework Validation
                </h3>
                <p className="admin-dashboard-info-subtext" style={{ marginBottom: '1rem' }}>
                    The primary signal is <strong>message length trend within a session</strong> — rising length indicates the student is elaborating more deeply over time, validating the Reflective Guide AI role. CPS recursions (backward stage transitions) indicate iterative refinement.
                </p>
                <div className="admin-dashboard-info-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">User Messages</p>
                        <p className="admin-dashboard-info-item-value" style={{ color: '#8b5cf6' }}>{userMessages}</p>
                        <p className="admin-dashboard-info-item-subtext">{pct(userMessages, totalMessages)} of total</p>
                    </div>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Assistant Messages</p>
                        <p className="admin-dashboard-info-item-value">{assistantMsgs}</p>
                        <p className="admin-dashboard-info-item-subtext">scaffolding turns</p>
                    </div>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Avg Msg Length</p>
                        <p className="admin-dashboard-info-item-value" style={{ color: '#8b5cf6' }}>
                            {avgMsgLength != null ? `${Math.round(avgMsgLength)} ch` : '—'}
                        </p>
                        <p className="admin-dashboard-info-item-subtext">user messages, all sessions</p>
                    </div>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Avg Msgs / Session</p>
                        <p className="admin-dashboard-info-item-value">{orDash(avgMsgsPerSession)}</p>
                        <p className="admin-dashboard-info-item-subtext">user messages only</p>
                    </div>
                </div>
            </div>

            {/* ── Message-length trend chart ── */}
            {messageLengthTrend.length >= 3 && (
                <div className="admin-dashboard-chart-card" style={{ marginTop: '1.5rem' }}>
                    <h3 className="admin-dashboard-chart-title">
                        User Message Length Over Time
                        <span style={{ fontSize: '12px', fontWeight: 400, color: '#6b7280', marginLeft: '0.5rem' }}>
                            — rising slope = metacognitive deepening
                        </span>
                    </h3>
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={messageLengthTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                            <XAxis dataKey="msgNum" label={{ value: 'Message #', position: 'insideBottom', offset: -2 }} />
                            <YAxis label={{ value: 'Characters', angle: -90, position: 'insideLeft', offset: 10 }} />
                            <Tooltip formatter={(v) => [`${v} chars`, 'Length']} />
                            <Area type="monotone" dataKey="length" stroke="#8b5cf6" fill="#f3e8ff" strokeWidth={2} dot={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* ── Mode distribution + focus areas ── */}
            <div className="admin-dashboard-charts-grid" style={{ marginTop: '1.5rem' }}>
                {modeData.length > 0 && (
                    <ChartCard title="Sessions by Mode">
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie data={modeData} dataKey="count" nameKey="name"
                                     cx="50%" cy="50%" outerRadius={80} label>
                                    {modeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Pie>
                                <Tooltip /><Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </ChartCard>
                )}
                {focusData.length > 0 && (
                    <ChartCard title="Focus Areas Declared at Session Start">
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={focusData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                                <XAxis type="number" stroke="#52525B" allowDecimals={false} />
                                <YAxis dataKey="name" type="category" width={90} stroke="#52525B" tick={{ fontSize: 12 }} />
                                <Tooltip />
                                <Bar dataKey="count" fill="#8b5cf6" />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                )}
            </div>

            {/* ── Session-level detail ── */}
            <div className="admin-dashboard-info-card" style={{ marginTop: '1.5rem' }}>
                <h3 className="admin-dashboard-info-title">Session Breakdown</h3>
                <div className="admin-dashboard-info-grid">
                    <InfoItem label="Brainstorming Sessions" value={bsSessions}   sub={pct(bsSessions, totalSessions) + ' of total'} />
                    <InfoItem label="Deep Thinking Sessions" value={dtSessions}   sub={pct(dtSessions, totalSessions) + ' of total'} />
                    <InfoItem label="Mode Switches"          value={totalSwitches} sub="mid-session BS↔DT changes"                   />
                </div>
                {modeSwitchEntries.length > 0 && (
                    <div className="admin-dashboard-distribution-card" style={{ marginTop: '1rem' }}>
                        <p className="admin-dashboard-distribution-title">Switch Direction Breakdown</p>
                        <div className="admin-dashboard-distribution-list">
                            {modeSwitchEntries.map(([dir, count]) => (
                                <div key={dir} className="admin-dashboard-distribution-item">
                                    <span className="admin-dashboard-distribution-item-name">{dir.replace(/_/g, ' ')}</span>
                                    <span className="admin-dashboard-distribution-item-value">{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ── CPS Stage progression ── */}
            {(cpsStageData.length > 0 || totalRecursions > 0) && (
                <div className="admin-dashboard-info-card" style={{ marginTop: '1.5rem' }}>
                    <h3 className="admin-dashboard-info-title">
                        <ArrowRight className="w-5 h-5" />
                        CPS Stage Progression (Brainstorming)
                    </h3>
                    <p className="admin-dashboard-info-subtext" style={{ marginBottom: '1rem' }}>
                        The four CPS stages are Clarify → Ideate → Develop → Implement. Backward transitions (recursions) indicate iterative refinement — a positive creativity signal.
                    </p>
                    {cpsStageData.length > 0 && (
                        <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={cpsStageData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                                <XAxis dataKey="name" stroke="#52525B" />
                                <YAxis stroke="#52525B" allowDecimals={false} />
                                <Tooltip />
                                <Bar dataKey="count" fill="#ec4899" />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                    <div className="admin-dashboard-info-grid" style={{ marginTop: '1rem' }}>
                        <InfoItem label="Total CPS Recursions" value={totalRecursions} sub="backward stage transitions" />
                        <InfoItem label="Recursion Rate"       value={bsSessions > 0 ? round1(totalRecursions / bsSessions) + ' / session' : '—'} />
                    </div>
                </div>
            )}

            {/* ── Brainstorming Creativity Metrics ── */}
            {hasCreativity && (
                <div className="admin-dashboard-story-map-section"
                     style={{ borderColor: '#f59e0b55', marginTop: '1.5rem', borderWidth: '1px' }}>
                    <h3 className="admin-dashboard-section-title" style={{ borderBottomColor: '#f59e0b33' }}>
                        <Lightbulb className="w-6 h-6" style={{ color: '#f59e0b' }} />
                        Brainstorming Creativity Metrics (CPS Mode)
                    </h3>

                    {/* Four creativity dimensions */}
                    <div className="admin-dashboard-stats-grid">
                        <StatCard icon={<Zap          className="w-5 h-5" />} label="Avg Fluency"      value={round1(avgFluency)}     color="blue"   />
                        <StatCard icon={<GitMerge     className="w-5 h-5" />} label="Avg Flexibility"  value={round1(avgFlexibility)} color="purple" />
                        <StatCard icon={<Layers       className="w-5 h-5" />} label="Avg Elaboration"  value={round1(avgElaboration)} color="green"  />
                        <StatCard icon={<Brain        className="w-5 h-5" />} label="Avg Originality"  value={round1(avgOriginality)} color="pink"   />
                    </div>

                    <div className="admin-dashboard-info-card" style={{ marginTop: '1.5rem' }}>
                        <p className="admin-dashboard-info-subtext" style={{ marginBottom: '0.75rem' }}>
                            Scores are CFM evaluations (0–10 scale): <strong>Fluency</strong> = number of ideas generated; <strong>Flexibility</strong> = variety of categories; <strong>Elaboration</strong> = depth of detail; <strong>Originality</strong> = novelty compared to session list.
                        </p>
                        <div className="admin-dashboard-info-grid">
                            <InfoItem label="Total Ideas Generated"    value={orDash(totalIdeas)}      sub="user-generated only"            />
                            <InfoItem label="Avg Ideas / BS Session"   value={round1(avgIdeasSession)} sub="fluency proxy"                  />
                            <InfoItem label="SCAMPER Techniques Used"  value={scamperData.length > 0 ? scamperData.length + ' distinct' : '—'} />
                        </div>
                    </div>

                    {/* SCAMPER technique coverage */}
                    {scamperData.length > 0 && (
                        <div style={{ marginTop: '1.5rem' }}>
                            <ChartCard title="SCAMPER Technique Coverage">
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={scamperData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                                        <XAxis dataKey="name" stroke="#52525B" tick={{ fontSize: 12 }} />
                                        <YAxis stroke="#52525B" allowDecimals={false} />
                                        <Tooltip />
                                        <Bar dataKey="count" fill="#f59e0b" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        </div>
                    )}
                </div>
            )}

            {/* ── Deep Thinking proxy metrics ── */}
            {dtSessions > 0 && (
                <div className="admin-dashboard-info-card" style={{ marginTop: '1.5rem' }}>
                    <h3 className="admin-dashboard-info-title">
                        <Brain className="w-5 h-5" style={{ color: '#3b82f6' }} />
                        Deep Thinking (Socratic) Mode
                    </h3>
                    <p className="admin-dashboard-info-subtext" style={{ marginBottom: '1rem' }}>
                        Reasoning quality in DT mode is assessed post-hoc from message-length trends. Rising message length within a session indicates the student is constructing more elaborated reasoning over time.
                    </p>
                    <div className="admin-dashboard-info-grid">
                        <InfoItem label="DT Sessions"      value={dtSessions} />
                        <InfoItem label="% of Total"       value={pct(dtSessions, totalSessions)} />
                        <InfoItem label="Time on Page"     value={fmtMin(totalTimeMs)}
                                  sub="shared across both modes" />
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Story Map Section ─────────────────────────────────────────────────────────
const StoryMapMetricsSection = ({ metrics }) => {
    const totalGenerations = metrics.totalGenerations     || 0;
    const totalAnalyses    = metrics.totalAnalyses        || 0;
    const editsAfterGen    = metrics.editsAfterGeneration || 0;
    const editsAfterAna    = metrics.editsAfterAnalysis   || 0;

    const analysisResultsList = metrics.analysisResults
        ? Object.values(metrics.analysisResults)
        : [];

    const severityTotals = analysisResultsList.reduce(
        (acc, r) => {
            acc.high   += r.issuesBySeverity?.high   || 0;
            acc.medium += r.issuesBySeverity?.medium || 0;
            acc.low    += r.issuesBySeverity?.low    || 0;
            return acc;
        },
        { high: 0, medium: 0, low: 0 }
    );
    const issuesBySeverityData = [
        { name: 'High',   count: severityTotals.high,   fill: '#EF4444' },
        { name: 'Medium', count: severityTotals.medium, fill: '#F59E0B' },
        { name: 'Low',    count: severityTotals.low,    fill: '#10B981' },
    ].filter(d => d.count > 0);

    const scoreTrend = analysisResultsList
        .filter(r => r.overallScore != null)
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        .map((r, i) => ({ run: i + 1, score: r.overallScore }));

    const triggersList = metrics.generationTriggers ? Object.values(metrics.generationTriggers) : [];
    const avgNodes = triggersList.length
        ? (triggersList.reduce((s, t) => s + (t.nodesExtracted || 0), 0) / triggersList.length).toFixed(1)
        : null;
    const avgWords = triggersList.length
        ? (triggersList.reduce((s, t) => s + (t.wordCount      || 0), 0) / triggersList.length).toFixed(0)
        : null;
    const avgGenMs = triggersList.length
        ? triggersList.reduce((s, t) => s + (t.processingTimeMs || 0), 0) / triggersList.length
        : null;

    return (
        <div className="admin-dashboard-story-map-section">
            <h3 className="admin-dashboard-section-title">
                <Map className="w-6 h-6" /> Story Map Analytics
            </h3>

            <div className="admin-dashboard-stats-grid">
                <StatCard icon={<Zap         className="w-5 h-5" />} label="AI Generations"     value={totalGenerations}                         color="blue"   />
                <StatCard icon={<Activity    className="w-5 h-5" />} label="Analyses Run"       value={totalAnalyses}                            color="purple" />
                <StatCard icon={<CheckCircle className="w-5 h-5" />} label="Edits After Gen."   value={`${editsAfterGen} / ${totalGenerations}`} color="green"  />
                <StatCard icon={<CheckCircle className="w-5 h-5" />} label="Edits After Anal."  value={`${editsAfterAna} / ${totalAnalyses}`}    color="pink"   />
            </div>

            <div className="admin-dashboard-info-card admin-dashboard-validation-card" style={{ marginTop: '1.5rem' }}>
                <h3 className="admin-dashboard-info-title">
                    <CheckCircle className="w-5 h-5" style={{ color: '#7C3AED' }} />
                    AI Engagement — Framework Validation
                </h3>
                <p className="admin-dashboard-info-subtext" style={{ marginBottom: '1rem' }}>
                    Were manual edits made within 10 minutes of AI output? These flags directly validate the Modelling and Joint Construction stage claims.
                </p>
                <div className="admin-dashboard-info-grid">
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Edits After Generation</p>
                        <p className="admin-dashboard-info-item-value" style={{ color: '#7C3AED' }}>{editsAfterGen}</p>
                        <p className="admin-dashboard-info-item-subtext">{pct(editsAfterGen, totalGenerations)} of generation sessions</p>
                    </div>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Edits After Analysis</p>
                        <p className="admin-dashboard-info-item-value" style={{ color: '#EC4899' }}>{editsAfterAna}</p>
                        <p className="admin-dashboard-info-item-subtext">{pct(editsAfterAna, totalAnalyses)} of analysis sessions</p>
                    </div>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Total Time on Page</p>
                        <p className="admin-dashboard-info-item-value">{fmtMin(metrics.totalTimeInFeature)}</p>
                        <p className="admin-dashboard-info-item-subtext">cumulative dwell time</p>
                    </div>
                </div>
                {metrics.lastEditAfterGenerationTimestamp && (
                    <p className="admin-dashboard-info-subtext" style={{ marginTop: '0.75rem' }}>
                        Last edit-after-generation: <strong>{new Date(metrics.lastEditAfterGenerationTimestamp).toLocaleString()}</strong>
                    </p>
                )}
                {metrics.lastEditAfterAnalysisTimestamp && (
                    <p className="admin-dashboard-info-subtext">
                        Last edit-after-analysis: <strong>{new Date(metrics.lastEditAfterAnalysisTimestamp).toLocaleString()}</strong>
                    </p>
                )}
            </div>

            {(issuesBySeverityData.length > 0 || scoreTrend.length >= 2) && (
                <div className="admin-dashboard-charts-grid" style={{ marginTop: '1.5rem' }}>
                    {issuesBySeverityData.length > 0 && (
                        <ChartCard title="Cumulative Issues by Severity">
                            <ResponsiveContainer width="100%" height={250}>
                                <PieChart>
                                    <Pie data={issuesBySeverityData} dataKey="count" nameKey="name"
                                         cx="50%" cy="50%" outerRadius={80} label>
                                        {issuesBySeverityData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                                    </Pie>
                                    <Tooltip /><Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    )}
                    {scoreTrend.length >= 2 && (
                        <ChartCard title="Analysis Score Trend">
                            <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={scoreTrend}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                                    <XAxis dataKey="run" label={{ value: 'Run #', position: 'insideBottom', offset: -2 }} />
                                    <YAxis domain={[0, 100]} />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="score" stroke="#7C3AED" strokeWidth={2} dot />
                                </LineChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    )}
                </div>
            )}

            {triggersList.length > 0 && (
                <div className="admin-dashboard-info-card" style={{ marginTop: '1.5rem' }}>
                    <h3 className="admin-dashboard-info-title">
                        <Zap className="w-5 h-5" /> Generation Details
                    </h3>
                    <div className="admin-dashboard-info-grid">
                        <InfoItem label="Avg Nodes Extracted"  value={orDash(avgNodes)} />
                        <InfoItem label="Avg Input Word Count" value={orDash(avgWords)} />
                        <InfoItem label="Avg Processing Time"  value={fmtSec(avgGenMs)} />
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Timeline Section ──────────────────────────────────────────────────────────
const TimelineMetricsSection = ({ metrics }) => {
    const totalCreated  = metrics.totalEventsCreated  || 0;
    const majorEvents   = metrics.majorEventsCreated  || 0;
    const minorEvents   = metrics.minorEventsCreated  || 0;
    const totalEdits    = metrics.totalManualEdits    || 0;
    const totalReorders = metrics.totalReorders       || 0;
    const totalDeleted  = metrics.totalEventsDeleted  || 0;
    const totalChecks   = metrics.totalCoherenceChecks || 0;
    const netEvents     = totalCreated - totalDeleted;

    const stageDistData = Object.entries(metrics.stageDistribution || {})
        .map(([stage, count]) => ({ name: stage, count }));

    const checksList = metrics.coherenceChecks
        ? Object.values(metrics.coherenceChecks).sort((a, b) => (a.checkNumber || 0) - (b.checkNumber || 0))
        : [];

    const scoreTrend = checksList
        .filter(c => c.overallScore != null)
        .map(c => ({ run: c.checkNumber, score: c.overallScore }));

    const firstScore = metrics.firstCoherenceScore;
    const lastScore  = metrics.lastCoherenceScore;
    const scoreImprovement = (firstScore != null && lastScore != null && totalChecks >= 2)
        ? (lastScore - firstScore).toFixed(1)
        : null;

    return (
        <div className="admin-dashboard-story-map-section" style={{ borderColor: '#3b82f655' }}>
            <h3 className="admin-dashboard-section-title">
                <Calendar className="w-6 h-6" /> Timeline Analytics
                <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#6b7280', marginLeft: '0.75rem' }}>
                    TLC: Joint Construction — AI as Reflective Guide
                </span>
            </h3>

            <div className="admin-dashboard-stats-grid">
                <StatCard icon={<Activity    className="w-5 h-5" />} label="Events Created"   value={totalCreated} color="blue"   />
                <StatCard icon={<CheckCircle className="w-5 h-5" />} label="Net Events"       value={netEvents}    color="green"  />
                <StatCard icon={<Layers      className="w-5 h-5" />} label="Manual Edits"     value={totalEdits}   color="purple" />
                <StatCard icon={<RefreshCw   className="w-5 h-5" />} label="Coherence Checks" value={totalChecks}  color="pink"   />
            </div>

            <div className="admin-dashboard-info-card admin-dashboard-validation-card" style={{ marginTop: '1.5rem' }}>
                <h3 className="admin-dashboard-info-title">
                    <TrendingUp className="w-5 h-5" style={{ color: '#3B82F6' }} />
                    Scaffolded Planning — Framework Validation
                </h3>
                <p className="admin-dashboard-info-subtext" style={{ marginBottom: '1rem' }}>
                    Longitudinal coherence scores show whether the AI's reflective prompts improved structural quality over time.
                </p>
                <div className="admin-dashboard-info-grid">
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">First Coherence Score</p>
                        <p className="admin-dashboard-info-item-value">{firstScore != null ? firstScore : '—'}</p>
                        <p className="admin-dashboard-info-item-subtext">/ 10</p>
                    </div>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Latest Coherence Score</p>
                        <p className="admin-dashboard-info-item-value" style={{ color: '#3B82F6' }}>
                            {lastScore != null ? lastScore : '—'}
                        </p>
                        <p className="admin-dashboard-info-item-subtext">/ 10</p>
                    </div>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Score Improvement</p>
                        <p className="admin-dashboard-info-item-value" style={{
                            color: scoreImprovement > 0 ? '#16A34A' : scoreImprovement < 0 ? '#DC2626' : '#52525B'
                        }}>
                            {scoreImprovement != null ? (scoreImprovement > 0 ? `+${scoreImprovement}` : scoreImprovement) : '—'}
                        </p>
                        <p className="admin-dashboard-info-item-subtext">first → last check</p>
                    </div>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Total Time on Page</p>
                        <p className="admin-dashboard-info-item-value">{fmtMin(metrics.totalTimeMs)}</p>
                        <p className="admin-dashboard-info-item-subtext">cumulative</p>
                    </div>
                </div>
            </div>

            <div className="admin-dashboard-info-card" style={{ marginTop: '1.5rem' }}>
                <h3 className="admin-dashboard-info-title">Event Composition</h3>
                <div className="admin-dashboard-info-grid">
                    <InfoItem label="Major Events"  value={majorEvents}   sub={pct(majorEvents, totalCreated) + ' of total'} />
                    <InfoItem label="Minor Events"  value={minorEvents}   sub={pct(minorEvents, totalCreated) + ' of total'} />
                    <InfoItem label="Reorders"      value={totalReorders} sub="drag-and-drop moves" />
                    <InfoItem label="Deletions"     value={totalDeleted}  sub="events removed" />
                    <InfoItem label="Mode Used"     value={metrics.lastModeUsed || '—'} />
                </div>
            </div>

            {(stageDistData.length > 0 || scoreTrend.length >= 2) && (
                <div className="admin-dashboard-charts-grid" style={{ marginTop: '1.5rem' }}>
                    {stageDistData.length > 0 && (
                        <ChartCard title="Events per Narrative Stage">
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={stageDistData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                                    <XAxis dataKey="name" stroke="#52525B" tick={{ fontSize: 11 }} />
                                    <YAxis stroke="#52525B" allowDecimals={false} />
                                    <Tooltip />
                                    <Bar dataKey="count" fill="#3B82F6" />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    )}
                    {scoreTrend.length >= 2 && (
                        <ChartCard title="Coherence Score Trend">
                            <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={scoreTrend}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                                    <XAxis dataKey="run" label={{ value: 'Check #', position: 'insideBottom', offset: -2 }} />
                                    <YAxis domain={[0, 10]} />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="score" stroke="#3B82F6" strokeWidth={2} dot />
                                </LineChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    )}
                </div>
            )}

            {checksList.length > 0 && (
                <div className="admin-dashboard-info-card" style={{ marginTop: '1.5rem' }}>
                    <h3 className="admin-dashboard-info-title">Coherence Check History</h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border-light)', textAlign: 'left' }}>
                                    <th style={{ padding: '8px 12px', color: '#6b7280' }}>#</th>
                                    <th style={{ padding: '8px 12px', color: '#6b7280' }}>Score</th>
                                    <th style={{ padding: '8px 12px', color: '#6b7280' }}>Change</th>
                                    <th style={{ padding: '8px 12px', color: '#6b7280' }}>Events</th>
                                    <th style={{ padding: '8px 12px', color: '#6b7280' }}>Issues (H/M/L)</th>
                                    <th style={{ padding: '8px 12px', color: '#6b7280' }}>Genre</th>
                                </tr>
                            </thead>
                            <tbody>
                                {checksList.map((c, i) => {
                                    const change = c.scoreChange;
                                    return (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                            <td style={{ padding: '8px 12px' }}>{c.checkNumber}</td>
                                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>{c.overallScore ?? '—'}</td>
                                            <td style={{ padding: '8px 12px', color: change > 0 ? '#16A34A' : change < 0 ? '#DC2626' : '#6b7280' }}>
                                                {change != null ? (change > 0 ? `+${change}` : change) : '—'}
                                            </td>
                                            <td style={{ padding: '8px 12px' }}>{c.eventCount ?? '—'}</td>
                                            <td style={{ padding: '8px 12px' }}>
                                                <span style={{ color: '#EF4444' }}>{c.issuesBySeverity?.high ?? 0}</span>
                                                {' / '}
                                                <span style={{ color: '#F59E0B' }}>{c.issuesBySeverity?.medium ?? 0}</span>
                                                {' / '}
                                                <span style={{ color: '#10B981' }}>{c.issuesBySeverity?.low ?? 0}</span>
                                            </td>
                                            <td style={{ padding: '8px 12px', color: '#6b7280' }}>{c.genreUsed || '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Mentor Text Section ───────────────────────────────────────────────────────
const MentorTextMetricsSection = ({ metrics }) => {
    const totalAnalyses  = metrics.totalAnalyses      || 0;
    const totalViews     = metrics.totalAnalysisViews || 0;
    const totalDeletions = metrics.totalDeletions     || 0;
    const totalSearches  = metrics.totalSearches      || 0;

    const retentionRate = metrics.retentionRate != null
        ? metrics.retentionRate
        : (totalAnalyses > 0 ? (((totalAnalyses - totalDeletions) / totalAnalyses) * 100).toFixed(1) : null);

    const viewRatio = totalAnalyses > 0 ? (totalViews / totalAnalyses).toFixed(1) : '—';

    const focusData  = Object.entries(metrics.analysesByFocus || {}).map(([name, count]) => ({ name: name.replace(/_/g, ' '), count }));
    const genreData  = Object.entries(metrics.analysesByGenre || {}).map(([name, count]) => ({ name, count }));

    const dailyData  = Object.entries(metrics.dailyAnalyses || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date: date.slice(5), count }));

    const filterEntries   = Object.entries(metrics.filterUsage || {});
    const totalFilterUses = filterEntries.reduce((s, [, v]) => s + v, 0);

    return (
        <div className="admin-dashboard-story-map-section" style={{ borderColor: '#f59e0b55' }}>
            <h3 className="admin-dashboard-section-title">
                <BookOpen className="w-6 h-6" /> Mentor Text Analytics
            </h3>

            <div className="admin-dashboard-stats-grid">
                <StatCard icon={<FileText    className="w-5 h-5" />} label="Analyses Created"    value={totalAnalyses}                                          color="purple" />
                <StatCard icon={<Eye         className="w-5 h-5" />} label="Total Reviews"       value={totalViews}                                             color="blue"   />
                <StatCard icon={<CheckCircle className="w-5 h-5" />} label="Retention Rate"      value={retentionRate != null ? `${retentionRate}%` : '—'}      color="green"  />
                <StatCard icon={<Activity    className="w-5 h-5" />} label="Reviews / Analysis"  value={viewRatio}                                              color="pink"   />
            </div>

            <div className="admin-dashboard-info-card admin-dashboard-validation-card" style={{ marginTop: '1.5rem' }}>
                <h3 className="admin-dashboard-info-title">
                    <Eye className="w-5 h-5" style={{ color: '#F59E0B' }} />
                    Review Engagement — AI as Deconstructor
                </h3>
                <p className="admin-dashboard-info-subtext" style={{ marginBottom: '1rem' }}>
                    Did students actually read the analyses? Duration and return-visit count validate the Modelling stage claim.
                </p>
                <div className="admin-dashboard-info-grid">
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Avg Review Duration</p>
                        <p className="admin-dashboard-info-item-value">{fmtSec(metrics.avgReviewTimeMs)}</p>
                        <p className="admin-dashboard-info-item-subtext">per view of an analysis</p>
                    </div>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Total Review Time</p>
                        <p className="admin-dashboard-info-item-value">{fmtMin(metrics.totalReviewTimeMs)}</p>
                        <p className="admin-dashboard-info-item-subtext">all views combined</p>
                    </div>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Total Time on Page</p>
                        <p className="admin-dashboard-info-item-value">{fmtMin(metrics.totalTimeInFeature)}</p>
                        <p className="admin-dashboard-info-item-subtext">cumulative dwell time</p>
                    </div>
                </div>

                {(metrics.firstAnalysisTimestamp || metrics.lastAnalysisTimestamp) && (
                    <div className="admin-dashboard-info-grid" style={{ marginTop: '1rem', gridTemplateColumns: 'repeat(2,1fr)' }}>
                        {metrics.firstAnalysisTimestamp && (
                            <InfoItem label="First Analysis"
                                value={new Date(metrics.firstAnalysisTimestamp).toLocaleDateString()}
                                sub={new Date(metrics.firstAnalysisTimestamp).toLocaleTimeString()} />
                        )}
                        {metrics.lastAnalysisTimestamp && (
                            <InfoItem label="Most Recent Analysis"
                                value={new Date(metrics.lastAnalysisTimestamp).toLocaleDateString()}
                                sub={new Date(metrics.lastAnalysisTimestamp).toLocaleTimeString()} />
                        )}
                    </div>
                )}
            </div>

            {totalDeletions > 0 && (
                <div className="admin-dashboard-info-card" style={{ marginTop: '1.5rem' }}>
                    <h3 className="admin-dashboard-info-title">
                        <AlertCircle className="w-5 h-5" /> Deletion Behaviour
                    </h3>
                    <div className="admin-dashboard-info-grid">
                        <InfoItem label="Total Deletions"       value={totalDeletions}                      />
                        <InfoItem label="Deleted After Viewing" value={metrics.deletionsAfterViewing || 0}
                                  sub="Reviewed, then removed" />
                        <InfoItem label="Deleted Immediately"   value={metrics.immediateDeletions    || 0}
                                  sub="Never reviewed" />
                    </div>
                </div>
            )}

            {(focusData.length > 0 || genreData.length > 0) && (
                <div className="admin-dashboard-charts-grid" style={{ marginTop: '1.5rem' }}>
                    {focusData.length > 0 && (
                        <ChartCard title="Focus Areas Selected">
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={focusData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                                    <XAxis type="number" stroke="#52525B" />
                                    <YAxis dataKey="name" type="category" width={120} stroke="#52525B" tick={{ fontSize: 12 }} />
                                    <Tooltip />
                                    <Bar dataKey="count" fill="#F59E0B" />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    )}
                    {genreData.length > 0 && (
                        <ChartCard title="Genres Analysed">
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={genreData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                                    <XAxis type="number" stroke="#52525B" />
                                    <YAxis dataKey="name" type="category" width={120} stroke="#52525B" tick={{ fontSize: 12 }} />
                                    <Tooltip />
                                    <Bar dataKey="count" fill="#8B5CF6" />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    )}
                </div>
            )}

            {dailyData.length > 1 && (
                <div className="admin-dashboard-chart-card" style={{ marginTop: '1.5rem' }}>
                    <h3 className="admin-dashboard-chart-title">Daily Analyses</h3>
                    <ResponsiveContainer width="100%" height={160}>
                        <AreaChart data={dailyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                            <XAxis dataKey="date" stroke="#52525B" tick={{ fontSize: 11 }} />
                            <YAxis stroke="#52525B" allowDecimals={false} />
                            <Tooltip />
                            <Area type="monotone" dataKey="count" stroke="#F59E0B" fill="#FEF3C7" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            <div className="admin-dashboard-stats-row" style={{ marginTop: '1.5rem' }}>
                <div className="admin-dashboard-stat-box blue">
                    <p className="admin-dashboard-stat-box-label">Avg Teaching Points</p>
                    <p className="admin-dashboard-stat-box-value">{orDash(metrics.teachingPointsStats?.average?.toFixed(1))}</p>
                </div>
                <div className="admin-dashboard-stat-box green">
                    <p className="admin-dashboard-stat-box-label">Avg Excerpt Length</p>
                    <p className="admin-dashboard-stat-box-value">
                        {orDash(metrics.excerptLengthStats?.average?.toFixed(0))}{metrics.excerptLengthStats?.average != null ? ' ch' : ''}
                    </p>
                </div>
                <div className="admin-dashboard-stat-box purple">
                    <p className="admin-dashboard-stat-box-label">Avg AI Processing</p>
                    <p className="admin-dashboard-stat-box-value">{fmtSec(metrics.processingTimeStats?.average)}</p>
                </div>
            </div>

            {metrics.qualityDistribution && (
                <div className="admin-dashboard-quality" style={{ marginTop: '1.5rem' }}>
                    <p className="admin-dashboard-quality-title">Quality Distribution</p>
                    <div className="admin-dashboard-quality-list">
                        {Object.entries(metrics.qualityDistribution).map(([q, count]) => (
                            <div key={q} className="admin-dashboard-quality-item">
                                <span className={`admin-dashboard-quality-dot ${q}`}></span>
                                <span className="admin-dashboard-quality-name">{q}</span>
                                <span className="admin-dashboard-quality-count">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="admin-dashboard-engagement-row" style={{ marginTop: '1.5rem' }}>
                <MetricBox label="Library Searches" value={totalSearches}   icon="🔍" />
                <MetricBox label="Filter Uses"       value={totalFilterUses} icon="🎛️" />
            </div>

            {filterEntries.length > 0 && (
                <div className="admin-dashboard-distribution-card" style={{ marginTop: '1rem' }}>
                    <p className="admin-dashboard-distribution-title">Filter Type Breakdown</p>
                    <div className="admin-dashboard-distribution-list">
                        {filterEntries.map(([filterType, count]) => (
                            <div key={filterType} className="admin-dashboard-distribution-item">
                                <span className="admin-dashboard-distribution-item-name">{filterType.replace(/_/g, ' ')}</span>
                                <span className="admin-dashboard-distribution-item-value">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Generic fallback ──────────────────────────────────────────────────────────
const FeatureMetricsCard = ({ feature, metrics }) => {
    const names = {
        bookRecs:            'Book Recommendations',
        bookRecommendations: 'Book Recommendations',
        feedback:            'Feedback Assistant',
        bsChatbot:           'Brainstorming Chat',
        dtChatbot:           'Deep Thinking Chat',
    };
    return (
        <div className="admin-dashboard-feature-card">
            <h4 className="admin-dashboard-feature-card-title">{names[feature] || feature}</h4>
            <pre style={{
                maxHeight: '256px', overflow: 'auto',
                backgroundColor: 'var(--border-light)',
                padding: '0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '11px'
            }}>
                {JSON.stringify(metrics, null, 2)}
            </pre>
        </div>
    );
};

// ─── Reusable primitives ───────────────────────────────────────────────────────
const StatCard = ({ icon, label, value, color }) => (
    <div className="admin-dashboard-stat-card">
        <div className={`admin-dashboard-stat-icon ${color}`}>{icon}</div>
        <p className="admin-dashboard-stat-label">{label}</p>
        <p className="admin-dashboard-stat-value">{value}</p>
    </div>
);

const ChartCard = ({ title, children }) => (
    <div className="admin-dashboard-chart-card">
        <h3 className="admin-dashboard-chart-title">{title}</h3>
        {children}
    </div>
);

const InfoItem = ({ label, value, sub, color }) => (
    <div className="admin-dashboard-info-item">
        <p className="admin-dashboard-info-item-label">{label}</p>
        <p className="admin-dashboard-info-item-value" style={color ? { color } : {}}>{value}</p>
        {sub && <p className="admin-dashboard-info-item-subtext">{sub}</p>}
    </div>
);

const MetricBox = ({ label, value, icon }) => (
    <div className="admin-dashboard-metric-box">
        {icon && <span className="admin-dashboard-metric-icon">{icon}</span>}
        <div className="admin-dashboard-metric-content">
            <p className="admin-dashboard-metric-label">{label}</p>
            <p className="admin-dashboard-metric-value">{value}</p>
        </div>
    </div>
);

export default AdminDashboard;