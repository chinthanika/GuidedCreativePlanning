import React, { useState } from 'react';
import { Star, Heart, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

const BookCard = ({ book, onSave, onReject, isSaved }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const filterMatchScore = book._filter_match_score || 0;
  const hasFilterMatch = filterMatchScore > 0;

  return (
    <div className="recommendations-flip-card-wrapper">
      <div className={`recommendations-flip-card-inner ${isFlipped ? 'flipped' : ''}`}>
        {/* Front */}
        <div className="recommendations-flip-card-front" onClick={() => setIsFlipped(true)}>
          {hasFilterMatch && (
            <div className="recommendations-filter-match-badge">
              <span>✓</span>
              <span>Matches filters</span>
            </div>
          )}
          
          <div className="recommendations-flip-cover">
            {book.coverUrl ? (
              <img src={book.coverUrl} alt={book.title} onError={(e) => {
                e.target.src = 'https://via.placeholder.com/200x300?text=No+Cover';
              }} />
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

            {book.matchHighlights && book.matchHighlights.length > 0 && (
              <div className="recommendations-flip-matches">
                {book.matchHighlights.slice(0, 2).map((highlight, idx) => (
                  <span key={idx} className="recommendations-flip-match-tag">
                    ✓ {highlight}
                  </span>
                ))}
                {book.matchHighlights.length > 2 && (
                  <span className="recommendations-flip-match-more">
                    +{book.matchHighlights.length - 2} more
                  </span>
                )}
              </div>
            )}

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
              <>
                <button 
                  className="recommendations-flip-btn save"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSave(book);
                  }}
                >
                  ❤️ Save
                </button>
                <button 
                  className="recommendations-flip-btn pass"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReject(book.id);
                  }}
                >
                  Pass
                </button>
              </>
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

export default BookCard;