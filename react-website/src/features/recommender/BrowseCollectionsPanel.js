import React, { useState } from 'react';
import { BookOpen, X, Loader2, AlertCircle, ArrowLeft, Sparkles, Grid3x3, Search } from 'lucide-react';

const API_BASE = process.env.REACT_APP_AI_SERVER_URL || "http://localhost:5000";

const GENRE_CARDS = [
  { id: 'ya-fantasy', title: 'Young Adult Fantasy', description: 'Magic, adventure, and coming-of-age stories', emoji: '🐉' },
  { id: 'contemporary', title: 'Contemporary Fiction', description: 'Realistic stories about modern life', emoji: '📚' },
  { id: 'sci-fi', title: 'Science Fiction', description: 'Futuristic tech, space, and what-ifs', emoji: '🚀' },
  { id: 'mystery', title: 'Mystery & Thriller', description: 'Suspense, investigation, and plot twists', emoji: '🔍' },
  { id: 'historical', title: 'Historical Fiction', description: 'Stories set in the past', emoji: '⏳' },
  { id: 'realistic', title: 'Realistic Fiction', description: 'Authentic contemporary stories', emoji: '🌍' }
];

// Reusable Book Card Component
const BrowseBookCard = ({ book, onSave, isSaved }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div className="recommendations-flip-card-wrapper">
      <div className={`recommendations-flip-card-inner ${isFlipped ? 'flipped' : ''}`}>
        {/* Front */}
        <div className="recommendations-flip-card-front" onClick={() => setIsFlipped(true)}>
          <div className="recommendations-flip-cover">
            {book.coverUrl ? (
              <img 
                src={book.coverUrl} 
                alt={book.title}
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/200x300?text=No+Cover';
                }}
              />
            ) : (
              <div className="text-gray-400 text-4xl">📚</div>
            )}
          </div>

          <div className="recommendations-flip-front-content">
            <h3 className="recommendations-flip-title">{book.title}</h3>
            <p className="recommendations-flip-author">by {book.author || 'Unknown'}</p>

            <div className="recommendations-flip-meta">
              {book.rating && (
                <div className="recommendations-flip-rating">
                  <span>⭐</span>
                  <span>{book.rating.toFixed(1)}</span>
                </div>
              )}
              {book.year && (
                <span className="recommendations-flip-year">{book.year}</span>
              )}
            </div>

            {isSaved && (
              <div className="recommendations-flip-saved-badge">
                <span>❤️</span>
                <span>Saved</span>
              </div>
            )}
          </div>

          <div className="recommendations-flip-hint">
            Click to see full details →
          </div>
        </div>

        {/* Back */}
        <div className="recommendations-flip-card-back" onClick={() => setIsFlipped(false)}>
          <div className="recommendations-flip-back-content">
            <h3 className="recommendations-flip-back-title">{book.title}</h3>

            {book.description && (
              <div className="recommendations-flip-section">
                <label>Description</label>
                <p className="recommendations-flip-description">{book.description}</p>
              </div>
            )}

            {book.explanation && (
              <div className="recommendations-flip-section recommendations-flip-explanation">
                <label>Why This Book</label>
                <p>{book.explanation}</p>
              </div>
            )}

            {book.comparisonNote && (
              <div className="recommendations-flip-section recommendations-flip-comparison">
                <label>Unique Aspect</label>
                <p>{book.comparisonNote}</p>
              </div>
            )}

            <div className="recommendations-flip-details">
              <div className="recommendations-flip-detail-item">
                <span>Author:</span>
                <strong>{book.author || 'Unknown'}</strong>
              </div>
              {book.year && (
                <div className="recommendations-flip-detail-item">
                  <span>Published:</span>
                  <strong>{book.year}</strong>
                </div>
              )}
              {book.rating && (
                <div className="recommendations-flip-detail-item">
                  <span>Rating:</span>
                  <strong>⭐ {book.rating.toFixed(1)}/5</strong>
                </div>
              )}
            </div>

            {book.categories && book.categories.length > 0 && (
              <div className="recommendations-flip-section">
                <label>Genres</label>
                <div className="recommendations-flip-genres">
                  {book.categories.slice(0, 4).map((genre, idx) => (
                    <span key={idx} className="recommendations-flip-genre-tag">
                      {genre}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="recommendations-flip-actions">
            {!isSaved ? (
              <button 
                className="recommendations-flip-btn save"
                onClick={(e) => {
                  e.stopPropagation();
                  onSave(book);
                }}
              >
                ❤️ Save to Library
              </button>
            ) : (
              <button className="recommendations-flip-btn saved" disabled>
                ❤️ Saved
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const BrowseCollectionsPanel = ({ userId, isVisible, onToggle, onSaveBook }) => {
  const [mode, setMode] = useState('select'); // 'select' | 'custom' | 'results'
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [customQuery, setCustomQuery] = useState('');
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [savedBookIds, setSavedBookIds] = useState(new Set());
  const [extractedElements, setExtractedElements] = useState(null);

  const handleGenreSelect = (genre) => {
    setSelectedGenre(genre);
    fetchBooksByGenre(genre);
  };

  const handleCustomSearch = () => {
    if (!customQuery.trim()) return;
    fetchBooksByCustomQuery(customQuery);
  };

  const fetchBooksByGenre = async (genre) => {
    setLoading(true);
    setError(null);
    setMode('results');

    try {
      // Use the smart browse endpoint with AI extraction
      const response = await fetch(`${API_BASE}/api/browse-books-smart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `I want to read ${genre.title.toLowerCase()}. ${genre.description}`,
          limit: 20
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load books');
      }

      const data = await response.json();
      setBooks(data.books || []);
      setExtractedElements(data.extractedElements || null);
    } catch (err) {
      console.error('Browse error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchBooksByCustomQuery = async (query) => {
    setLoading(true);
    setError(null);
    setMode('results');
    setSelectedGenre({ title: 'Custom Search', emoji: '🔍' });

    try {
      const response = await fetch(`${API_BASE}/api/browse-books-smart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query,
          limit: 20
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load books');
      }

      const data = await response.json();
      setBooks(data.books || []);
      setExtractedElements(data.extractedElements || null);
    } catch (err) {
      console.error('Browse error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBook = async (book) => {
    try {
      await onSaveBook(book);
      setSavedBookIds(prev => new Set([...prev, book.id]));
    } catch (err) {
      console.error('Failed to save book:', err);
    }
  };

  const handleBackToSelect = () => {
    setMode('select');
    setSelectedGenre(null);
    setBooks([]);
    setError(null);
    setExtractedElements(null);
  };

  if (!isVisible) return null;

  return (
    <div className="recommendations-modal-overlay" onClick={onToggle}>
      <div className="recommendations-panel-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="recommendations-panel-header">
          <div className="recommendations-header-title">
            <BookOpen className="w-6 h-6" style={{ color: '#2563eb' }} />
            <h2>Browse Collections</h2>
          </div>
          <button onClick={onToggle} className="recommendations-close-btn">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="recommendations-panel-content">
          {mode === 'select' ? (
            // Selection Mode: Genre Cards + Custom Search
            <>
              <div className="browse-intro">
                <h3 className="browse-intro-title">How would you like to browse?</h3>
                <p className="browse-intro-text">
                  Pick a genre or describe what you're looking for
                </p>
              </div>

              {/* Mode Toggle */}
              <div className="browse-mode-toggle">
                <button
                  onClick={() => setMode('select')}
                  className="browse-mode-btn active"
                >
                  <Grid3x3 className="w-4 h-4" />
                  Browse by Genre
                </button>
                <button
                  onClick={() => setMode('custom')}
                  className="browse-mode-btn"
                >
                  <Sparkles className="w-4 h-4" />
                  Custom Search
                </button>
              </div>

              <div className="browse-genre-grid">
                {GENRE_CARDS.map((genre) => (
                  <button
                    key={genre.id}
                    onClick={() => handleGenreSelect(genre)}
                    className="browse-genre-card"
                  >
                    <div className="browse-genre-emoji">{genre.emoji}</div>
                    <h3 className="browse-genre-title">{genre.title}</h3>
                    <p className="browse-genre-description">{genre.description}</p>
                  </button>
                ))}
              </div>
            </>
          ) : mode === 'custom' ? (
            // Custom Search Mode
            <>
              <div className="browse-breadcrumb">
                <button onClick={handleBackToSelect} className="browse-back-btn">
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
              </div>

              <div className="browse-custom-search">
                <div className="browse-custom-header">
                  <Sparkles className="w-8 h-8" style={{ color: '#2563eb' }} />
                  <h3 className="browse-custom-title">Describe What You Want to Read</h3>
                  <p className="browse-custom-subtitle">
                    Tell us about the story, themes, or mood you're interested in
                  </p>
                </div>

                <textarea
                  value={customQuery}
                  onChange={(e) => setCustomQuery(e.target.value)}
                  placeholder="Example: I want a fantasy story with strong female characters, political intrigue, and a touch of romance. Something dark and complex like Game of Thrones but YA-appropriate."
                  className="browse-custom-textarea"
                  rows={5}
                />

                <button
                  onClick={handleCustomSearch}
                  disabled={!customQuery.trim() || loading}
                  className="browse-custom-search-btn"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 recommendations-loading-spinner" />
                      Finding books...
                    </>
                  ) : (
                    <>
                      <Search className="w-5 h-5" />
                      Find Books
                    </>
                  )}
                </button>

                <div className="browse-custom-examples">
                  <p className="browse-custom-examples-title">Try these examples:</p>
                  <button
                    onClick={() => setCustomQuery("Books about identity and belonging, set in a contemporary high school with diverse characters")}
                    className="browse-example-chip"
                  >
                    Identity & belonging
                  </button>
                  <button
                    onClick={() => setCustomQuery("Sci-fi with time travel, philosophical questions, and teenage protagonists")}
                    className="browse-example-chip"
                  >
                    Time travel sci-fi
                  </button>
                  <button
                    onClick={() => setCustomQuery("Mystery thriller with unreliable narrator and dark secrets")}
                    className="browse-example-chip"
                  >
                    Mystery with twists
                  </button>
                </div>
              </div>
            </>
          ) : (
            // Results Mode
            <>
              <div className="browse-breadcrumb">
                <button onClick={handleBackToSelect} className="browse-back-btn">
                  <ArrowLeft className="w-4 h-4" />
                  Back to Browse
                </button>
                <h3 className="browse-current-genre">
                  {selectedGenre?.emoji} {selectedGenre?.title}
                </h3>
              </div>

              {loading ? (
                <div className="recommendations-loading">
                  <Loader2 className="w-16 h-16 recommendations-loading-spinner" />
                  <p>AI is analyzing your request and finding the perfect books...</p>
                </div>
              ) : error ? (
                <div className="recommendations-error">
                  <AlertCircle className="w-16 h-16 recommendations-error-icon" />
                  <p className="recommendations-error-title">Failed to load books</p>
                  <p className="recommendations-error-message">{error}</p>
                  <button 
                    onClick={() => selectedGenre ? handleGenreSelect(selectedGenre) : handleCustomSearch()} 
                    className="recommendations-retry-btn"
                  >
                    Try Again
                  </button>
                </div>
              ) : books.length === 0 ? (
                <div className="recommendations-empty">
                  <BookOpen className="w-16 h-16 recommendations-empty-icon" />
                  <h3 className="recommendations-empty-title">No books found</h3>
                  <p className="recommendations-empty-text">
                    Try adjusting your search or selecting a different genre
                  </p>
                </div>
              ) : (
                <>
                  {extractedElements && (
                    <div className="recommendations-themes-box">
                      <h3 className="recommendations-themes-title">
                        📖 AI understood your request:
                      </h3>
                      <div className="recommendations-themes-tags">
                        {extractedElements.genre && (
                          <span className="recommendations-theme-tag">
                            Genre: {extractedElements.genre}
                          </span>
                        )}
                        {extractedElements.themes?.slice(0, 5).map((theme, idx) => (
                          <span key={idx} className="recommendations-theme-tag">
                            {theme}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="browse-results-count">
                    Found {books.length} books matching your interests
                  </p>

                  <p className="recommendations-flip-hint-text">
                    💡 <strong>Tip:</strong> Click any book card to flip and see full details
                  </p>

                  <div className="recommendations-flip-grid">
                    {books.map((book) => (
                      <BrowseBookCard
                        key={book.id}
                        book={book}
                        onSave={handleSaveBook}
                        isSaved={savedBookIds.has(book.id)}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .browse-intro {
          text-align: center;
          margin-bottom: 32px;
        }

        .browse-intro-title {
          font-size: 28px;
          font-weight: 700;
          color: #111827;
          margin-bottom: 12px;
        }

        .browse-intro-text {
          font-size: 16px;
          color: #6b7280;
          line-height: 1.6;
        }

        .browse-mode-toggle {
          display: flex;
          gap: 12px;
          margin-bottom: 32px;
          justify-content: center;
        }

        .browse-mode-btn {
          padding: 12px 24px;
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 600;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .browse-mode-btn:hover {
          border-color: #2563eb;
          color: #2563eb;
          background: #eff6ff;
        }

        .browse-mode-btn.active {
          border-color: #2563eb;
          background: #2563eb;
          color: white;
        }

        .browse-genre-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 20px;
        }

        .browse-genre-card {
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 16px;
          padding: 24px;
          cursor: pointer;
          transition: all 0.3s;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .browse-genre-card:hover {
          border-color: #2563eb;
          background: #eff6ff;
          transform: translateY(-4px);
          box-shadow: 0 8px 16px rgba(37, 99, 235, 0.2);
        }

        .browse-genre-emoji {
          font-size: 48px;
          margin-bottom: 12px;
        }

        .browse-genre-title {
          font-size: 18px;
          font-weight: 600;
          color: #111827;
          margin: 0 0 8px 0;
        }

        .browse-genre-description {
          font-size: 13px;
          color: #6b7280;
          margin: 0;
          line-height: 1.5;
        }

        .browse-custom-search {
          max-width: 700px;
          margin: 0 auto;
        }

        .browse-custom-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .browse-custom-title {
          font-size: 24px;
          font-weight: 700;
          color: #111827;
          margin: 16px 0 8px 0;
        }

        .browse-custom-subtitle {
          font-size: 15px;
          color: #6b7280;
          margin: 0;
        }

        .browse-custom-textarea {
          width: 100%;
          padding: 16px;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          font-size: 15px;
          line-height: 1.6;
          font-family: inherit;
          resize: vertical;
          transition: all 0.2s;
          margin-bottom: 20px;
        }

        .browse-custom-textarea:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .browse-custom-search-btn {
          width: 100%;
          padding: 14px 24px;
          background: linear-gradient(135deg, #2563eb 0%, #9333ea 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.3);
        }

        .browse-custom-search-btn:enabled:hover {
          background: linear-gradient(135deg, #1d4ed8 0%, #7e22ce 100%);
          transform: translateY(-2px);
          box-shadow: 0 8px 12px -1px rgba(37, 99, 235, 0.4);
        }

        .browse-custom-search-btn:disabled {
          background: #e5e7eb;
          color: #9ca3af;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .browse-custom-examples {
          margin-top: 24px;
          padding: 20px;
          background: #f9fafb;
          border-radius: 12px;
        }

        .browse-custom-examples-title {
          font-size: 13px;
          font-weight: 600;
          color: #6b7280;
          margin: 0 0 12px 0;
        }

        .browse-example-chip {
          display: inline-block;
          padding: 8px 16px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 20px;
          font-size: 13px;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s;
          margin: 0 8px 8px 0;
        }

        .browse-example-chip:hover {
          border-color: #2563eb;
          background: #eff6ff;
          color: #2563eb;
        }

        .browse-breadcrumb {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 2px solid #e5e7eb;
        }

        .browse-back-btn {
          padding: 8px 16px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .browse-back-btn:hover {
          background: #f9fafb;
          border-color: #9ca3af;
          color: #111827;
        }

        .browse-current-genre {
          font-size: 20px;
          font-weight: 700;
          color: #111827;
          margin: 0;
        }

        .browse-results-count {
          font-size: 14px;
          color: #6b7280;
          margin-bottom: 20px;
          text-align: center;
        }

        @media (max-width: 768px) {
          .browse-genre-grid {
            grid-template-columns: 1fr;
          }

          .browse-mode-toggle {
            flex-direction: column;
          }

          .browse-breadcrumb {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
};

export default BrowseCollectionsPanel;