import React, { useState } from 'react';
import { Star, Heart, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

const BookCard = ({ book, onSave, onReject, isSaved, flippedCard, onFlip }) => {
  const isFlipped = flippedCard === book.id;

  return (
    <div 
      className="recommendations-flip-card-wrapper"
      onClick={() => onFlip(book.id)}
    >
      <div className={`recommendations-flip-card-inner ${isFlipped ? 'flipped' : ''}`}>
        {/* Front of Card */}
        <div className="recommendations-flip-card-front">
          {book.coverUrl && (
            <div className="recommendations-flip-cover">
              <img 
                src={book.coverUrl} 
                alt={`${book.title} cover`}
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/120x180?text=No+Cover';
                }}
              />
            </div>
          )}
          
          <div className="recommendations-flip-front-content">
            <h4 className="recommendations-flip-title">{book.title}</h4>
            <p className="recommendations-flip-author">by {book.author}</p>
            
            {(book.rating || book.year) && (
              <div className="recommendations-flip-meta">
                {book.rating && (
                  <div className="recommendations-flip-rating">
                    <Star className="w-4 h-4 fill-current" />
                    <span>{book.rating.toFixed(1)}</span>
                  </div>
                )}
                {book.year && <span className="recommendations-flip-year">{book.year}</span>}
              </div>
            )}

            {book.matchHighlights && book.matchHighlights.length > 0 && (
              <div className="recommendations-flip-matches">
                {book.matchHighlights.slice(0, 3).map((theme, idx) => (
                  <span key={idx} className="recommendations-flip-match-tag">
                    ✓ {theme}
                  </span>
                ))}
                {book.matchHighlights.length > 3 && (
                  <span className="recommendations-flip-match-more">
                    +{book.matchHighlights.length - 3} more
                  </span>
                )}
              </div>
            )}

            {isSaved && (
              <div className="recommendations-flip-saved-badge">
                <Heart className="w-3 h-3 fill-current" />
                Saved
              </div>
            )}
          </div>

          <div className="recommendations-flip-hint">
            Click to see details →
          </div>
        </div>

        {/* Back of Card */}
        <div className="recommendations-flip-card-back">
          <div className="recommendations-flip-back-content">
            <h4 className="recommendations-flip-back-title">{book.title}</h4>
            
            {book.description && (
              <div className="recommendations-flip-section">
                <label>Description</label>
                <p className="recommendations-flip-description">{book.description}</p>
              </div>
            )}

            {book.explanation && (
              <div className="recommendations-flip-section recommendations-flip-explanation">
                <label>Why We Recommend This</label>
                <p>{book.explanation}</p>
              </div>
            )}

            {book.comparisonNote && (
              <div className="recommendations-flip-section recommendations-flip-comparison">
                <label>Why This Stands Out</label>
                <p>{book.comparisonNote}</p>
              </div>
            )}

            {book.genres && book.genres.length > 0 && (
              <div className="recommendations-flip-section">
                <label>Genres</label>
                <div className="recommendations-flip-genres">
                  {book.genres.map((genre, idx) => (
                    <span key={idx} className="recommendations-flip-genre-tag">
                      {genre}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {book.link && (
              <a 
                href={book.link} 
                target="_blank" 
                rel="noopener noreferrer"
                className="recommendations-flip-link"
                onClick={(e) => e.stopPropagation()}
              >
                View on {book.source} <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>

          <div className="recommendations-flip-actions">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSave(book);
              }}
              disabled={isSaved}
              className={`recommendations-flip-btn ${isSaved ? 'saved' : 'save'}`}
            >
              <Heart className="w-4 h-4" />
              {isSaved ? 'Saved' : 'Save Book'}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReject(book.id);
              }}
              className="recommendations-flip-btn pass"
            >
              Pass
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookCard;