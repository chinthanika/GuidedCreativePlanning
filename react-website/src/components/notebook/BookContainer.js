// components/notebook/BookContainer.jsx
import { AnimatePresence, motion } from "framer-motion";

export default function BookContainer({ children, currentPageKey }) {
  return (
    <div className="relative w-[800px] h-[600px] bg-[#fdfcf7] shadow-lg border border-[#e0dcd2] overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPageKey}
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -300, opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
