import React, { useState, useEffect } from 'react';
import {
    Send, Library, Search, ExternalLink, Loader2,
    ChevronDown, ChevronUp, AlertTriangle, RefreshCw
} from 'lucide-react';
import { useAuthValue } from '../../Firebase/AuthContext';
import { logPageExit, logPageView, logUIInteraction } from '../../utils/analytics';

import './resource-recommender.css';

const API_BASE = process.env.REACT_APP_AI_SERVER_URL || 'http://localhost:5000';

const ResourceRecommenderPage = () => {
    const { currentUser } = useAuthValue();
    const userId = currentUser?.uid;

    const [idea, setIdea] = useState('');
    const [lastIdea, setLastIdea] = useState('');
    const [results, setResults] = useState([]);
    const [queries, setQueries] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const [expandedIds, setExpandedIds] = useState(new Set());

    const [asks, setAsks] = useState({}); // resourceId -> { input, loading, error, thread }

    const updateAsk = (id, patch) =>
        setAsks(prev => ({
            ...prev,
            [id]: { input: '', loading: false, error: null, thread: [], ...prev[id], ...patch }
        }));

    const askFollowUp = async (r) => {
        const state = asks[r.id] || {};
        const question = (state.input || '').trim();
        if (question.length < 5 || state.loading) return;

        updateAsk(r.id, { loading: true, error: null });
        logUIInteraction(userId, 'resourceRecs', 'ask_followup', {
            resourceId: r.id, title: r.title, questionLength: question.length
        });

        try {
            const response = await fetch(`${API_BASE}/api/resource-followup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    pageId: r.pageId,
                    title: r.title,
                    idea: lastIdea,
                    question,
                    history: (state.thread || []).slice(-3).map(t => ({
                        question: t.question, answer: t.answer
                    }))
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not answer that');

            setAsks(prev => {
                const cur = prev[r.id] || {};
                return {
                    ...prev,
                    [r.id]: {
                        ...cur, loading: false, input: '',
                        thread: [...(cur.thread || []), { question, ...data }]
                    }
                };
            });
        } catch (err) {
            updateAsk(r.id, { loading: false, error: err.message });
        }
    };

    const renderPoints = (points) => (
        <ul className="resource-points">
            {points.map((p, i) => {
                const item = typeof p === 'string' ? { point: p, section: null } : p;
                return (
                    <li key={i}>
                        {item.point}
                        {item.section && item.section !== 'Introduction' && (
                            <span className="resource-section-tag">{item.section}</span>
                        )}
                    </li>
                );
            })}
        </ul>
    );

    // Page view / exit tracking (same pattern as the mentor text page)
    useEffect(() => {
        if (!userId) return;
        const entryTime = Date.now();
        logPageView(userId, 'resourceRecs', 'building_knowledge');
        return () => {
            logPageExit(userId, 'resourceRecs', Date.now() - entryTime);
        };
    }, [userId]);

    const fetchResources = async ({ more = false } = {}) => {
        if (!userId) {
            setError('Please log in to use the resource finder');
            return;
        }

        const ideaToUse = more ? lastIdea : idea.trim();
        if (ideaToUse.length < 10) {
            setError('Tell us a bit more about your story or topic (at least 10 characters).');
            return;
        }

        setLoading(true);
        setError(null);
        setMessage(null);
        if (!more) {
            setResults([]);
            setExpandedIds(new Set());
        }

        if (more) {
            logUIInteraction(userId, 'resourceRecs', 'find_more', { shownCount: results.length });
        }

        try {
            const response = await fetch(`${API_BASE}/api/resource-recommendations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    idea: ideaToUse,
                    excludeTitles: more ? results.map(r => r.title) : [],
                    limit: 5
                })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to find resources');
            }

            setQueries(data.queries || []);
            setLastIdea(ideaToUse);

            if (!data.results || data.results.length === 0) {
                setMessage(
                    data.message ||
                    (more
                        ? 'No further sources found for this topic.'
                        : 'No sources found. Try describing the setting, activity or place in more detail.')
                );
            } else {
                setResults(prev => (more ? [...prev, ...data.results] : data.results));
            }
        } catch (err) {
            console.error('Resource search failed:', err);
            setError(err.message || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const toggleExtract = (resource) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(resource.id)) {
                next.delete(resource.id);
            } else {
                next.add(resource.id);
                logUIInteraction(userId, 'resourceRecs', 'expand_extract', {
                    resourceId: resource.id,
                    title: resource.title
                });
            }
            return next;
        });
    };

    const handleOpenSource = (resource) => {
        logUIInteraction(userId, 'resourceRecs', 'open_source_link', {
            resourceId: resource.id,
            title: resource.title,
            url: resource.url
        });
    };

    return (
        <div className="mentor-text-page">
            {/* Header */}
            <div className="mentor-text-header">
                <div className="mentor-text-header-content">
                    <div className="mentor-text-header-title">
                        <div className="mentor-text-header-icon">
                            <Library className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <h1>Resource Finder</h1>
                            <p className="mentor-text-header-subtitle">
                                Find background reading on the subject of your story
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mentor-text-content">
                {/* Input */}
                <div className="resource-input-section">
                    <label className="resource-input-label" htmlFor="resource-idea">
                        What is your story, or what topic do you want to learn about?
                    </label>
                    <textarea
                        id="resource-idea"
                        className="resource-textarea"
                        rows={5}
                        value={idea}
                        onChange={(e) => setIdea(e.target.value)}
                        placeholder="Describe your story idea or topic in a few sentences."
                        disabled={loading}
                    />
                    <button
                        className="resource-search-btn"
                        onClick={() => fetchResources()}
                        disabled={loading || idea.trim().length < 10}
                    >
                        {loading && results.length === 0 ? (
                            <>
                                <Loader2 className="w-5 h-5 mentor-text-loading-spinner" />
                                Reading articles...
                            </>
                        ) : (
                            <>
                                <Search className="w-5 h-5" />
                                Find Resources
                            </>
                        )}
                    </button>
                </div>

                {error && (
                    <div className="mentor-text-form-error resource-feedback">
                        <AlertTriangle className="w-5 h-5" />
                        <span>{error}</span>
                    </div>
                )}

                {message && !loading && (
                    <p className="resource-message">{message}</p>
                )}

                {/* Results */}
                {results.length > 0 && (
                    <>
                        {queries.length > 0 && (
                            <p className="resource-queries">
                                Searched for: {queries.join(' · ')}
                            </p>
                        )}

                        <div className="resource-list">
                            {results.map((r) => {
                                const isOpen = expandedIds.has(r.id);
                                const ask = asks[r.id] || {};
                                return (
                                    <div key={r.id} className="resource-card">
                                        <div className="resource-card-header">
                                            <h3>{r.title}</h3>
                                            <a
                                                href={r.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="resource-link"
                                                onClick={() => handleOpenSource(r)}
                                            >
                                                Read on Wikipedia
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                        </div>

                                        {r.whyUseful && (
                                            <p className="resource-why">{r.whyUseful}</p>
                                        )}

                                        {r.summary && (
                                            <p className="resource-summary">{r.summary}</p>
                                        )}

                                        {r.keyPoints?.length > 0 && renderPoints(r.keyPoints)}

                                        {r.vocabulary?.length > 0 && (
                                            <div className="resource-vocab">
                                                <span className="resource-vocab-label">Useful words</span>
                                                {r.vocabulary.map((v, i) => (
                                                    <span key={i} className="resource-vocab-chip">{v}</span>
                                                ))}
                                            </div>
                                        )}

                                        <button
                                            className="resource-extract-toggle"
                                            onClick={() => toggleExtract(r)}
                                        >
                                            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            {isOpen ? 'Hide article intro' : 'Show article intro'}
                                        </button>

                                        {isOpen && <p className="resource-extract">{r.extract}</p>}

                                        {/* Follow-up questions about this article */}
                                        <div className="resource-ask">
                                            {(ask.thread || []).map((t, i) => (
                                                <div key={i} className="resource-ask-turn">
                                                    <p className="resource-ask-q">{t.question}</p>
                                                    <p className={t.covered ? 'resource-ask-a' : 'resource-ask-a resource-ask-miss'}>
                                                        {t.answer}
                                                    </p>
                                                    {t.keyPoints?.length > 0 && renderPoints(t.keyPoints)}
                                                    {t.vocabulary?.length > 0 && (
                                                        <div className="resource-vocab">
                                                            <span className="resource-vocab-label">Useful words</span>
                                                            {t.vocabulary.map((v, j) => (
                                                                <span key={j} className="resource-vocab-chip">{v}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}

                                            {ask.error && (
                                                <p className="resource-ask-error">{ask.error}</p>
                                            )}

                                            <div className="resource-ask-row">
                                                <input
                                                    className="resource-ask-input"
                                                    type="text"
                                                    placeholder="Ask this article a question…"
                                                    value={ask.input || ''}
                                                    onChange={(e) => updateAsk(r.id, { input: e.target.value })}
                                                    onKeyDown={(e) => e.key === 'Enter' && askFollowUp(r)}
                                                    disabled={ask.loading}
                                                />
                                                <button
                                                    className="resource-ask-btn"
                                                    onClick={() => askFollowUp(r)}
                                                    disabled={ask.loading || (ask.input || '').trim().length < 5}
                                                    aria-label="Ask question"
                                                >
                                                    {ask.loading
                                                        ? <Loader2 className="w-4 h-4 mentor-text-loading-spinner" />
                                                        : <Send className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="resource-more">
                            <button
                                className="resource-more-btn"
                                onClick={() => fetchResources({ more: true })}
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mentor-text-loading-spinner" />
                                        Finding more...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw className="w-4 h-4" />
                                        Show different sources
                                    </>
                                )}
                            </button>
                        </div>

                        <p className="resource-attribution">
                            Articles from Wikipedia, available under CC BY-SA. Summaries, key points and answers are AI-generated from the article text.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};

export default ResourceRecommenderPage;