import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function StripePaymentStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await base44.functions.invoke('getStripeStatus', {});
        setStatus(response.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    checkStatus();
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl p-5 border border-border bg-white">
        <div className="flex items-center gap-2 mb-4">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <p className="text-sm font-bold">Stripe Payment Status</p>
        </div>
        <p className="text-xs text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl p-5 border border-border bg-white">
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <p className="text-sm font-bold">Stripe Payment Status</p>
        </div>
        <p className="text-xs text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl p-5 border bg-white ${status?.checkout_enabled ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}`}>
      <div className="flex items-center gap-2 mb-4">
        {status?.checkout_enabled ? (
          <CheckCircle2 className="w-4 h-4 text-green-700" />
        ) : (
          <AlertCircle className="w-4 h-4 text-yellow-700" />
        )}
        <p className="text-sm font-bold">{status?.checkout_enabled ? 'Stripe Ready' : 'Stripe Setup Incomplete'}</p>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Stripe Mode:</span>
          <span className={`font-semibold px-2 py-0.5 rounded-full ${status?.mode === 'Test' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
            {status?.mode || 'Unknown'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Publishable Key:</span>
          <span className={`font-mono ${status?.publishable_key_detected ? 'text-green-700' : 'text-red-600'}`}>
            {status?.publishable_key_detected ? '✓ Configured' : '✗ Missing'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Secret Key:</span>
          <span className={`font-mono ${status?.secret_key_detected ? 'text-green-700' : 'text-red-600'}`}>
            {status?.secret_key_detected ? '✓ Configured' : '✗ Missing'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Webhook:</span>
          <span className={`font-mono ${status?.webhook_configured ? 'text-green-700' : 'text-yellow-700'}`}>
            {status?.webhook_configured ? '✓ Enabled' : '⚠ Check Config'}
          </span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-current border-opacity-10">
          <span className="text-muted-foreground font-medium">Checkout Enabled:</span>
          <span className={`font-bold ${status?.checkout_enabled ? 'text-green-700' : 'text-red-600'}`}>
            {status?.checkout_enabled ? '✓ Yes' : '✗ No'}
          </span>
        </div>
      </div>

      {status?.mode === 'Test' && (
        <div className="mt-3 p-2 bg-amber-100 text-amber-800 rounded text-xs border border-amber-300">
          🧪 <strong>Test Mode Active</strong> — Use card <code>4242 4242 4242 4242</code> for testing
        </div>
      )}
    </div>
  );
}