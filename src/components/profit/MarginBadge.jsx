import React from 'react';
import { AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

export function getMarginStatus(margin) {
  if (margin >= 35) return { label: 'Healthy Margin', color: 'bg-green-100 text-green-800 border-green-200', icon: 'up', bar: 'bg-green-500' };
  if (margin >= 20) return { label: 'Moderate Margin', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: 'warn', bar: 'bg-yellow-400' };
  return { label: 'Low Margin — Review Pricing', color: 'bg-red-100 text-red-800 border-red-200', icon: 'down', bar: 'bg-red-500' };
}

export default function MarginBadge({ margin, showIcon = true, size = 'md' }) {
  const status = getMarginStatus(margin);
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold border ${status.color} ${sizeClass}`}>
      {showIcon && (
        status.icon === 'up' ? <TrendingUp className="w-3 h-3" /> :
        status.icon === 'warn' ? <AlertTriangle className="w-3 h-3" /> :
        <TrendingDown className="w-3 h-3" />
      )}
      {status.label}
    </span>
  );
}