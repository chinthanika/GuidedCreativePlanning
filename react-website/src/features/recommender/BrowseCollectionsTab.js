import React from 'react';

const BrowseCollectionsTab = () => {
  const collections = [
    { id: 'coming_of_age', name: 'Coming of Age', count: 20, color: 'from-amber-400 to-orange-500' },
    { id: 'fantasy', name: 'Fantasy Worldbuilding', count: 20, color: 'from-purple-400 to-pink-500' },
    { id: 'unreliable', name: 'Unreliable Narrators', count: 15, color: 'from-blue-400 to-cyan-500' },
    { id: 'dystopian', name: 'Dystopian Societies', count: 15, color: 'from-red-400 to-pink-500' },
  ];

  return (
    <div className="p-3 space-y-3">
      {collections.map((col) => (
        <div
          key={col.id}
          className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
        >
          <div className={`h-16 bg-gradient-to-r ${col.color} p-3 flex items-end`}>
            <h4 className="text-white font-bold text-sm drop-shadow-md">{col.name}</h4>
          </div>
          <div className="p-3 flex items-center justify-between">
            <span className="text-xs text-gray-500">{col.count} books</span>
            <span className="text-xs text-blue-600 font-medium">Explore →</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default BrowseCollectionsTab;