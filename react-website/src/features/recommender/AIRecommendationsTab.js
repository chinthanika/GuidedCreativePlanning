import React, { useState, useEffect } from 'react';
import { BookOpen, Star, Heart, X, Filter, ChevronDown, ChevronUp, Loader2, AlertCircle, Sparkles, Library, Search } from 'lucide-react';
import LoadingState from '../../components/recommender/LoadingState';
import FilterControls from '../../components/recommender/FilterControls';
import BookCard from './BookCard';

// ============================================
// AI RECOMMENDATIONS TAB
// ============================================
const AIRecommendationsTab = ({
  books,
  loading,
  error,
  extractedThemes,
  filters,
  onFilterChange,
  onSaveBook,
  onRejectBook,
  savedBookIds
}) => {
  const [showFilters, setShowFilters] = useState(false);

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-red-600 font-medium mb-2">Failed to load recommendations</p>
        <p className="text-sm text-gray-600">{error}</p>
      </div>
    );
  }

  if (books.length === 0) {
    return (
      <div className="p-8 text-center">
        <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Ready to discover books?
        </h3>
        <p className="text-sm text-gray-600 max-w-xs mx-auto">
          Chat about your story idea for a few more turns, then click "Get Recommendations" to find relevant books.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Extracted Themes Display */}
      {extractedThemes && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            Based on your conversation:
          </h3>
          <div className="flex flex-wrap gap-2 mb-2">
            {extractedThemes.themes?.slice(0, 5).map((theme, idx) => (
              <span
                key={idx}
                className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium"
              >
                {theme}
              </span>
            ))}
          </div>
          {extractedThemes.genre && (
            <p className="text-xs text-gray-600">
              Genre: <span className="font-medium">{extractedThemes.genre}</span>
            </p>
          )}
        </div>
      )}

      {/* Filters Toggle */}
      <button
        onClick={() => setShowFilters(!showFilters)}
        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">Filters</span>
        </div>
        {showFilters ? (
          <ChevronUp className="w-4 h-4 text-gray-600" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-600" />
        )}
      </button>

      {/* Filter Controls */}
      {showFilters && (
        <FilterControls filters={filters} onChange={onFilterChange} />
      )}

      {/* Book Cards */}
      <div className="space-y-4">
        {books.map((book) => (
          <BookCard
            key={book.id}
            book={book}
            onSave={onSaveBook}
            onReject={onRejectBook}
            isSaved={savedBookIds.includes(book.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default AIRecommendationsTab;