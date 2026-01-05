import React, { useState } from 'react';
import { Star, Trash2, FolderPlus, Heart } from 'lucide-react';

import CreateCollectionModal from './CreateCollectionModal';
import DeleteConfirmModal from './DeleteConfirmationModal';
import CollectionSelectModal from './CollectionSelectModal';

const SavedBookCard = ({ book, onRemove, onMoveToCollection, collections, onCreateCollection }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleRemoveClick = (e) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    onRemove(book.id);
    setShowDeleteConfirm(false);
  };

  const handleMoveToCollection = (e) => {
    e.stopPropagation();
    setShowCollectionModal(true);
  };

  const selectCollection = (collectionId) => {
    onMoveToCollection(book.id, collectionId);
    setShowCollectionModal(false);
  };

  const openCreateModal = () => {
    setShowCollectionModal(false);
    setShowCreateModal(true);
  };

  return (
    <>
      <div className="library-flip-card-wrapper">
        <div className={`library-flip-card-inner ${isFlipped ? 'flipped' : ''}`}>
          {/* Front */}
          <div className="library-flip-card-front" onClick={() => setIsFlipped(true)}>
            <div className="library-flip-cover">
              {book.coverUrl ? (
                <img src={book.coverUrl} alt={book.title} onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/200x300?text=No+Cover';
                }} />
              ) : (
                <div className="text-gray-400 text-4xl">📚</div>
              )}
            </div>

            <div className="library-flip-front-content">
              <h3 className="library-flip-title">{book.title}</h3>
              <p className="library-flip-author">by {book.author || 'Unknown'}</p>

              <div className="library-flip-meta">
                {book.rating && (
                  <div className="library-flip-rating">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span>{book.rating.toFixed(1)}</span>
                  </div>
                )}
                {book.year && (
                  <span className="library-flip-year">{book.year}</span>
                )}
              </div>

              {book.matchHighlights && book.matchHighlights.length > 0 && (
                <div className="library-flip-matches">
                  {book.matchHighlights.slice(0, 2).map((highlight, idx) => (
                    <span key={idx} className="library-flip-match-tag">
                      ✓ {highlight}
                    </span>
                  ))}
                  {book.matchHighlights.length > 2 && (
                    <span className="library-flip-match-more">
                      +{book.matchHighlights.length - 2} more
                    </span>
                  )}
                </div>
              )}

              <div className="library-flip-saved-badge">
                <Heart className="w-4 h-4 fill-red-500 text-red-500" />
                <span>In Library</span>
              </div>
            </div>

            <div className="library-flip-hint">
              Click to see full details →
            </div>
          </div>

          {/* Back */}
          <div className="library-flip-card-back" onClick={() => setIsFlipped(false)}>
            <div className="library-flip-back-content">
              <h3 className="library-flip-back-title">{book.title}</h3>

              {book.description && (
                <div className="library-flip-section">
                  <label>Description</label>
                  <p className="library-flip-description">{book.description}</p>
                </div>
              )}

              {book.explanation && (
                <div className="library-flip-section library-flip-explanation">
                  <label>Why This Book</label>
                  <p>{book.explanation}</p>
                </div>
              )}

              {book.comparisonNote && (
                <div className="library-flip-section library-flip-comparison">
                  <label>Unique Aspect</label>
                  <p>{book.comparisonNote}</p>
                </div>
              )}

              <div className="library-flip-details">
                <div className="library-flip-detail-item">
                  <span>Author:</span>
                  <strong>{book.author || 'Unknown'}</strong>
                </div>
                {book.year && (
                  <div className="library-flip-detail-item">
                    <span>Published:</span>
                    <strong>{book.year}</strong>
                  </div>
                )}
                {book.rating && (
                  <div className="library-flip-detail-item">
                    <span>Rating:</span>
                    <strong>⭐ {book.rating.toFixed(1)}/5</strong>
                  </div>
                )}
              </div>

              {book.categories && book.categories.length > 0 && (
                <div className="library-flip-section">
                  <label>Genres</label>
                  <div className="library-flip-genres">
                    {book.categories.slice(0, 4).map((genre, idx) => (
                      <span key={idx} className="library-flip-genre-tag">
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="library-flip-actions">
              <button 
                className="library-flip-btn move"
                onClick={handleMoveToCollection}
              >
                <FolderPlus className="w-4 h-4" />
                Add to Collection
              </button>
              <button 
                className="library-flip-btn remove"
                onClick={handleRemoveClick}
              >
                <Trash2 className="w-4 h-4" />
                Remove
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <DeleteConfirmModal
          book={book}
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Collection Selection Modal */}
      {showCollectionModal && (
        <CollectionSelectModal
          book={book}
          collections={collections}
          onSelectCollection={selectCollection}
          onCreateNew={openCreateModal}
          onClose={() => setShowCollectionModal(false)}
        />
      )}

      {/* Create Collection Modal */}
      {showCreateModal && (
        <CreateCollectionModal
          onClose={() => setShowCreateModal(false)}
          onCreate={(collectionData) => {
            onCreateCollection(collectionData, book.id);
            setShowCreateModal(false);
          }}
        />
      )}
    </>
  );
};

export default SavedBookCard;