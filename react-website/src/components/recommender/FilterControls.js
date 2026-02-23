import React from 'react';
import { Info, RefreshCw, Loader2 } from 'lucide-react';
import { logUIInteraction } from '../../utils/analytics';

/**
 * FilterControls — tracks:
 *  - filter_change  (each time a filter value changes, with field + value)
 *  - filter_apply   (when user clicks Apply Filters)
 *  - filter_clear   (when user clears all filters)
 */
const FilterControls = ({
    filters,
    onChange,
    onApply,
    onClear,
    hasChanges,
    isLoading,
    userId          // pass userId from parent so logging works without an auth hook here
}) => {

    const handleFilterChange = (field, value) => {
        onChange({ ...filters, [field]: value });
        if (userId) {
            logUIInteraction(userId, 'bookRecs', 'filter_change', { field, value });
        }
    };

    const handleApply = () => {
        if (hasChanges && !isLoading) {
            if (userId) {
                logUIInteraction(userId, 'bookRecs', 'filter_apply', {
                    ageRange: filters.ageRange,
                    pubDate: filters.pubDate,
                    minRating: filters.minRating
                });
            }
            onApply();
        }
    };

    const handleClear = () => {
        if (userId) {
            logUIInteraction(userId, 'bookRecs', 'filter_clear', {
                previousFilters: { ...filters }
            });
        }
        onClear();
    };

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
                        onChange={(e) => handleFilterChange('ageRange', e.target.value)}
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
                        onChange={(e) => handleFilterChange('pubDate', e.target.value)}
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
                        onChange={(e) => handleFilterChange('minRating', parseFloat(e.target.value))}
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
                    onClick={handleApply}
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
                    onClick={handleClear}
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