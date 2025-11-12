import React from 'react';
import { Library, ChevronDown, ChevronUp } from 'lucide-react';

const LibrarySidebar = ({ savedBooks, isOpen, onToggle }) => {
  return (
    <div className="border-t border-gray-200 bg-gray-50">
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Library className="w-4 h-4 text-gray-600" />
          <span className="font-medium text-sm text-gray-900">
            Saved Books ({savedBooks.length})
          </span>
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="px-3 pb-3 max-h-48 overflow-y-auto space-y-2">
          {savedBooks.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">No saved books yet</p>
          ) : (
            savedBooks.map((book) => (
              <div key={book.id} className="flex items-center gap-2 p-2 bg-white rounded border">
                <img 
                  src={book.coverUrl} 
                  alt={book.title} 
                  className="w-8 h-12 object-cover rounded" 
                  onError={(e) => e.target.src = 'https://via.placeholder.com/32x48'} 
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{book.title}</p>
                  <p className="text-xs text-gray-600 truncate">{book.author}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default LibrarySidebar;