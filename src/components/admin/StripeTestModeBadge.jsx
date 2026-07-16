import React from 'react';
import { AlertCircle } from 'lucide-react';

export default function StripeTestModeBadge() {
  // Frontend component cannot access server env; assume test mode for now
  // Will only show if explicitly added to admin pages
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-full text-xs font-semibold text-yellow-800">
      <AlertCircle className="w-3.5 h-3.5" />
      Stripe Test Mode
    </div>
  );
}