import React, { useState, useEffect } from 'react';
import { 
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    AreaChart, Area
} from 'recharts';
import { 
    Users, Activity, Clock, TrendingUp, Download,
    RefreshCw, Eye, Map, BookOpen, FileText, Zap, CheckCircle,
    AlertCircle, GitMerge, Layers
} from 'lucide-react';
import './admin-dashboard.css';

const API_BASE = process.env.REACT_APP_AI_SERVER_URL || "http://localhost:5000";
const COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];

// ─── Formatting helpers ────────────────────────────────────────────────────────
const fmtSec = (ms)   => ms != null ? `${(ms / 1000).toFixed(1)}s`         : '—';
const fmtMin = (ms)   => ms != null ? `${Math.round(ms / 60000)}m`          : '—';
const pct    = (n, d) => (d && d > 0) ? `${((n / d) * 100).toFixed(0)}%`   : '—';
const orDash = (v)    => (v != null && v !== '') ? v                         : '—';

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

    // ── Longitudinal scores ──────────────────────────────────────────────────
    // outcomeMetrics/storyMapAnalysisScores  — written by analyze_story_map (NEW this session)
    // outcomeMetrics/timelineCoherenceScores — existing
    const smScores = (data.outcomeMetrics?.storyMapAnalysisScores  || []).map((s, i) => ({ run: i + 1, score: s }));
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

            {/* Longitudinal score improvement — only shown when ≥2 data points */}
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
            {data.featureMetrics?.storyMap  && <StoryMapMetricsSection  metrics={data.featureMetrics.storyMap}  />}
            {data.featureMetrics?.mentorText && <MentorTextMetricsSection metrics={data.featureMetrics.mentorText} />}

            {/* All other features — generic fallback */}
            {Object.entries(data.featureMetrics || {})
                .filter(([k]) => k !== 'storyMap' && k !== 'mentorText')
                .length > 0 && (
                <div className="admin-dashboard-feature-metrics">
                    <h3 className="admin-dashboard-chart-title">📊 Other Feature Metrics</h3>
                    <div className="admin-dashboard-feature-metrics-list">
                        {Object.entries(data.featureMetrics)
                            .filter(([k]) => k !== 'storyMap' && k !== 'mentorText')
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
                            <span className="admin-dashboard-journey-badge">{ev.stage}</span>
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

// ─── Story Map Section ─────────────────────────────────────────────────────────
//
// Displays ONLY fields that are verified to be written by the backend.
//
// WRITTEN — shown here:
//   featureMetrics/storyMap/totalGenerations       logger.py log_story_map_generation()
//   featureMetrics/storyMap/generationTriggers/    logger.py log_story_map_generation()
//   featureMetrics/storyMap/totalAnalyses          logger.py log_story_map_analysis() + new ai_server block
//   featureMetrics/storyMap/analysisResults/       logger.py log_story_map_analysis()
//     └─ each entry: overallScore, issuesBySeverity{high,medium,low}, genreInferred, timestamp
//   featureMetrics/storyMap/totalTimeInFeature     ai_server.py log-page-exit endpoint
//   featureMetrics/storyMap/editsAfterGeneration   ai_server.py log-ui-interaction (NEW)
//   featureMetrics/storyMap/editsAfterAnalysis     ai_server.py log-ui-interaction (NEW)
//   featureMetrics/storyMap/lastEditAfterGenerationTimestamp (NEW)
//   featureMetrics/storyMap/lastEditAfterAnalysisTimestamp  (NEW)
//   outcomeMetrics/storyMapAnalysisScores          ai_server.py analyze_story_map (NEW)
//
// NOT WRITTEN — removed from display vs. old dashboard:
//   totalGraphRenders, nodeActions, linkActions, totalMerges, mergeStats,
//   graphSizeStats (top-level), issuesByCategory (top-level),
//   analysisPanelInteractions, avgTimeInAnalysisPanel, mergeCompletionRate,
//   contentCreationRatio, issueInteractions, iterationStats
//
const StoryMapMetricsSection = ({ metrics }) => {
    const totalGenerations = metrics.totalGenerations     || 0;
    const totalAnalyses    = metrics.totalAnalyses        || 0;
    const editsAfterGen    = metrics.editsAfterGeneration || 0;
    const editsAfterAna    = metrics.editsAfterAnalysis   || 0;

    // analysisResults is a Firebase push-list (object with random keys).
    // Each entry: { overallScore, issuesBySeverity: { high, medium, low }, genreInferred, timestamp }
    const analysisResultsList = metrics.analysisResults
        ? Object.values(metrics.analysisResults)
        : [];

    // Cumulative severity totals across all analysis runs
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

    // Score trend from analysisResults (sorted by timestamp)
    const scoreTrend = analysisResultsList
        .filter(r => r.overallScore != null)
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        .map((r, i) => ({ run: i + 1, score: r.overallScore }));

    // Generation stats from generationTriggers push-list
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

            {/* Summary counts */}
            <div className="admin-dashboard-stats-grid">
                <StatCard icon={<Zap         className="w-5 h-5" />} label="AI Generations"     value={totalGenerations}                         color="blue"   />
                <StatCard icon={<Activity    className="w-5 h-5" />} label="Analyses Run"       value={totalAnalyses}                            color="purple" />
                <StatCard icon={<CheckCircle className="w-5 h-5" />} label="Edits After Gen."   value={`${editsAfterGen} / ${totalGenerations}`} color="green"  />
                <StatCard icon={<CheckCircle className="w-5 h-5" />} label="Edits After Anal."  value={`${editsAfterAna} / ${totalAnalyses}`}    color="pink"   />
            </div>

            {/* Framework validation: the two new editedAfter flags */}
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

            {/* Issue severity + score trend */}
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

            {/* Generation stats derived from generationTriggers push-list */}
            {triggersList.length > 0 && (
                <div className="admin-dashboard-info-card" style={{ marginTop: '1.5rem' }}>
                    <h3 className="admin-dashboard-info-title">
                        <Zap className="w-5 h-5" /> Generation Details
                    </h3>
                    <div className="admin-dashboard-info-grid">
                        <InfoItem label="Avg Nodes Extracted" value={orDash(avgNodes)} />
                        <InfoItem label="Avg Input Word Count" value={orDash(avgWords)} />
                        <InfoItem label="Avg Processing Time"  value={fmtSec(avgGenMs)} />
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Mentor Text Section ───────────────────────────────────────────────────────
//
// WRITTEN — shown here:
//   featureMetrics/mentorText/totalAnalyses              log_mentor_text_analysis()
//   featureMetrics/mentorText/analysesByFocus/           log_mentor_text_analysis()
//   featureMetrics/mentorText/analysesByGenre/           log_mentor_text_analysis()
//   featureMetrics/mentorText/qualityDistribution/       log_mentor_text_analysis()
//   featureMetrics/mentorText/teachingPointsStats        log_mentor_text_analysis()
//   featureMetrics/mentorText/excerptLengthStats         log_mentor_text_analysis()
//   featureMetrics/mentorText/processingTimeStats        log_mentor_text_analysis()
//   featureMetrics/mentorText/firstAnalysisTimestamp     log_mentor_text_analysis()
//   featureMetrics/mentorText/lastAnalysisTimestamp      log_mentor_text_analysis()
//   featureMetrics/mentorText/dailyAnalyses/             log_mentor_text_analysis()
//   featureMetrics/mentorText/totalAnalysisViews         log_mentor_text_view() + new view_analysis_complete
//   featureMetrics/mentorText/totalReviewTimeMs          new view_analysis_complete handler
//   featureMetrics/mentorText/avgReviewTimeMs            new view_analysis_complete handler
//   featureMetrics/mentorText/totalDeletions             log_mentor_text_deletion()
//   featureMetrics/mentorText/deletionsAfterViewing      log_mentor_text_deletion()
//   featureMetrics/mentorText/immediateDeletions         log_mentor_text_deletion()
//   featureMetrics/mentorText/retentionRate              log_mentor_text_deletion()
//   featureMetrics/mentorText/totalSearches              ai_server.py log-ui-interaction
//   featureMetrics/mentorText/filterUsage/              ai_server.py log-ui-interaction
//   featureMetrics/mentorText/totalTimeInFeature         log-page-exit endpoint
//
// REMOVED vs. old dashboard (never written):
//   searchSuccessRate, totalFilterUses (now derived from filterUsage map)
//
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

    // dailyAnalyses is a map of "YYYY-MM-DD" → count
    const dailyData  = Object.entries(metrics.dailyAnalyses || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date: date.slice(5), count })); // strip year → MM-DD

    // totalFilterUses is derived — filterUsage is a map of filterType → count
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

            {/* Review engagement — NEW fields from AnalysisDetailModal tracking */}
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

                {/* First / last usage */}
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

            {/* Deletion behaviour */}
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

            {/* Focus areas + genres */}
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

            {/* Daily usage sparkline */}
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

            {/* AI quality stats */}
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

            {/* Quality distribution */}
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

            {/* Search + filter */}
            <div className="admin-dashboard-engagement-row" style={{ marginTop: '1.5rem' }}>
                <MetricBox label="Library Searches" value={totalSearches}  icon="🔍" />
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

// ─── Generic fallback for other features ──────────────────────────────────────
const FeatureMetricsCard = ({ feature, metrics }) => {
    const names = {
        timeline:           'Timeline',
        bookRecs:           'Book Recommendations',
        bookRecommendations:'Book Recommendations',
        feedback:           'Feedback Assistant',
        bsChatbot:          'Brainstorming Chat',
        dtChatbot:          'Deep Thinking Chat',
        reflectiveChatbot:  'Reflective Chatbot',
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