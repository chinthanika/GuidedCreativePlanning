import React, { useState, useEffect, useRef } from 'react';
import {
    BookOpen, X, Filter, ChevronDown, ChevronUp,
    Loader2, AlertCircle, Sparkles
} from 'lucide-react';
import BookCard from './BookCard';
import FilterControls from '../../components/recommender/FilterControls';

import { logPageView, logPageExit, logUIInteraction } from '../../utils/analytics';

import './recommendations-panel.css';

const API_BASE = process.env.REACT_APP_AI_SERVER_URL || "http://localhost:5000";

const RecommendationsPanel = ({ sessionId, userId, conversationHistory, isVisible, onToggle }) => {
    const [books, setBooks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [savedBooks, setSavedBooks] = useState([]);
    const [savedBookIds, setSavedBookIds] = useState(new Set());
    const [extractedThemes, setExtractedThemes] = useState(null);
    const [showFilters, setShowFilters] = useState(true);

    // ── Bug fix: track every book the user has already seen or rejected ────────
    // This persists across multiple "Get Recommendations" calls in the same session
    const seenBookIdsRef = useRef(new Set());

    // ── Analytics: track how long the panel was open ──────────────────────────
    const panelOpenTimeRef = useRef(null);

    const CACHE_KEY = `book_recs_${sessionId}`;

    // Restore cached recommendations
    useEffect(() => {
        if (sessionId && !loading) {
            const cached = sessionStorage.getItem(CACHE_KEY);
            if (cached) {
                try {
                    const data = JSON.parse(cached);
                    if (Date.now() - data.timestamp < 3600000) {
                        setBooks(data.books || []);
                        setExtractedThemes(data.themes || null);
                        setAppliedFilters(data.filters || null);

                        // Restore seen-book set from cache too
                        if (data.seenBookIds) {
                            seenBookIdsRef.current = new Set(data.seenBookIds);
                        }
                    }
                } catch (err) {
                    sessionStorage.removeItem(CACHE_KEY);
                }
            }
        }
    }, [sessionId]);    // eslint-disable-line react-hooks/exhaustive-deps

    // Log panel open / close
    useEffect(() => {
        if (!userId || !isVisible) return;

        panelOpenTimeRef.current = Date.now();
        logUIInteraction(userId, 'bookRecs', 'open_recommendations_panel', {});

        return () => {
            if (panelOpenTimeRef.current) {
                const durationMs = Date.now() - panelOpenTimeRef.current;
                logUIInteraction(userId, 'bookRecs', 'close_recommendations_panel', { durationMs });
                panelOpenTimeRef.current = null;
            }
        };
    }, [isVisible, userId]);

    const [filters, setFilters] = useState({
        ageRange: '12-16',
        pubDate: 'any',
        minRating: 3.5
    });

    const [appliedFilters, setAppliedFilters] = useState(null);

    const defaultFilters = {
        ageRange: '12-16',
        pubDate: 'any',
        minRating: 3.5
    };

    const canRequest = conversationHistory.length >= 3;

    const hasFilterChanges = appliedFilters === null
        ? (
            filters.ageRange !== defaultFilters.ageRange ||
            filters.pubDate !== defaultFilters.pubDate ||
            filters.minRating !== defaultFilters.minRating
        )
        : (
            filters.ageRange !== appliedFilters.ageRange ||
            filters.pubDate !== appliedFilters.pubDate ||
            filters.minRating !== appliedFilters.minRating
        );

    // ── Core fetch — passes excluded IDs to the backend ──────────────────────
    const getRecommendations = async (useFilters = filters) => {
        setLoading(true);
        setError(null);

        // Log the request
        logUIInteraction(userId, 'bookRecs', 'request_recommendations', {
            booksAlreadySeen: seenBookIdsRef.current.size,
            filtersApplied: {
                ageRange: useFilters.ageRange,
                pubDate: useFilters.pubDate,
                minRating: useFilters.minRating
            }
        }).catch(err => console.warn('[Analytics] request_recommendations failed:', err));;

        try {
            const response = await fetch(`${API_BASE}/api/book-recommendations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    sessionId,
                    filters: useFilters,
                    limit: 6,
                    generateExplanations: true,
                    // ── FIX: tell the backend which books NOT to return ────────
                    excludeBookIds: [...seenBookIdsRef.current]
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to load recommendations');
            }

            const data = await response.json();

            const cleanedBooks = (data.recommendations || []).map(book => ({
                id: book.id,
                title: book.title,
                author: book.author,
                ...(book.year && { year: book.year }),
                ...(book.coverUrl && { coverUrl: book.coverUrl }),
                ...(book.rating && { rating: book.rating }),
                ...(book.categories && book.categories.length > 0 && { categories: book.categories }),
                ...(book.explanation && { explanation: book.explanation }),
                ...(book.matchHighlights && book.matchHighlights.length > 0 && { matchHighlights: book.matchHighlights }),
                ...(book.comparisonNote && { comparisonNote: book.comparisonNote }),
                ...(book._filter_match_score !== undefined && { _filter_match_score: book._filter_match_score }),
                relevance_score: book.relevance_score ?? 0
            }));

            setBooks(cleanedBooks);
            setExtractedThemes(data.extractedElements || null);
            setAppliedFilters(useFilters);

            // Mark all returned books as seen
            cleanedBooks.forEach(b => seenBookIdsRef.current.add(b.id));

            // Log how many books came back
            logUIInteraction(userId, 'bookRecs', 'recommendations_received', {
                booksReturned: cleanedBooks.length,
                genre: data.extractedElements?.genre,
                themes: data.extractedElements?.themes?.slice(0, 3),
                extractionConfidence: data.extractedElements?.overallConfidence
            }).catch(err => console.warn('[Analytics] recommendations_received failed:', err));

            try {
                sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                    books: cleanedBooks,
                    themes: data.extractedElements,
                    filters: useFilters,
                    seenBookIds: [...seenBookIdsRef.current],   // persist across re-renders
                    timestamp: Date.now()
                }));
            } catch (err) {
                console.warn('Failed to cache recommendations:', err);
            }

        } catch (err) {
            console.error('Recommendation error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleApplyFilters = () => {
        if (hasFilterChanges) {
            getRecommendations(filters);
        }
    };

    const handleClearFilters = () => {
        const clearedFilters = { ageRange: 'any', pubDate: 'any', minRating: 0 };
        setFilters(clearedFilters);
        if (books.length > 0) {
            getRecommendations(clearedFilters);
        }
    };

    const handleSaveBook = async (book) => {
        try {
            const response = await fetch(`${API_BASE}/api/book-recommendations/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, sessionId, book })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                setSavedBooks(prev => [...prev, book]);
                setSavedBookIds(prev => new Set([...prev, book.id]));

                // Log save (the /api/log-ui-interaction handler already increments the
                // featureMetrics counter, but we also log here for journey tracking)
                logUIInteraction(userId, 'bookRecs', 'save_book', {
                    bookId: book.id,
                    bookTitle: book.title,
                    source: 'recommendations'
                });
            } else {
                throw new Error(result.error || 'Failed to save book');
            }
        } catch (err) {
            console.error('Failed to save book:', err);
        }
    };

    const handleRejectBook = (bookId) => {
        // Mark as seen so future regenerations also exclude it
        seenBookIdsRef.current.add(bookId);
        setBooks(prev => prev.filter(b => b.id !== bookId));

        logUIInteraction(userId, 'bookRecs', 'pass_book', { bookId });
    };

    const handleToggleFilters = () => {
        const next = !showFilters;
        setShowFilters(next);
        logUIInteraction(userId, 'bookRecs', 'toggle_filters_panel', { opened: next });
    };

    if (!isVisible) return null;

    return (
        <div className="recommendations-modal-overlay" onClick={onToggle}>
            <div className="recommendations-panel-modal" onClick={(e) => e.stopPropagation()}>
                <div className="recommendations-panel-header">
                    <div className="recommendations-header-title">
                        <BookOpen className="w-6 h-6" style={{ color: '#2563eb' }} />
                        <h2>Book Recommendations</h2>
                    </div>
                    <button onClick={onToggle} className="recommendations-close-btn">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Filters */}
                <div className="recommendations-panel-controls">
                    <button
                        onClick={handleToggleFilters}
                        className="recommendations-filter-toggle"
                    >
                        <div className="recommendations-filter-toggle-left">
                            <Filter className="w-4 h-4" />
                            <span>Recommendation Filters</span>
                            {hasFilterChanges && (
                                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-semibold">
                                    Modified
                                </span>
                            )}
                        </div>
                        {showFilters
                            ? <ChevronUp className="w-4 h-4" />
                            : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {showFilters && (
                        <div className="mt-3">
                            <FilterControls
                                filters={filters}
                                onChange={setFilters}
                                onApply={handleApplyFilters}
                                onClear={handleClearFilters}
                                hasChanges={hasFilterChanges}
                                isLoading={loading}
                                userId={userId}
                            />
                        </div>
                    )}

                    <button
                        onClick={() => getRecommendations(filters)}
                        disabled={!canRequest || loading}
                        className="recommendations-get-btn mt-4"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 recommendations-loading-spinner" />
                                Finding books...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-5 h-5" />
                                {books.length > 0 ? 'Get New Recommendations' : 'Get Recommendations'}
                            </>
                        )}
                    </button>

                    {!canRequest && (
                        <p className="recommendations-chat-reminder">
                            Chat {3 - conversationHistory.length} more turns to unlock recommendations
                        </p>
                    )}
                </div>

                {/* Results */}
                <div className="recommendations-panel-content">
                    {loading ? (
                        <div className="recommendations-loading">
                            <Loader2 className="w-16 h-16 recommendations-loading-spinner" />
                            <p>Finding perfect books for your story...</p>
                        </div>
                    ) : error ? (
                        <div className="recommendations-error">
                            <AlertCircle className="w-16 h-16 recommendations-error-icon" />
                            <p className="recommendations-error-title">Failed to load recommendations</p>
                            <p className="recommendations-error-message">{error}</p>
                            <button
                                onClick={() => getRecommendations(filters)}
                                className="recommendations-retry-btn"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : books.length === 0 ? (
                        <div className="recommendations-empty">
                            <BookOpen className="w-16 h-16 recommendations-empty-icon" />
                            <h3 className="recommendations-empty-title">Ready to discover books?</h3>
                            <p className="recommendations-empty-text">
                                Set your preferences above, then click "Get Recommendations"
                            </p>
                        </div>
                    ) : (
                        <>
                            {extractedThemes && (
                                <div className="recommendations-themes-box">
                                    <h3 className="recommendations-themes-title">
                                        📖 Based on your conversation:
                                    </h3>
                                    <div className="recommendations-themes-tags">
                                        {extractedThemes.themes?.slice(0, 6).map((theme, idx) => (
                                            <span key={idx} className="recommendations-theme-tag">
                                                {theme}
                                            </span>
                                        ))}
                                    </div>
                                    {extractedThemes.genre && (
                                        <p className="recommendations-genre-info">
                                            Genre: <span>{extractedThemes.genre}</span>
                                        </p>
                                    )}
                                </div>
                            )}

                            <p className="recommendations-flip-hint-text">
                                💡 <strong>Tip:</strong> Click any book card to flip and see full details
                            </p>

                            <div className="recommendations-flip-grid">
                                {books.map((book) => (
                                    <BookCard
                                        key={book.id}
                                        book={book}
                                        onSave={handleSaveBook}
                                        onReject={handleRejectBook}
                                        isSaved={savedBooks.some(b => b.id === book.id)}
                                        userId={userId}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RecommendationsPanel;