import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';

export default function ApproveDraftProducts({ onApprovalComplete }) {
  const [loading, setLoading] = useState(false);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [draftProducts, setDraftProducts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    loadDrafts();
  }, []);

  const loadDrafts = async () => {
    try {
      setLoadingDrafts(true);
      const products = await base44.entities.Product.filter(
        { visibility: 'draft' },
        '-created_date',
        100
      );
      setDraftProducts(products);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDrafts(false);
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleApprove = async () => {
    if (selected.length === 0) {
      setError('Select at least one product');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const updatePromises = selected.map(id =>
        base44.entities.Product.update(id, { visibility: 'public' })
      );
      await Promise.all(updatePromises);

      setResult({
        approved: selected.length
      });
      setSelected([]);
      await loadDrafts();
      if (onApprovalComplete) onApprovalComplete(selected.length);
    } catch (err) {
      setError(err.message || 'Approval failed');
    } finally {
      setLoading(false);
    }
  };

  if (loadingDrafts) {
    return (
      <div className="bg-white border border-border rounded-2xl p-6">
        <p className="text-sm text-muted-foreground text-center py-4">Loading draft products...</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
      <div>
        <h3 className="text-lg font-bold mb-1">Approve & Publish Products</h3>
        <p className="text-sm text-muted-foreground">Select draft products that passed QA and are ready to publish to the public shop.</p>
      </div>

      {error && (
        <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="flex gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>✓ {result.approved} product(s) published to public shop</span>
        </div>
      )}

      {draftProducts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No draft products found</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {draftProducts.map(product => (
            <div key={product.id} className="border rounded-lg p-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.includes(product.id)}
                  onChange={() => toggleSelect(product.id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm line-clamp-1">{product.name}</p>
                  <div className="flex gap-2 text-xs text-muted-foreground mt-1">
                    <span>{product.brand}</span>
                    {product.supplier_sku && <span>SKU: {product.supplier_sku}</span>}
                  </div>
                </div>
                <button
                  onClick={() => setExpandedId(expandedId === product.id ? null : product.id)}
                  className="text-muted-foreground hover:text-foreground p-1"
                >
                  {expandedId === product.id ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </div>

              {expandedId === product.id && (
                <div className="mt-3 ml-6 pt-3 border-t text-xs space-y-1 text-muted-foreground">
                  <p>Type: {product.product_type || '—'}</p>
                  <p>Material: {product.material || '—'}</p>
                  {product.image_url && <p>✓ Image available</p>}
                  {!product.image_url && <p className="text-red-600">✗ Missing image</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-4 border-t">
        <Button onClick={loadDrafts} variant="outline" className="flex-1" disabled={loading}>
          Refresh List
        </Button>
        <Button
          onClick={handleApprove}
          disabled={loading || selected.length === 0}
          className="flex-1"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Publishing...
            </>
          ) : (
            `Publish ${selected.length} Product${selected.length !== 1 ? 's' : ''}`
          )}
        </Button>
      </div>
    </div>
  );
}