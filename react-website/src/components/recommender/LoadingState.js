import React from 'react';

const LoadingState = () => {
  return (
    <div className="p-3 space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-lg p-3 animate-pulse">
          <div className="flex gap-3">
            <div className="w-16 h-24 bg-gray-200 rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
              <div className="h-3 bg-gray-200 rounded w-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default LoadingState;