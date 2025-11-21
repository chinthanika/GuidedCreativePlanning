import React, { useState } from 'react';
import { BookOpen, X, Filter, ChevronDown, ChevronUp, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import BookCard from './BookCard';
import FilterControls from '../../components/recommender/FilterControls';
import BrowseCollectionsPanel from './BrowseCollectionsPanel';
import LibrarySidebar from './LibrarySidebar';
import LoadingState from '../../components/recommender/LoadingState';

import BookDetailsModal from '../../components/recommender/BookDetailsModal';

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

  // Current filters (UI state)
  const [filters, setFilters] = useState({
    ageRange: '12-16',
    pubDate: 'any',
    minRating: 3.5
  });

  // Applied filters (last used for API call) - null means never applied
  const [appliedFilters, setAppliedFilters] = useState(null);

  const defaultFilters = {
    ageRange: '12-16',
    pubDate: 'any',
    minRating: 3.5
  };

  const canRequest = conversationHistory.length >= 3;

  // Check if filters have changed
  const hasFilterChanges = appliedFilters === null
    ? (
      // Before first fetch: compare to defaults
      filters.ageRange !== defaultFilters.ageRange ||
      filters.pubDate !== defaultFilters.pubDate ||
      filters.minRating !== defaultFilters.minRating
    )
    : (
      // After first fetch: compare to last applied
      filters.ageRange !== appliedFilters.ageRange ||
      filters.pubDate !== appliedFilters.pubDate ||
      filters.minRating !== appliedFilters.minRating
    );

  const getRecommendations = async (useFilters = filters) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/book-recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sessionId,
          filters: useFilters,
          limit: 6,
          generateExplanations: true
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
        ...(book._filter_match_score !== undefined && { _filter_match_score: book._filter_match_score })
      }));

      setBooks(cleanedBooks);
      setExtractedThemes(data.extractedElements || null);
      setAppliedFilters(useFilters); // Mark these filters as applied

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
    const clearedFilters = {
      ageRange: 'any',
      pubDate: 'any',
      minRating: 0
    };
    setFilters(clearedFilters);

    // If we have books, regenerate with cleared filters
    if (books.length > 0) {
      getRecommendations(clearedFilters);
    }
  };

  const handleSaveBook = async (book) => {
    console.log('Saving book with full data:', book);

    try {
      const response = await fetch(`${API_BASE}/api/book-recommendations/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sessionId,
          book: book  // ← CHANGED: Pass entire book object, not selective fields
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSavedBooks(prev => [...prev, book]);
        setSavedBookIds(prev => new Set([...prev, book.id]));
        console.log('Book saved successfully:', result);
      } else {
        console.error('Save failed:', result);
        throw new Error(result.error || 'Failed to save book');
      }
    } catch (err) {
      console.error('Failed to save book:', err);
      throw err;
    }
  };

  const handleRejectBook = (bookId) => {
    setBooks(prev => prev.filter(b => b.id !== bookId));
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

        {/* Filters - Always visible at top */}
        <div className="recommendations-panel-controls">
          <button
            onClick={() => setShowFilters(!showFilters)}
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
            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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
              />
            </div>
          )}

          {/* Get Recommendations Button */}
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
              <button onClick={() => getRecommendations(filters)} className="recommendations-retry-btn">
                Try Again
              </button>
            </div>
          ) : books.length === 0 ? (
            <div className="recommendations-empty">
              <BookOpen className="w-16 h-16 recommendations-empty-icon" />
              <h3 className="recommendations-empty-title">Ready to discover books?</h3>
              <p className="recommendations-empty-text">
                Set your preferences above, then click "Get Recommendations" to find books that match your story themes and style
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