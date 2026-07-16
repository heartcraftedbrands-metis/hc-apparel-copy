import React, { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const THRESHOLD = 72; // px to pull before triggering

export default function PullToRefresh({ onRefresh, children }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const containerRef = useRef(null);

  const canPull = () => {
    const el = containerRef.current;
    return el ? el.scrollTop === 0 : true;
  };

  const handleTouchStart = (e) => {
    if (!canPull()) return;
    startY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e) => {
    if (startY.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.5, THRESHOLD + 20));
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(THRESHOLD);
      await onRefresh?.();
      setRefreshing(false);
    }
    setPullDistance(0);
    startY.current = null;
  };

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const showIndicator = pullDistance > 8;

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      {showIndicator && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10 flex items-center justify-center transition-all"
          style={{ top: pullDistance - 36 }}
        >
          <div className={`w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center border border-gray-200 ${refreshing ? 'animate-spin' : ''}`}>
            <RefreshCw
              className="w-4 h-4 text-gray-500"
              style={{ transform: `rotate(${progress * 360}deg)` }}
            />
          </div>
        </div>
      )}
      <div style={{ transform: `translateY(${pullDistance}px)`, transition: pullDistance === 0 ? 'transform 0.3s ease' : 'none' }}>
        {children}
      </div>
    </div>
  );
}