import React from 'react';
import { FolderPlus, X, Folder, Plus } from 'lucide-react';

const CollectionSelectModal = ({ 
  book, 
  collections, 
  onSelectCollection, 
  onCreateNew, 
  onClose 
}) => {
  return (
    <div className="library-modal-overlay" onClick={onClose}>
      <div className="library-collection-modal" onClick={(e) => e.stopPropagation()}>
        <div className="library-collection-header">
          <div className="library-collection-header-title">
            <FolderPlus className="w-6 h-6 text-blue-600" />
            <h3>Add to Collection</h3>
          </div>
          <button 
            className="library-close-btn"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="library-collection-content">
          <p className="library-collection-subtitle">
            Choose a collection for <strong>{book.title}</strong>
          </p>

          <div className="library-collection-list">
            {collections.length === 0 ? (
              <div className="library-collection-empty">
                <Folder className="w-12 h-12 text-gray-300" />
                <p>No collections yet</p>
              </div>
            ) : (
              collections.map((collection) => (
                <button
                  key={collection.id}
                  className="library-collection-item"
                  onClick={() => onSelectCollection(collection.id)}
                >
                  <div className="library-collection-item-left">
                    <Folder className="w-5 h-5 text-blue-600" />
                    <div>
                      <div className="library-collection-name">{collection.name}</div>
                      <div className="library-collection-count">
                        {collection.bookIds?.length || 0} books
                      </div>
                    </div>
                  </div>
                  {collection.tags && collection.tags.length > 0 && (
                    <div className="library-collection-tags">
                      {collection.tags.slice(0, 2).map((tag, idx) => (
                        <span key={idx} className="library-collection-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>

          <button 
            className="library-create-collection-btn" 
            onClick={onCreateNew}
          >
            <Plus className="w-5 h-5" />
            Create New Collection
          </button>
        </div>
      </div>
    </div>
  );
};

export default CollectionSelectModal;