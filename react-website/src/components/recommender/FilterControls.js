import React from 'react';
import { Info, RefreshCw, Loader2 } from 'lucide-react';

const FilterControls = ({ 
  filters, 
  onChange, 
  onApply, 
  onClear, 
  hasChanges, 
  isLoading 
}) => {
  return (
    <div className="filter-controls-container">
      <div className="filter-controls-header">
        <Info className="filter-controls-icon" />
        <div className="filter-controls-header-text">
          <p className="filter-controls-title">Set Your Preferences</p>
          <p className="filter-controls-subtitle">
            Books matching your preferences will be ranked higher
          </p>
        </div>
      </div>
      
      <div className="filter-controls-grid">
        <div className="filter-control-group">
          <label>Reading Level</label>
          <select
            value={filters.ageRange}
            onChange={(e) => onChange({ ...filters, ageRange: e.target.value })}
            disabled={isLoading}
          >
            <option value="any">Any Level</option>
            <option value="8-12">Middle Grade (8-12)</option>
            <option value="12-16">Young Adult (12-16)</option>
            <option value="16-18">Mature YA (16-18)</option>
          </select>
        </div>

        <div className="filter-control-group">
          <label>Publication Period</label>
          <select
            value={filters.pubDate}
            onChange={(e) => onChange({ ...filters, pubDate: e.target.value })}
            disabled={isLoading}
          >
            <option value="any">Any Time</option>
            <option value="last5">Recent (Last 5 years)</option>
            <option value="last10">Modern (Last 10 years)</option>
            <option value="classic">Classics (20+ years)</option>
          </select>
        </div>

        <div className="filter-control-group">
          <label>Minimum Rating</label>
          <select
            value={filters.minRating}
            onChange={(e) => onChange({ ...filters, minRating: parseFloat(e.target.value) })}
            disabled={isLoading}
          >
            <option value="0">Any Rating</option>
            <option value="3.5">3.5+ Stars</option>
            <option value="4.0">4.0+ Stars</option>
            <option value="4.5">4.5+ Stars</option>
          </select>
        </div>
      </div>

      <div className="filter-controls-actions">
        <button
          onClick={onApply}
          disabled={!hasChanges || isLoading}
          className={`filter-apply-btn ${hasChanges && !isLoading ? 'active' : 'inactive'}`}
        >
          {isLoading ? (
            <>
              <Loader2 className="filter-btn-icon spinning" />
              <span>Applying...</span>
            </>
          ) : (
            <>
              <RefreshCw className="filter-btn-icon" />
              <span>{hasChanges ? 'Apply Filters' : 'No Changes'}</span>
            </>
          )}
        </button>
        
        <button
          onClick={onClear}
          disabled={isLoading}
          className="filter-clear-btn"
        >
          Clear
        </button>
      </div>

      {hasChanges && !isLoading && (
        <p className="filter-change-notice">
          Click "Apply Filters" to see updated recommendations
        </p>
      )}
    </div>
  );
};

export default FilterControls;