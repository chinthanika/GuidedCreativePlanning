// components/notebook/BookContainer.jsx
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function BookContainer({
  children,
  currentPageKey,
  direction = 1,
  onNext,
  onPrev,
  pageNumber,
  totalPages,
}) {
  return (
    <div className="notebook-container">
      <div className="notebook-book relative">
        {/* Left Arrow */}
        {onPrev && (
          <button
            onClick={onPrev}
            className="notebook-arrow left"
          >
            <ArrowLeft size={24} />
          </button>
        )}

        {/* Page Viewport */}
        <div className="notebook-viewport">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentPageKey || "fallback"}
              initial={{ x: direction === 1 ? "100%" : "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: direction === 1 ? "-100%" : "100%", opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="notebook-page"
            >
              {children || <div>No content</div>}
              <div className="notebook-page-number">
                {pageNumber} / {totalPages}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right Arrow */}
        {onNext && (
          <button
            onClick={onNext}
            className="notebook-arrow right"
          >
            <ArrowRight size={24} />
          </button>
        )}
      </div>
    </div>
  );
}
