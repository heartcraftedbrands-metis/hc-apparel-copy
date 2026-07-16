import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, CheckCircle2, ImageOff } from 'lucide-react';

export default function RepairDraftImages({ onRepairComplete }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleRepair = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await base44.functions.invoke('repairAndQADraftProducts', {});
      const data = response?.data ?? response;

      if (data?.error) {
        setError(data.error);
        return;
      }

      setResult(data);
      if (onRepairComplete) onRepairComplete(data.products_repaired || 0);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Repair failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
      <div>
        <h3 className="text-lg font-bold mb-1">Repair Images & Run QA</h3>
        <p className="text-sm text-muted-foreground">
          Repairs missing images from the garment catalog, then runs full QA on all draft products.
        </p>
      </div>

      {error && (
        <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {/* Image Repair Summary */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <p className="font-semibold mb-2">Image Repair Results</p>
            <div className="text-xs font-mono space-y-1 ml-2">
              <p>Draft products scanned: <strong>{result.draft_products_scanned}</strong></p>
              <p>Products repaired: <strong>{result.products_repaired}</strong></p>
              <p>Variant images repaired: <strong>{result.variant_images_repaired}</strong></p>
              <p>Product fallback images set: <strong>{result.product_fallback_images_set}</strong></p>
              <p>Products still missing images: <strong>{result.products_still_missing_images}</strong></p>
            </div>
            {result.repaired_names?.length > 0 && (
              <div className="mt-2 text-xs ml-2 text-blue-700">
                <p className="font-semibold">Repaired:</p>
                {result.repaired_names.map((n, i) => <p key={i}>✓ {n}</p>)}
              </div>
            )}
            {result.missing_image_names?.length > 0 && (
              <div className="mt-2 text-xs ml-2 text-amber-700">
                <div className="flex items-center gap-1 font-semibold"><ImageOff className="w-3 h-3" /> Still missing:</div>
                {result.missing_image_names.map((n, i) => <p key={i}>⚠ {n}</p>)}
              </div>
            )}
          </div>

          {/* QA Summary */}
          <div className={`p-4 border rounded-lg text-sm ${result.products_failed_qa === 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-orange-50 border-orange-200 text-orange-800'}`}>
            <div className="flex items-center gap-2 font-semibold mb-2">
              <CheckCircle2 className="w-4 h-4" />
              QA Results
            </div>
            <div className="text-xs font-mono space-y-1 ml-2">
              <p>Products passed QA: <strong>{result.products_passed_qa}</strong></p>
              <p>Products failed QA: <strong>{result.products_failed_qa}</strong></p>
              <p>Products ready for approval: <strong>{result.products_ready_for_approval}</strong></p>
              <p>Products still missing images: <strong>{result.products_still_missing_images}</strong></p>
              <p>Critical issues: <strong>{result.critical_issues?.length ?? 0}</strong></p>
              <p>Non-critical issues: <strong>{result.non_critical_issues?.length ?? 0}</strong></p>
              <p>Products published: <strong>0</strong></p>
              <p>Public products unchanged: <strong>{result.public_products_unchanged ? `yes ✓ (${result.public_product_count})` : 'NO — check immediately'}</strong></p>
              <p>Launch QA still Ready for Monday: <strong>{result.launch_qa_still_ready ? 'yes ✓' : 'check public products'}</strong></p>
            </div>

            {result.passed_names?.length > 0 && (
              <div className="mt-2 text-xs ml-2 text-green-700">
                <p className="font-semibold">Passed:</p>
                {result.passed_names.map((n, i) => <p key={i}>✓ {n}</p>)}
              </div>
            )}

            {result.failed_names?.length > 0 && (
              <div className="mt-2 text-xs ml-2 text-red-700">
                <p className="font-semibold">Failed:</p>
                {result.failed_names.map((n, i) => <p key={i}>✗ {n}</p>)}
              </div>
            )}
          </div>

          {result.critical_issues?.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <p className="font-semibold mb-1">Critical Issues:</p>
              {result.critical_issues.map((c, i) => <p key={i}>✗ {c}</p>)}
            </div>
          )}

          {result.non_critical_issues?.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <p className="font-semibold mb-1">Non-Critical Issues:</p>
              {result.non_critical_issues.map((nc, i) => <p key={i}>⚠ {nc}</p>)}
            </div>
          )}
        </div>
      )}

      <Button onClick={handleRepair} disabled={loading} size="lg" className="w-full" variant="outline">
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Repairing & Running QA…
          </>
        ) : (
          'Repair Images & Run QA'
        )}
      </Button>
    </div>
  );
}