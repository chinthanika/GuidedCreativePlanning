import React, { useState, useEffect } from 'react';
import { 
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    AreaChart, Area, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { 
    Users, Activity, Clock, TrendingUp, Download,
    RefreshCw, Search, Filter, Eye, Trash2, MessageSquare,
    Map, BookOpen, Calendar, FileText, Zap, CheckCircle,
    AlertCircle, XCircle, Layers, GitMerge
} from 'lucide-react';
import './admin-dashboard.css';

const API_BASE = process.env.REACT_APP_AI_SERVER_URL || "http://localhost:5000";

// Color palette
const COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];

const AdminDashboard = () => {
    const [selectedUserId, setSelectedUserId] = useState('');
    const [allUsers, setAllUsers] = useState([]);
    const [userData, setUserData] = useState(null);
    const [studySummary, setStudySummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [viewMode, setViewMode] = useState('overview'); // 'overview' | 'user'

    // Load list of users on mount
    useEffect(() => {
        loadAllUsers();
    }, []);

    const loadAllUsers = async () => {
        try {
            const response = await fetch(`${API_BASE}/admin/analytics/users-list`, {
                method: 'GET'
            });

            if (response.ok) {
                const data = await response.json();
                setAllUsers(data.users || []);
            }
        } catch (err) {
            console.error('Failed to load users:', err);
        }
    };

    const loadStudySummary = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${API_BASE}/admin/analytics/study-summary`, {
                method: 'GET'
            });

            if (response.ok) {
                const data = await response.json();
                setStudySummary(data);
            } else {
                throw new Error('Failed to load study summary');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const loadUserAnalytics = async (userId) => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${API_BASE}/admin/analytics/user/${userId}`, {
                method: 'GET'
            });

            if (response.ok) {
                const data = await response.json();
                setUserData(data);
                setViewMode('user');
            } else {
                throw new Error('Failed to load user analytics');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleExportCSV = async () => {
        try {
            const response = await fetch(`${API_BASE}/admin/analytics/export-csv`, {
                method: 'GET'
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `study_analytics_${Date.now()}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }
        } catch (err) {
            console.error('Export failed:', err);
            setError('Failed to export CSV');
        }
    };

    // Overview Mode
    useEffect(() => {
        if (viewMode === 'overview') {
            loadStudySummary();
        }
    }, [viewMode]);

    if (loading) {
        return (
            <div className="admin-dashboard-loading">
                <div className="admin-dashboard-loading-spinner">
                    <RefreshCw className="w-16 h-16" />
                </div>
                <p className="admin-dashboard-loading-text">Loading analytics...</p>
            </div>
        );
    }

    return (
        <div className="admin-dashboard">
            {/* Header */}
            <div className="admin-dashboard-header">
                <div className="admin-dashboard-title-section">
                    <div>
                        <h1 className="admin-dashboard-title">
                            📊 Study Analytics Dashboard
                        </h1>
                        <p className="admin-dashboard-subtitle">
                            Comprehensive metrics for the TLC Framework study
                        </p>
                    </div>

                    <div className="admin-dashboard-button-group">
                        <button
                            onClick={() => setViewMode('overview')}
                            className={`admin-dashboard-button ${
                                viewMode === 'overview' ? 'admin-dashboard-button-primary' : ''
                            }`}
                        >
                            <Users className="w-4 h-4" />
                            Overview
                        </button>

                        <button
                            onClick={handleExportCSV}
                            className="admin-dashboard-button"
                        >
                            <Download className="w-4 h-4" />
                            Export CSV
                        </button>

                        <button
                            onClick={viewMode === 'overview' ? loadStudySummary : () => loadUserAnalytics(selectedUserId)}
                            className="admin-dashboard-button"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* User Selector */}
                <div className="admin-dashboard-user-selector">
                    <label className="admin-dashboard-label">
                        View Specific User
                    </label>
                    <div className="admin-dashboard-select-group">
                        <select
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                            className="admin-dashboard-select"
                        >
                            <option value="">Select a user...</option>
                            {allUsers.map(user => (
                                <option key={user.userId} value={user.userId}>
                                    {user.userId} ({user.totalInteractions} interactions)
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={() => selectedUserId && loadUserAnalytics(selectedUserId)}
                            disabled={!selectedUserId}
                            className="admin-dashboard-button admin-dashboard-button-primary"
                        >
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

            {/* Overview Mode */}
            {viewMode === 'overview' && studySummary && (
                <OverviewView data={studySummary} />
            )}

            {/* User Mode */}
            {viewMode === 'user' && userData && (
                <UserView data={userData} />
            )}
        </div>
    );
};

// Overview View Component
const OverviewView = ({ data }) => {
    // Prepare tool usage data for chart
    const toolUsageData = Object.entries(data.toolPopularity || {}).map(([tool, count]) => ({
        name: tool,
        usage: count
    }));

    // Prepare stage time distribution
    const stageTimeData = Object.entries(data.avgStageTime || {}).map(([stage, time]) => ({
        name: stage.replace(/_/g, ' '),
        minutes: Math.round(time / 60000) // Convert ms to minutes
    }));

    return (
        <div className="admin-dashboard-content">
            {/* Summary Cards */}
            <div className="admin-dashboard-stats-grid">
                <StatCard
                    icon={<Users className="w-6 h-6" />}
                    label="Total Participants"
                    value={data.totalParticipants || 0}
                    color="purple"
                />
                <StatCard
                    icon={<Activity className="w-6 h-6" />}
                    label="Avg Recursions/User"
                    value={data.recursionStats?.avgRecursionsPerUser?.toFixed(1) || '0.0'}
                    color="pink"
                />
                <StatCard
                    icon={<TrendingUp className="w-6 h-6" />}
                    label="Total Tool Uses"
                    value={Object.values(data.toolPopularity || {}).reduce((a, b) => a + b, 0)}
                    color="blue"
                />
                <StatCard
                    icon={<Clock className="w-6 h-6" />}
                    label="Avg Timeline Score"
                    value={data.outcomeAverages?.avgTimelineCoherence?.toFixed(1) || 'N/A'}
                    color="green"
                />
            </div>

            {/* Charts */}
            <div className="admin-dashboard-charts-grid">
                {/* Tool Usage */}
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

                {/* Stage Time Distribution */}
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

            {/* Recursion Stats */}
            <div className="admin-dashboard-info-card">
                <h3 className="admin-dashboard-info-title">
                    🔄 Recursion Patterns
                </h3>
                <div className="admin-dashboard-info-grid">
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Total Recursions</p>
                        <p className="admin-dashboard-info-item-value">
                            {data.recursionStats?.totalRecursions || 0}
                        </p>
                    </div>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Most Common Transition</p>
                        <p className="admin-dashboard-info-item-value" style={{ fontSize: '18px' }}>
                            {data.recursionStats?.mostCommonTransition?.[0] || 'N/A'}
                        </p>
                        <p className="admin-dashboard-info-item-subtext">
                            {data.recursionStats?.mostCommonTransition?.[1] || 0} times
                        </p>
                    </div>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Average per User</p>
                        <p className="admin-dashboard-info-item-value">
                            {data.recursionStats?.avgRecursionsPerUser?.toFixed(1) || '0.0'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Study Groups */}
            <div className="admin-dashboard-info-card">
                <h3 className="admin-dashboard-info-title">
                    👥 Study Group Distribution
                </h3>
                <div className="admin-dashboard-info-grid">
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Tool First</p>
                        <p className="admin-dashboard-info-item-value" style={{ color: '#7C3AED' }}>
                            {data.studyGroups?.tool_first || 0}
                        </p>
                    </div>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">No Tool First</p>
                        <p className="admin-dashboard-info-item-value" style={{ color: '#EC4899' }}>
                            {data.studyGroups?.no_tool_first || 0}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// User View Component (ENHANCED with Story Map metrics)
const UserView = ({ data }) => {
    // Prepare tool usage data
    const toolUsageData = Object.entries(data.toolUsage || {}).map(([tool, count]) => ({
        name: tool,
        count: count
    }));

    // Prepare stage time data
    const stageTimeData = Object.entries(data.stageTimeDistribution || {}).map(([stage, time]) => ({
        name: stage.replace(/_/g, ' '),
        minutes: Math.round(time / 60000)
    }));

    // Recent journey events
    const recentJourney = data.journey?.slice(-10).reverse() || [];

    // Story Map metrics (if available)
    const storyMapMetrics = data.featureMetrics?.storyMap || null;

    return (
        <div className="admin-dashboard-content">
            {/* User Info Header */}
            <div className="admin-dashboard-info-card">
                <h2 className="admin-dashboard-chart-title">
                    User: {data.userId}
                </h2>
                <div className="admin-dashboard-info-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Study Group</p>
                        <p className="admin-dashboard-info-item-value" style={{ fontSize: '18px' }}>
                            {data.userMetadata?.studyGroup || 'N/A'}
                        </p>
                    </div>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Total Interactions</p>
                        <p className="admin-dashboard-info-item-value" style={{ fontSize: '18px' }}>
                            {data.totalToolInteractions || 0}
                        </p>
                    </div>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Recursions</p>
                        <p className="admin-dashboard-info-item-value" style={{ fontSize: '18px' }}>
                            {data.recursionCount || 0}
                        </p>
                    </div>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Condition</p>
                        <p className="admin-dashboard-info-item-value" style={{ fontSize: '18px' }}>
                            {data.userMetadata?.condition || 'N/A'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Charts */}
            <div className="admin-dashboard-charts-grid">
                {/* Tool Usage */}
                <ChartCard title="Tool Usage">
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie
                                data={toolUsageData}
                                dataKey="count"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                label
                            >
                                {toolUsageData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>

                {/* Stage Time */}
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

            {/* Story Map Metrics (NEW - DETAILED) */}
            {storyMapMetrics && (
                <StoryMapMetricsSection metrics={storyMapMetrics} />
            )}

            {/* Recent Journey */}
            <div className="admin-dashboard-journey">
                <h3 className="admin-dashboard-chart-title">
                    🛤️ Recent Tool Journey (Last 10 Events)
                </h3>
                <div className="admin-dashboard-journey-list">
                    {recentJourney.map((event, idx) => (
                        <div key={idx} className="admin-dashboard-journey-item">
                            <div className="admin-dashboard-journey-item-left">
                                <span className="admin-dashboard-journey-time">
                                    {new Date(event.timestamp).toLocaleTimeString()}
                                </span>
                                <span className="admin-dashboard-journey-tool">
                                    {event.tool}
                                </span>
                                <span className="admin-dashboard-journey-action">
                                    {event.interactionType}
                                </span>
                            </div>
                            <span className="admin-dashboard-journey-badge">
                                {event.stage}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Stage Transitions */}
            {data.stageTransitions && data.stageTransitions.length > 0 && (
                <div className="admin-dashboard-transitions">
                    <h3 className="admin-dashboard-chart-title">
                        🔄 Stage Transitions
                    </h3>
                    <div className="admin-dashboard-transitions-list">
                        {data.stageTransitions.map((transition, idx) => (
                            <div
                                key={idx}
                                className={`admin-dashboard-transition-item ${transition.transitionType}`}
                            >
                                <div className="admin-dashboard-journey-item-left">
                                    <span className="admin-dashboard-journey-time">
                                        {new Date(transition.timestamp).toLocaleString()}
                                    </span>
                                    <span className="admin-dashboard-journey-tool">
                                        {transition.from} → {transition.to}
                                    </span>
                                    <span className="admin-dashboard-journey-action">
                                        via {transition.tool}
                                    </span>
                                </div>
                                <span className={`admin-dashboard-transition-badge ${transition.transitionType}`}>
                                    {transition.transitionType}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Feature Metrics */}
            <div className="admin-dashboard-feature-metrics">
                <h3 className="admin-dashboard-chart-title">
                    📊 Feature-Specific Metrics
                </h3>
                <div className="admin-dashboard-feature-metrics-list">
                    {Object.entries(data.featureMetrics || {}).map(([feature, metrics]) => (
                        <FeatureMetricsCard key={feature} feature={feature} metrics={metrics} />
                    ))}
                </div>
            </div>
        </div>
    );
};

// NEW: Story Map Metrics Section (COMPREHENSIVE)
const StoryMapMetricsSection = ({ metrics }) => {
    // Prepare data for charts
    const nodeActionData = Object.entries(metrics.nodeActions || {}).map(([action, count]) => ({
        name: action,
        count: count
    }));

    const linkActionData = Object.entries(metrics.linkActions || {}).map(([action, count]) => ({
        name: action,
        count: count
    }));

    const issuesBySeverityData = Object.entries(metrics.issuesBySeverity || {}).map(([severity, count]) => ({
        name: severity,
        count: count
    }));

    const issuesByCategoryData = Object.entries(metrics.issuesByCategory || {}).map(([category, count]) => ({
        name: category,
        count: count
    }));

    return (
        <div className="admin-dashboard-story-map-section">
            <h3 className="admin-dashboard-section-title">
                <Map className="w-6 h-6" />
                Story Map Analytics (Detailed)
            </h3>

            {/* Summary Cards */}
            <div className="admin-dashboard-stats-grid">
                <StatCard
                    icon={<Eye className="w-5 h-5" />}
                    label="Graph Renders"
                    value={metrics.totalGraphRenders || 0}
                    color="blue"
                />
                <StatCard
                    icon={<Zap className="w-5 h-5" />}
                    label="Analyses Run"
                    value={metrics.totalAnalyses || 0}
                    color="purple"
                />
                <StatCard
                    icon={<GitMerge className="w-5 h-5" />}
                    label="Node Merges"
                    value={metrics.totalMerges || 0}
                    color="pink"
                />
                <StatCard
                    icon={<CheckCircle className="w-5 h-5" />}
                    label="Avg Health Score"
                    value={metrics.graphSizeStats?.avgNodesPerAnalysis?.toFixed(1) || '0.0'}
                    color="green"
                />
            </div>

            {/* Node and Link Actions */}
            <div className="admin-dashboard-charts-grid">
                <ChartCard title="Node Actions">
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={nodeActionData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                            <XAxis dataKey="name" stroke="#52525B" />
                            <YAxis stroke="#52525B" />
                            <Tooltip />
                            <Bar dataKey="count" fill="#3B82F6" />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Link Actions">
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={linkActionData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                            <XAxis dataKey="name" stroke="#52525B" />
                            <YAxis stroke="#52525B" />
                            <Tooltip />
                            <Bar dataKey="count" fill="#EC4899" />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {/* Issues Analysis */}
            <div className="admin-dashboard-charts-grid">
                <ChartCard title="Issues by Severity">
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie
                                data={issuesBySeverityData}
                                dataKey="count"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                label
                            >
                                <Cell fill="#EF4444" /> {/* high */}
                                <Cell fill="#F59E0B" /> {/* medium */}
                                <Cell fill="#10B981" /> {/* low */}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Issues by Category">
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={issuesByCategoryData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                            <XAxis dataKey="name" stroke="#52525B" />
                            <YAxis stroke="#52525B" />
                            <Tooltip />
                            <Bar dataKey="count" fill="#7C3AED" />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {/* Graph Size Stats */}
            <div className="admin-dashboard-info-card">
                <h3 className="admin-dashboard-info-title">
                    <Layers className="w-5 h-5" />
                    Graph Size Statistics
                </h3>
                <div className="admin-dashboard-info-grid">
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Avg Nodes per Analysis</p>
                        <p className="admin-dashboard-info-item-value">
                            {metrics.graphSizeStats?.avgNodesPerAnalysis?.toFixed(1) || '0.0'}
                        </p>
                    </div>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Avg Links per Analysis</p>
                        <p className="admin-dashboard-info-item-value">
                            {metrics.graphSizeStats?.avgLinksPerAnalysis?.toFixed(1) || '0.0'}
                        </p>
                    </div>
                    <div className="admin-dashboard-info-item">
                        <p className="admin-dashboard-info-item-label">Total Analyses</p>
                        <p className="admin-dashboard-info-item-value">
                            {metrics.graphSizeStats?.analysisCount || 0}
                        </p>
                    </div>
                </div>
            </div>

            {/* Merge Statistics */}
            {metrics.mergeStats && (
                <div className="admin-dashboard-info-card">
                    <h3 className="admin-dashboard-info-title">
                        <GitMerge className="w-5 h-5" />
                        Merge Statistics (Duplicate Detection)
                    </h3>
                    <div className="admin-dashboard-info-grid">
                        <div className="admin-dashboard-info-item">
                            <p className="admin-dashboard-info-item-label">Total Nodes Merged</p>
                            <p className="admin-dashboard-info-item-value">
                                {metrics.mergeStats.totalNodesMerged || 0}
                            </p>
                        </div>
                        <div className="admin-dashboard-info-item">
                            <p className="admin-dashboard-info-item-label">Merge Events</p>
                            <p className="admin-dashboard-info-item-value">
                                {metrics.mergeStats.mergeEvents || 0}
                            </p>
                        </div>
                        <div className="admin-dashboard-info-item">
                            <p className="admin-dashboard-info-item-label">Avg Nodes per Merge</p>
                            <p className="admin-dashboard-info-item-value">
                                {metrics.mergeStats.avgNodesPerMerge?.toFixed(1) || '0.0'}
                            </p>
                        </div>
                    </div>
                    {metrics.mergeCompletionRate !== undefined && (
                        <div className="admin-dashboard-stat-highlight">
                            <p className="admin-dashboard-stat-highlight-label">Merge Completion Rate</p>
                            <p className="admin-dashboard-stat-highlight-value">
                                {metrics.mergeCompletionRate.toFixed(1)}%
                            </p>
                            <p className="admin-dashboard-stat-highlight-description">
                                Percentage of merge sessions completed
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Analysis Panel Engagement */}
            {metrics.analysisPanelInteractions && (
                <div className="admin-dashboard-info-card">
                    <h3 className="admin-dashboard-info-title">
                        <Activity className="w-5 h-5" />
                        Analysis Panel Engagement
                    </h3>
                    <div className="admin-dashboard-distribution-grid">
                        {Object.entries(metrics.analysisPanelInteractions).map(([action, count]) => (
                            <div key={action} className="admin-dashboard-distribution-item">
                                <span className="admin-dashboard-distribution-item-name">
                                    {action.replace(/_/g, ' ')}
                                </span>
                                <span className="admin-dashboard-distribution-item-value">{count}</span>
                            </div>
                        ))}
                    </div>
                    {metrics.avgTimeInAnalysisPanel && (
                        <div className="admin-dashboard-stat-box blue" style={{ marginTop: '1rem' }}>
                            <p className="admin-dashboard-stat-box-label">Avg Time in Panel</p>
                            <p className="admin-dashboard-stat-box-value">
                                {(metrics.avgTimeInAnalysisPanel / 1000).toFixed(1)}s
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Content Creation Ratio (AI vs Manual) */}
            {metrics.contentCreationRatio && (
                <div className="admin-dashboard-info-card">
                    <h3 className="admin-dashboard-info-title">
                        <Zap className="w-5 h-5" />
                        Content Creation Ratio (User Agency Metric)
                    </h3>
                    <div className="admin-dashboard-info-grid">
                        <div className="admin-dashboard-info-item">
                            <p className="admin-dashboard-info-item-label">Manual Creation</p>
                            <p className="admin-dashboard-info-item-value" style={{ color: '#3B82F6' }}>
                                {metrics.contentCreationRatio.manualPercentage}%
                            </p>
                            <p className="admin-dashboard-info-item-subtext">
                                {metrics.contentCreationRatio.manualNodes} nodes
                            </p>
                        </div>
                        <div className="admin-dashboard-info-item">
                            <p className="admin-dashboard-info-item-label">AI-Generated</p>
                            <p className="admin-dashboard-info-item-value" style={{ color: '#7C3AED' }}>
                                {metrics.contentCreationRatio.aiPercentage}%
                            </p>
                            <p className="admin-dashboard-info-item-subtext">
                                {metrics.contentCreationRatio.aiNodes} nodes
                            </p>
                        </div>
                        <div className="admin-dashboard-info-item">
                            <p className="admin-dashboard-info-item-label">Total Nodes</p>
                            <p className="admin-dashboard-info-item-value">
                                {metrics.contentCreationRatio.totalNodes}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Issue Interactions (AI Effectiveness) */}
            {metrics.issueInteractions && (
                <div className="admin-dashboard-info-card">
                    <h3 className="admin-dashboard-info-title">
                        <CheckCircle className="w-5 h-5" />
                        AI Suggestions (Acceptance vs Dismissal)
                    </h3>
                    <div className="admin-dashboard-distribution-grid">
                        {Object.entries(metrics.issueInteractions).map(([category, stats]) => (
                            <div key={category} className="admin-dashboard-stat-box green">
                                <p className="admin-dashboard-stat-box-label">{category}</p>
                                <p className="admin-dashboard-stat-box-value">
                                    {stats.acceptanceRate}% accepted
                                </p>
                                <p className="admin-dashboard-info-item-subtext">
                                    {stats.accepted} accepted, {stats.dismissed} dismissed
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Iteration Stats (Framework Testing) */}
            {metrics.iterationStats && (
                <div className="admin-dashboard-info-card">
                    <h3 className="admin-dashboard-info-title">
                        <RefreshCw className="w-5 h-5" />
                        Iteration Patterns (TLC Framework Metric)
                    </h3>
                    <div className="admin-dashboard-info-grid">
                        <div className="admin-dashboard-info-item">
                            <p className="admin-dashboard-info-item-label">Total Iterations</p>
                            <p className="admin-dashboard-info-item-value">
                                {metrics.iterationStats.totalIterations || 0}
                            </p>
                        </div>
                        <div className="admin-dashboard-info-item">
                            <p className="admin-dashboard-info-item-label">Avg Actions per Iteration</p>
                            <p className="admin-dashboard-info-item-value">
                                {metrics.iterationStats.avgActionsPerIteration?.toFixed(1) || '0.0'}
                            </p>
                        </div>
                        <div className="admin-dashboard-info-item">
                            <p className="admin-dashboard-info-item-label">Analysis Influence Rate</p>
                            <p className="admin-dashboard-info-item-value">
                                {metrics.iterationStats.analysisInfluenceRate}%
                            </p>
                            <p className="admin-dashboard-info-item-subtext">
                                Iterations triggered by AI analysis
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Reusable Components
const StatCard = ({ icon, label, value, color }) => {
    return (
        <div className="admin-dashboard-stat-card">
            <div className={`admin-dashboard-stat-icon ${color}`}>
                {icon}
            </div>
            <p className="admin-dashboard-stat-label">{label}</p>
            <p className="admin-dashboard-stat-value">{value}</p>
        </div>
    );
};

const ChartCard = ({ title, children }) => {
    return (
        <div className="admin-dashboard-chart-card">
            <h3 className="admin-dashboard-chart-title">{title}</h3>
            {children}
        </div>
    );
};

// Feature Metrics Display Component (KEEP EXISTING)
const FeatureMetricsCard = ({ feature, metrics }) => {
    // Skip storyMap since we have a dedicated section now
    if (feature === 'storyMap') {
        return null;
    }

    const formatFeatureName = (name) => {
        const names = {
            'mentorText': 'Mentor Text Analysis',
            'timeline': 'Timeline',
            'bookRecs': 'Book Recommendations',
            'bookRecommendations': 'Book Recommendations',
            'feedback': 'Feedback Assistant',
            'feedbackAssistant': 'Feedback Assistant',
            'bsChatbot': 'Brainstorming Chat',
            'dtChatbot': 'Deep Thinking Chat',
            'reflectiveChatbot': 'Reflective Chatbot'
        };
        return names[feature] || feature;
    };

    // Render different metrics based on feature type
    if (feature === 'mentorText') {
        return (
            <div className="admin-dashboard-feature-card">
                <h4 className="admin-dashboard-feature-card-title">
                    📚 {formatFeatureName(feature)}
                </h4>
                
                <div className="admin-dashboard-metric-grid">
                    <MetricBox 
                        label="Total Analyses" 
                        value={metrics.totalAnalyses || 0}
                        icon="📊"
                    />
                    <MetricBox 
                        label="Total Views" 
                        value={metrics.totalAnalysisViews || 0}
                        icon="👁️"
                    />
                    <MetricBox 
                        label="Retention Rate" 
                        value={`${metrics.retentionRate || 100}%`}
                        icon="💾"
                    />
                </div>

                <div className="admin-dashboard-distribution-grid">
                    <div className="admin-dashboard-distribution-card">
                        <p className="admin-dashboard-distribution-title">Focus Areas Used</p>
                        {metrics.analysesByFocus ? (
                            <div className="admin-dashboard-distribution-list">
                                {Object.entries(metrics.analysesByFocus).map(([focus, count]) => (
                                    <div key={focus} className="admin-dashboard-distribution-item">
                                        <span className="admin-dashboard-distribution-item-name">
                                            {focus.replace(/_/g, ' ')}
                                        </span>
                                        <span className="admin-dashboard-distribution-item-value">{count}</span>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="admin-dashboard-distribution-empty">No data</p>}
                    </div>

                    <div className="admin-dashboard-distribution-card">
                        <p className="admin-dashboard-distribution-title">Genres Analyzed</p>
                        {metrics.analysesByGenre ? (
                            <div className="admin-dashboard-distribution-list">
                                {Object.entries(metrics.analysesByGenre).map(([genre, count]) => (
                                    <div key={genre} className="admin-dashboard-distribution-item">
                                        <span className="admin-dashboard-distribution-item-name">{genre}</span>
                                        <span className="admin-dashboard-distribution-item-value">{count}</span>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="admin-dashboard-distribution-empty">No data</p>}
                    </div>
                </div>

                <div className="admin-dashboard-stats-row">
                    <div className="admin-dashboard-stat-box blue">
                        <p className="admin-dashboard-stat-box-label">Avg Teaching Points</p>
                        <p className="admin-dashboard-stat-box-value">
                            {metrics.teachingPointsStats?.average?.toFixed(1) || '0.0'}
                        </p>
                    </div>
                    <div className="admin-dashboard-stat-box green">
                        <p className="admin-dashboard-stat-box-label">Avg Excerpt Length</p>
                        <p className="admin-dashboard-stat-box-value">
                            {metrics.excerptLengthStats?.average?.toFixed(0) || '0'} chars
                        </p>
                    </div>
                    <div className="admin-dashboard-stat-box purple">
                        <p className="admin-dashboard-stat-box-label">Avg Processing Time</p>
                        <p className="admin-dashboard-stat-box-value">
                            {(metrics.processingTimeStats?.average / 1000)?.toFixed(1) || '0.0'}s
                        </p>
                    </div>
                </div>

                {metrics.qualityDistribution && (
                    <div className="admin-dashboard-quality">
                        <p className="admin-dashboard-quality-title">Quality Distribution</p>
                        <div className="admin-dashboard-quality-list">
                            {Object.entries(metrics.qualityDistribution).map(([quality, count]) => (
                                <div key={quality} className="admin-dashboard-quality-item">
                                    <span className={`admin-dashboard-quality-dot ${quality}`}></span>
                                    <span className="admin-dashboard-quality-name">{quality}</span>
                                    <span className="admin-dashboard-quality-count">{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="admin-dashboard-engagement-row">
                    <MetricBox 
                        label="Searches" 
                        value={`${metrics.totalSearches || 0} (${metrics.searchSuccessRate || 0}% success)`}
                        icon="🔍"
                        small
                    />
                    <MetricBox 
                        label="Filters Used" 
                        value={metrics.totalFilterUses || 0}
                        icon="🎛️"
                        small
                    />
                </div>
            </div>
        );
    }

    // Default display for other features
    return (
        <div className="admin-dashboard-feature-card">
            <h4 className="admin-dashboard-feature-card-title">
                {formatFeatureName(feature)}
            </h4>
            <pre className="admin-dashboard-distribution-empty" style={{ 
                maxHeight: '256px', 
                overflow: 'auto',
                backgroundColor: 'var(--border-light)',
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px'
            }}>
                {JSON.stringify(metrics, null, 2)}
            </pre>
        </div>
    );
};

// Reusable metric box
const MetricBox = ({ label, value, icon, small = false }) => {
    return (
        <div className="admin-dashboard-metric-box">
            {icon && <span className="admin-dashboard-metric-icon">{icon}</span>}
            <div className="admin-dashboard-metric-content">
                <p className="admin-dashboard-metric-label">{label}</p>
                <p className={`admin-dashboard-metric-value ${small ? 'admin-dashboard-metric-value-small' : ''}`}>
                    {value}
                </p>
            </div>
        </div>
    );
};

export default AdminDashboard;