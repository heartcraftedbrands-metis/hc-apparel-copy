import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';

export default function ProductQARunner({ onQAComplete }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleRunQA = async () => {
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
      if (onQAComplete) onQAComplete({
        total_checked: data.draft_products_scanned,
        passed: data.products_passed_qa,
        failed: data.products_failed_qa,
      });
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'QA failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
      <div>
        <h3 className="text-lg font-bold mb-1">Run Product QA</h3>
        <p className="text-sm text-muted-foreground">
          Validates all draft products: name, brand, style number, images, variants, pricing, and public safety.
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
          <div className={`p-4 border rounded-lg text-sm ${result.products_failed_qa === 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-orange-50 border-orange-200 text-orange-800'}`}>
            <div className="flex items-center gap-2 font-semibold mb-2">
              <CheckCircle2 className="w-4 h-4" />
              QA Summary
            </div>
            <div className="text-xs font-mono space-y-1 ml-2">
              <p>Draft products scanned: <strong>{result.draft_products_scanned}</strong></p>
              <p>Products passed QA: <strong>{result.products_passed_qa}</strong></p>
              <p>Products failed QA: <strong>{result.products_failed_qa}</strong></p>
              <p>Products ready for approval: <strong>{result.products_ready_for_approval}</strong></p>
              <p>Products still missing images: <strong>{result.products_still_missing_images}</strong></p>
              <p>Critical issues: <strong>{result.critical_issues?.length ?? 0}</strong></p>
              <p>Non-critical issues: <strong>{result.non_critical_issues?.length ?? 0}</strong></p>
              <p>Products published: <strong>0</strong></p>
              <p>Public products unchanged: <strong>{result.public_products_unchanged ? `yes ✓ (${result.public_product_count})` : 'NO'}</strong></p>
              <p>Launch QA still Ready for Monday: <strong>{result.launch_qa_still_ready ? 'yes ✓' : 'check public products'}</strong></p>
            </div>
          </div>

          {result.passed_names?.length > 0 && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
              <p className="font-semibold mb-1">Passed ({result.passed_names.length}):</p>
              {result.passed_names.map((n, i) => (
                <p key={i} className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {n}</p>
              ))}
            </div>
          )}

          {result.failed_names?.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <p className="font-semibold mb-1">Failed ({result.failed_names.length}):</p>
              {result.failed_names.map((n, i) => (
                <p key={i} className="flex items-center gap-1"><XCircle className="w-3 h-3" /> {n}</p>
              ))}
            </div>
          )}

          {result.critical_issues?.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <p className="font-semibold mb-1">Critical Issues:</p>
              {result.critical_issues.map((c, i) => <p key={i}>✗ {c}</p>)}
            </div>
          )}

          {result.non_critical_issues?.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <p className="font-semibold mb-1">Non-Critical Issues:</p>
              {result.non_critical_issues.slice(0, 10).map((nc, i) => <p key={i}>⚠ {nc}</p>)}
              {result.non_critical_issues.length > 10 && <p>…and {result.non_critical_issues.length - 10} more</p>}
            </div>
          )}
        </div>
      )}

      <Button onClick={handleRunQA} disabled={loading} size="lg" className="w-full">
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Running QA…
          </>
        ) : (
          'Run QA Check'
        )}
      </Button>
    </div>
  );
}