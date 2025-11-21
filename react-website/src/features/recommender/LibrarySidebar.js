import React, { useState, useEffect } from 'react';
import { Library, X, ExternalLink, Star, Trash2 } from 'lucide-react';

const LibrarySidebar = ({ 
  userId, 
  sessionId, 
  savedBooks, 
  onBookRemoved,
  isVisible 
}) => {
  const [books, setBooks] = useState(savedBooks || []);
  const [selectedBook, setSelectedBook] = useState(null);

  // Update local state when prop changes
  useEffect(() => {
    setBooks(savedBooks || []);
  }, [savedBooks]);

  const handleRemoveBook = async (bookId) => {
    // Optimistic update
    setBooks(prev => prev.filter(b => b.id !== bookId));
    
    try {
      // Call your remove API endpoint (you'll need to create this)
      const API_BASE = process.env.REACT_APP_AI_SERVER_URL || "http://localhost:5000";
      await fetch(`${API_BASE}/api/book-recommendations/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, sessionId, bookId })
      });
      
      // Notify parent component
      if (onBookRemoved) {
        onBookRemoved(bookId);
      }
    } catch (err) {
      console.error('Failed to remove book:', err);
      // Revert on error
      setBooks(savedBooks);
    }
  };

  if (!isVisible || books.length === 0) {
    return (
      <div className="border-t border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 p-6 text-center">
        <Library className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-600 font-medium mb-1">No saved books yet</p>
        <p className="text-xs text-gray-500">
          Click the heart icon on any book to save it to your library
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Library className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Your Library</h3>
              <p className="text-xs text-gray-600">{books.length} saved book{books.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Book Grid */}
      <div className="p-6 max-h-96 overflow-y-auto">
        <div className="grid grid-cols-1 gap-3">
          {books.map((book) => (
            <div 
              key={book.id}
              className="bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all p-3 cursor-pointer"
              onClick={() => setSelectedBook(book)}
            >
              <div className="flex gap-3">
                {/* Cover */}
                <div className="flex-shrink-0">
                  {book.coverUrl ? (
                    <img 
                      src={book.coverUrl}
                      alt={book.title}
                      className="w-16 h-24 object-cover rounded shadow-sm"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = 'https://via.placeholder.com/64x96?text=No+Cover';
                      }}
                    />
                  ) : (
                    <div className="w-16 h-24 bg-gradient-to-br from-gray-200 to-gray-300 rounded flex items-center justify-center">
                      <Library className="w-6 h-6 text-gray-400" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm text-gray-900 line-clamp-2 mb-1">
                    {book.title}
                  </h4>
                  <p className="text-xs text-gray-600 mb-2">{book.author}</p>
                  
                  {/* Metadata */}
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {book.rating && (
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                        <span className="font-medium">{book.rating}</span>
                      </div>
                    )}
                    {book.year && (
                      <span>• {book.year}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveBook(book.id);
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    title="Remove from library"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Book Detail Modal */}
      {selectedBook && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedBook(null)}
        >
          <div 
            className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-lg text-gray-900">Book Details</h3>
              <button
                onClick={() => setSelectedBook(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              {/* Cover & Title */}
              <div className="flex gap-4">
                {selectedBook.coverUrl && (
                  <img 
                    src={selectedBook.coverUrl}
                    alt={selectedBook.title}
                    className="w-32 h-48 object-cover rounded-lg shadow-lg"
                  />
                )}
                <div className="flex-1">
                  <h4 className="font-bold text-xl text-gray-900 mb-2">
                    {selectedBook.title}
                  </h4>
                  <p className="text-gray-700 mb-3">{selectedBook.author}</p>
                  
                  <div className="flex flex-wrap gap-2 text-sm">
                    {selectedBook.rating && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-yellow-50 rounded">
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        <span className="font-semibold">{selectedBook.rating}</span>
                      </div>
                    )}
                    {selectedBook.year && (
                      <span className="px-2 py-1 bg-gray-100 rounded text-gray-700">
                        {selectedBook.year}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              {selectedBook.description && (
                <div>
                  <h5 className="font-semibold text-sm text-gray-700 mb-2">Description</h5>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {selectedBook.description}
                  </p>
                </div>
              )}

              {/* Explanation */}
              {selectedBook.explanation && (
                <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded">
                  <h5 className="font-semibold text-sm text-amber-900 mb-2">
                    Why this book matches your story
                  </h5>
                  <p className="text-sm text-amber-800 leading-relaxed italic">
                    {selectedBook.explanation}
                  </p>
                </div>
              )}

              {/* Categories */}
              {selectedBook.categories && selectedBook.categories.length > 0 && (
                <div>
                  <h5 className="font-semibold text-sm text-gray-700 mb-2">Genres</h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedBook.categories.map((cat, idx) => (
                      <span 
                        key={idx}
                        className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    handleRemoveBook(selectedBook.id);
                    setSelectedBook(null);
                  }}
                  className="flex-1 px-4 py-2.5 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove from Library
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LibrarySidebar;