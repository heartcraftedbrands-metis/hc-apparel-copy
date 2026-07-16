import React, { useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

// Simple depth map — deeper paths slide in from right, going back slides from left
const getDepth = (pathname) => {
  if (pathname === '/' || pathname === '/Home') return 0;
  return pathname.split('/').filter(Boolean).length;
};

const variants = {
  enter: (dir) => ({
    x: dir > 0 ? '100%' : '-100%',
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({
    x: dir > 0 ? '-100%' : '100%',
    opacity: 0,
  }),
};

export default function RouteTransition({ children }) {
  const location = useLocation();
  const prevDepth = useRef(getDepth(location.pathname));
  const currentDepth = getDepth(location.pathname);
  const direction = currentDepth - prevDepth.current;
  prevDepth.current = currentDepth;

  return (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.div
        key={location.pathname}
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.22, ease: 'easeInOut' }}
        className="w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}