import React, { forwardRef } from "react";

const Page = forwardRef(({ title, children }, ref) => {
  return (
    <div
      ref={ref}
      className="relative p-10 bg-amber-50 shadow-inner h-full w-full font-serif"
    >
      {title && (
        <div className="text-center mb-8 border-b border-gray-400 pb-2">
          <h1 className="text-2xl font-bold tracking-wide">{title}</h1>
        </div>
      )}
      <div className="prose max-w-none">{children}</div>
    </div>
  );
});

export default Page;
