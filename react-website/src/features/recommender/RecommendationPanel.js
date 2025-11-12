import React, { useState } from 'react';
import { BookOpen, X, Filter, ChevronDown, ChevronUp, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import BookCard from './BookCard';
import FilterControls from '../../components/recommender/FilterControls';
import BrowseCollectionsTab from './BrowseCollectionsTab';
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
  const [showFilters, setShowFilters] = useState(false);
  const [extractedThemes, setExtractedThemes] = useState(null);
  const [flippedCard, setFlippedCard] = useState(null);
  const [filters, setFilters] = useState({
    ageRange: '12-16',
    pubDate: 'any',
    minRating: 3.5
  });

  const canRequest = conversationHistory.length >= 3;

  const getRecommendations = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/book-recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sessionId,
          filters,
          limit: 6,
          generateExplanations: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load recommendations');
      }

      const data = await response.json();
      
      // Clean up books - only include available fields
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
        ...(book.comparisonNote && { comparisonNote: book.comparisonNote })
      }));
      
      setBooks(cleanedBooks);
      setExtractedThemes(data.extractedElements || null);
      
    } catch (err) {
      console.error('Recommendation error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBook = async (book) => {
    try {
      await fetch(`${API_BASE}/api/book-recommendations/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sessionId,
          book: {
            id: book.id,
            title: book.title,
            author: book.author,
            source: book.source,
            coverUrl: book.coverUrl
          }
        })
      });
      
      setSavedBooks(prev => [...prev, book]);
    } catch (err) {
      console.error('Failed to save book:', err);
    }
  };

  const handleRejectBook = (bookId) => {
    setBooks(prev => prev.filter(b => b.id !== bookId));
    if (flippedCard === bookId) {
      setFlippedCard(null);
    }
  };

  const handleFlipCard = (bookId) => {
    setFlippedCard(flippedCard === bookId ? null : bookId);
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

        <div className="recommendations-panel-controls">
          <button
            onClick={getRecommendations}
            disabled={!canRequest || loading}
            className="recommendations-get-btn"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 recommendations-loading-spinner" />
                Finding books...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Get Recommendations
              </>
            )}
          </button>
          {!canRequest && (
            <p className="recommendations-chat-reminder">
              Chat {3 - conversationHistory.length} more turns to unlock recommendations
            </p>
          )}
        </div>

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
              <button onClick={getRecommendations} className="recommendations-retry-btn">
                Try Again
              </button>
            </div>
          ) : books.length === 0 ? (
            <div className="recommendations-empty">
              <BookOpen className="w-16 h-16 recommendations-empty-icon" />
              <h3 className="recommendations-empty-title">Ready to discover books?</h3>
              <p className="recommendations-empty-text">
                Chat about your story to get personalized book recommendations that match your themes and style
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
              
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="recommendations-filter-toggle"
              >
                <div className="recommendations-filter-toggle-left">
                  <Filter className="w-4 h-4" />
                  <span>Filters</span>
                </div>
                {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              
              {showFilters && <FilterControls filters={filters} onChange={setFilters} />}
              
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
                    flippedCard={flippedCard}
                    onFlip={handleFlipCard}
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