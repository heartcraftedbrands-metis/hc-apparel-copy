import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertTriangle, ImageOff } from 'lucide-react';

export default function DraftProductBuilder({ onBuildComplete }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleBuild = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await base44.functions.invoke('buildDraftProductsFromGarments', {});
      const data = response?.data ?? response;

      if (data?.error) {
        setError(data.error + (data.hint ? `\n\n💡 ${data.hint}` : ''));
        return;
      }

      setResult(data);
      if (onBuildComplete) onBuildComplete(data);
    } catch (err) {
      const respData = err?.response?.data;
      setError(respData?.error || err.message || 'Build failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
      <div>
        <h3 className="text-lg font-bold mb-1">Build Draft Products</h3>
        <p className="text-sm text-muted-foreground">
          Group imported garment variants into draft products by brand, style number, and name.
        </p>
      </div>

      {error && (
        <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="whitespace-pre-wrap">{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-3 p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <div className="flex gap-2 items-center">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span className="font-semibold">Draft products built successfully</span>
          </div>

          <div className="ml-6 space-y-1 text-xs font-mono">
            <p>Draft products created: <strong>{result.draft_products_created}</strong></p>
            <p>Draft products updated: <strong>{result.draft_products_updated}</strong></p>
            <p>Variants grouped: <strong>{result.variants_grouped}</strong></p>
            <p>Products missing images: <strong>{result.products_missing_images}</strong></p>
            <p>Products ready for image repair: <strong>{result.products_ready_for_image_repair}</strong></p>
            <p>Products published: <strong>0</strong></p>
            <p>Public products unchanged: <strong>{result.public_products_unchanged ? 'yes ✓' : `NO — was ${result.public_products_before}, now ${result.public_products_after}`}</strong></p>
            <p>Launch QA still Ready for Monday: <strong>{result.launch_qa_still_ready ? 'yes ✓' : 'check public products'}</strong></p>
          </div>

          {result.products_created_names?.length > 0 && (
            <div className="ml-6 text-xs">
              <p className="font-semibold text-green-700 mb-1">Created:</p>
              {result.products_created_names.map((n, i) => <p key={i} className="text-green-700">+ {n}</p>)}
            </div>
          )}

          {result.products_updated_names?.length > 0 && (
            <div className="ml-6 text-xs">
              <p className="font-semibold text-green-700 mb-1">Updated:</p>
              {result.products_updated_names.map((n, i) => <p key={i} className="text-green-700">↻ {n}</p>)}
            </div>
          )}

          {result.missing_image_names?.length > 0 && (
            <div className="ml-6 text-xs">
              <div className="flex items-center gap-1 text-amber-700 font-semibold mb-1">
                <ImageOff className="w-3 h-3" />
                Missing images (use Step 3b to repair):
              </div>
              {result.missing_image_names.map((n, i) => <p key={i} className="text-amber-700">⚠ {n}</p>)}
            </div>
          )}

          {result.errors?.length > 0 && (
            <div className="ml-6 text-xs text-red-700">
              <p className="font-semibold mb-1">Errors:</p>
              {result.errors.map((e, i) => <p key={i}>✗ {e}</p>)}
            </div>
          )}
        </div>
      )}

      <Button onClick={handleBuild} disabled={loading} size="lg" className="w-full">
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Building draft products…
          </>
        ) : (
          'Build Draft Products'
        )}
      </Button>
    </div>
  );
}