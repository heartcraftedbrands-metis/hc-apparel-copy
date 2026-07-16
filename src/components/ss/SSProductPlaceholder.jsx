import React from 'react';
import { Package } from 'lucide-react';

/**
 * Placeholder image for S&S products without an image URL.
 * Shows a branded placeholder with HC Apparel colors.
 */
export default function SSProductPlaceholder({ brand, styleNumber, size = 'md' }) {
  const sizeMap = {
    sm: 'w-10 h-10 text-sm',
    md: 'w-full h-full text-base',
    lg: 'w-full h-full text-lg',
  };

  return (
    <div className={`${sizeMap[size]} bg-gradient-to-br from-[#4A5E2A] to-[#3a4620] flex flex-col items-center justify-center text-cream/90`}>
      <Package className="w-1/3 h-1/3 text-[#E8A910] mb-1 opacity-80" />
      <p className="text-xs font-semibold text-center px-1">Image Coming Soon</p>
      {(brand || styleNumber) && (
        <p className="text-xs text-cream/60 mt-1 text-center px-1">
          {[brand, styleNumber].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}