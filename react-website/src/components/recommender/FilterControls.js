import React from 'react';

const FilterControls = ({ filters, onChange }) => {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Age Range</label>
        <select
          value={filters.ageRange}
          onChange={(e) => onChange({ ...filters, ageRange: e.target.value })}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
        >
          <option value="any">Any Age</option>
          <option value="8-12">8-12 years</option>
          <option value="12-16">12-16 years</option>
          <option value="16-18">16-18 years</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Published</label>
        <select
          value={filters.pubDate}
          onChange={(e) => onChange({ ...filters, pubDate: e.target.value })}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
        >
          <option value="any">Any Time</option>
          <option value="last5">Last 5 years</option>
          <option value="last10">Last 10 years</option>
          <option value="classic">Classics (20+ years)</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Min Rating</label>
        <select
          value={filters.minRating}
          onChange={(e) => onChange({ ...filters, minRating: parseFloat(e.target.value) })}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
        >
          <option value="0">Any Rating</option>
          <option value="3.5">3.5+ Stars</option>
          <option value="4.0">4.0+ Stars</option>
          <option value="4.5">4.5+ Stars</option>
        </select>
      </div>
    </div>
  );
};

export default FilterControls;