import React, { useEffect, useRef } from 'react';
import { X, ExternalLink, Heart } from 'lucide-react';
import { logUIInteraction, trackFeatureTime } from '../../utils/analytics';

/**
 * BookDetailsModal — tracks:
 *  - view_book_details (on open, includes bookId / relevanceScore)
 *  - view_book_details_complete (on close, includes durationMs)
 */
const BookDetailsModal = ({ isOpen, onClose, book, onSave, onReject, isSaved, userId }) => {
    const stopTrackingRef = useRef(null);

    // ── Start / stop view-time tracking whenever the modal opens or closes ──
    useEffect(() => {
        if (!isOpen || !book || !userId) return;

        // Log that the user opened the modal
        logUIInteraction(userId, 'bookRecs', 'view_book_details', {
            bookId: book.id,
            bookTitle: book.title,
            relevanceScore: book.relevance_score ?? null,
            isSaved
        });

        // Start timing
        stopTrackingRef.current = trackFeatureTime(userId, 'bookRecs', 'view_book_details', {
            bookId: book.id,
            bookTitle: book.title
        });

        return () => {
            // Fire duration log when modal unmounts or book changes
            if (stopTrackingRef.current) {
                stopTrackingRef.current();
                stopTrackingRef.current = null;
            }
        };
    }, [isOpen, book?.id, userId]);   // eslint-disable-line react-hooks/exhaustive-deps

    const handleClose = () => {
        if (stopTrackingRef.current) {
            stopTrackingRef.current();
            stopTrackingRef.current = null;
        }
        onClose();
    };

    const handleSave = () => {
        logUIInteraction(userId, 'bookRecs', 'save_book', {
            bookId: book.id,
            bookTitle: book.title,
            source: 'details_modal'
        });
        onSave(book);
        handleClose();
    };

    const handleReject = () => {
        logUIInteraction(userId, 'bookRecs', 'pass_book', {
            bookId: book.id,
            bookTitle: book.title
        });
        onReject(book.id);
        handleClose();
    };

    if (!isOpen || !book) return null;

    return (
        <div className="recommendations-modal-overlay" onClick={handleClose}>
            <div className="recommendations-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="recommendations-modal-header">
                    <h3>📚 {book.title}</h3>
                    <button className="recommendations-modal-close" onClick={handleClose}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="recommendations-modal-body">
                    {book.coverUrl && (
                        <div className="recommendations-book-cover">
                            <img
                                src={book.coverUrl}
                                alt={book.title}
                                onError={(e) => {
                                    e.target.src = 'https://via.placeholder.com/200x300?text=No+Cover';
                                }}
                            />
                        </div>
                    )}

                    <div className="recommendations-book-info">
                        <div className="recommendations-info-group">
                            <label>Author</label>
                            <p>{book.author || 'Unknown'}</p>
                        </div>

                        {book.rating && (
                            <div className="recommendations-info-group">
                                <label>Rating</label>
                                <p>⭐ {book.rating.toFixed(1)}/5</p>
                            </div>
                        )}

                        {book.year && (
                            <div className="recommendations-info-group">
                                <label>Published</label>
                                <p>{book.year}</p>
                            </div>
                        )}

                        {book.genres && book.genres.length > 0 && (
                            <div className="recommendations-info-group">
                                <label>Genres</label>
                                <div className="recommendations-genres">
                                    {book.genres.map((genre, idx) => (
                                        <span key={idx} className="recommendations-genre-tag">
                                            {genre}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {book.matchHighlights && book.matchHighlights.length > 0 && (
                            <div className="recommendations-info-group">
                                <label>Why It Matches</label>
                                <div className="recommendations-match-highlights">
                                    {book.matchHighlights.map((highlight, idx) => (
                                        <span key={idx} className="recommendations-match-highlight">
                                            ✓ {highlight}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {book.description && (
                            <div className="recommendations-info-group">
                                <label>Description</label>
                                <p className="recommendations-description">{book.description}</p>
                            </div>
                        )}

                        {book.explanation && (
                            <div className="recommendations-info-group recommendations-explanation">
                                <label>Why We Recommend This</label>
                                <p>{book.explanation}</p>
                            </div>
                        )}

                        {book.link && (
                            <a
                                href={book.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="recommendations-external-link"
                                onClick={() => logUIInteraction(userId, 'bookRecs', 'open_external_link', {
                                    bookId: book.id,
                                    source: book.source
                                })}
                            >
                                View on {book.source} <ExternalLink className="w-4 h-4" />
                            </a>
                        )}
                    </div>
                </div>

                <div className="recommendations-modal-actions">
                    {!isSaved ? (
                        <>
                            <button
                                className="recommendations-modal-btn recommendations-btn-save"
                                onClick={handleSave}
                            >
                                <Heart className="w-4 h-4" />
                                Save Book
                            </button>
                            <button
                                className="recommendations-modal-btn recommendations-btn-reject"
                                onClick={handleReject}
                            >
                                Pass
                            </button>
                        </>
                    ) : (
                        <button
                            className="recommendations-modal-btn recommendations-btn-saved"
                            disabled
                        >
                            <Heart className="w-4 h-4 fill-current" />
                            Saved to Library
                        </button>
                    )}
                    <button
                        className="recommendations-modal-btn recommendations-btn-cancel"
                        onClick={handleClose}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BookDetailsModal;