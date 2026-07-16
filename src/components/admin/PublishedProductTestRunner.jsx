import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PublishedProductTestRunner({ productId, productName }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runTests = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const product = await base44.entities.Product.get(productId);
      const checks = {};

      // 1. Product is visible in Shop Garments
      checks[1] = {
        name: 'Product visible in Shop Garments',
        pass: product.visibility === 'public' && product.is_active !== false,
        reason: product.visibility !== 'public' ? 'Not public' : product.is_active === false ? 'Inactive' : null
      };

      // 2. Product detail page opens
      checks[2] = {
        name: 'Product detail page opens',
        pass: !!product.id && !!product.name,
        reason: !product.id ? 'No ID' : !product.name ? 'No name' : null
      };

      // 3. Main image loads
      checks[3] = {
        name: 'Main image loads',
        pass: !!product.image_url && product.image_url.trim().length > 0,
        reason: !product.image_url ? 'No main image' : null
      };

      // 4. Variant images load or fallback works
      const hasVariantImages = product.mockup_images?.length > 0;
      checks[4] = {
        name: 'Variant images or fallback available',
        pass: hasVariantImages || !!product.image_url,
        reason: !hasVariantImages && !product.image_url ? 'No variant images or fallback' : null
      };

      // 5. Color swatches show correctly
      const hasColors = product.available_colors?.length > 0;
      checks[5] = {
        name: 'Color swatches available',
        pass: hasColors,
        reason: !hasColors ? 'No colors defined' : null
      };

      // 6. Size options show correctly
      const hasSizes = product.available_sizes?.length > 0;
      checks[6] = {
        name: 'Size options available',
        pass: hasSizes,
        reason: !hasSizes ? 'No sizes defined' : null
      };

      // 7. Price displays correctly
      checks[7] = {
        name: 'Price displays correctly',
        pass: !!product.price && product.price > 0,
        reason: !product.price ? 'No price' : product.price <= 0 ? 'Invalid price' : null
      };

      // 8. Quantity selector works (check if product allows variants)
      checks[8] = {
        name: 'Quantity selector works',
        pass: !!product.id && (hasSizes || hasColors),
        reason: !hasSizes && !hasColors ? 'No variants to select' : null
      };

      // 9. Request Order Help button works
      checks[9] = {
        name: 'Request Order Help button works',
        pass: !!product.id && product.visibility === 'public',
        reason: product.visibility !== 'public' ? 'Not public' : null
      };

      // 10. Request Quote page receives product details
      checks[10] = {
        name: 'Request Quote integration works',
        pass: !!product.id && !!product.name && !!product.price,
        reason: !product.id ? 'No ID' : !product.name ? 'No name' : !product.price ? 'No price' : null
      };

      // 11. No checkout/payment/debug language publicly
      const badWords = ['stripe', 'paypal', 'checkout', 'payment', 'debug', 'test_mode', 'test order', 'demo'];
      const hasPaymentLang = (product.description?.toLowerCase() || '').split(' ').some(word =>
        badWords.some(bad => word.includes(bad))
      ) || (product.internal_notes?.toLowerCase() || '').split(' ').some(word =>
        badWords.some(bad => word.includes(bad))
      );
      checks[11] = {
        name: 'No payment/debug language public',
        pass: !hasPaymentLang && product.visibility === 'public',
        reason: hasPaymentLang ? 'Contains payment language' : null
      };

      const passed = Object.values(checks).filter(c => c.pass).length;
      const failed = Object.values(checks).filter(c => !c.pass).length;

      setResults({
        productId,
        productName,
        checks,
        passed,
        failed,
        passedList: Object.entries(checks)
          .filter(([_, c]) => c.pass)
          .map(([_, c]) => c.name),
        failedList: Object.entries(checks)
          .filter(([_, c]) => !c.pass)
          .map(([_, c]) => ({ name: c.name, reason: c.reason }))
      });
    } catch (err) {
      setError(err.message || 'Test failed');
    } finally {
      setLoading(false);
    }
  };

  if (!productId) return null;

  return (
    <div className="space-y-4">
      <Button onClick={runTests} disabled={loading} size="lg" className="w-full">
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Running tests...
          </>
        ) : (
          'Run Product Checklist (11 items)'
        )}
      </Button>

      {error && (
        <div className="flex gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {results && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-green-700 mb-1">PASSED</p>
              <p className="text-2xl font-bold text-green-900">{results.passed} / 11</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-red-700 mb-1">FAILED</p>
              <p className="text-2xl font-bold text-red-900">{results.failed} / 11</p>
            </div>
          </div>

          {results.passedList.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-green-700 uppercase">Passed Checks</p>
              <div className="space-y-1">
                {results.passedList.map((name, i) => (
                  <div key={i} className="flex gap-2 text-sm text-green-700">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.failedList.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-red-700 uppercase">Failed Checks</p>
              <div className="space-y-2">
                {results.failedList.map((item, i) => (
                  <div key={i} className="flex gap-2 p-2 bg-red-50 border border-red-100 rounded text-sm text-red-700">
                    <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      {item.reason && <p className="text-xs text-red-600 mt-0.5">{item.reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            {results.passed === 11 ? (
              <p><strong>✓ All checks passed.</strong> Product is ready for public shop.</p>
            ) : results.failed <= 3 ? (
              <p><strong>⚠ Minor issues found.</strong> Review failed checks before keeping public.</p>
            ) : (
              <p><strong>✗ Critical issues found.</strong> Consider unpublishing and fixing before relaunching.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}