import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, Eye, EyeOff, TriangleAlert, ShoppingBag } from 'lucide-react';

function extractBrand(p) {
  return p.internal_notes?.match(/Brand:\s*(.+?)\s*\//)?.[1]?.trim() || p.vendor_source || '—';
}

const TEST_CHECKLIST = [
  'Product is visible in Shop Garments',
  'Product detail page opens',
  'Main image loads',
  'Color options show',
  'Size options show',
  'Price shows correctly',
  'Variant price changes if needed',
  'Out-of-stock variants are disabled',
  'Add to cart works',
  'Cart shows product name, color, size, quantity, and price',
  'Checkout still works',
];

export default function PublishTestProduct({ products = [] }) {
  const [publishing, setPublishing] = useState(null); // product id being published
  const [unpublishing, setUnpublishing] = useState(null);
  const [publishedId, setPublishedId] = useState(null);
  const [publishedProduct, setPublishedProduct] = useState(null);
  const [checklist, setChecklist] = useState({});

  const draftProducts = products.filter(
    p => p.visibility === 'draft' || p.visibility === 'hidden'
  );
  const publishedTestProduct = publishedProduct;

  const handlePublish = async (product) => {
    const confirmed = window.confirm(
      `You are about to publish only this product:\n\n"${product.name}"\n\nThe other draft products will remain hidden.\n\nContinue?`
    );
    if (!confirmed) return;

    setPublishing(product.id);
    try {
      await base44.entities.Product.update(product.id, {
        visibility: 'public',
        is_active: true,
      });
      setPublishedId(product.id);
      setPublishedProduct({ ...product, visibility: 'public', is_active: true });
      setChecklist({});
    } catch (e) {
      alert('Publish failed: ' + e.message);
    }
    setPublishing(null);
  };

  const handleUnpublish = async () => {
    if (!publishedId) return;
    const confirmed = window.confirm(
      `Return "${publishedTestProduct?.name}" to Draft / Hidden?\n\nThe product will not be deleted. No orders are affected.\n\nContinue?`
    );
    if (!confirmed) return;

    setUnpublishing(publishedId);
    try {
      await base44.entities.Product.update(publishedId, {
        visibility: 'draft',
        is_active: false,
      });
      setPublishedId(null);
      setPublishedProduct(null);
      setChecklist({});
    } catch (e) {
      alert('Unpublish failed: ' + e.message);
    }
    setUnpublishing(null);
  };

  const toggleCheck = (label) => {
    setChecklist(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const checksPassed = TEST_CHECKLIST.filter(l => checklist[l]).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="w-7 h-7 bg-primary text-primary-foreground rounded-full text-sm flex items-center justify-center font-bold">6</span>
          Publish Test Product
          <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-800 font-medium border border-orange-200">
            One Product Only · Others Stay Hidden
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Publish a single draft product to verify the customer-facing flow. All other draft products remain hidden. Use <strong>Unpublish Test Product</strong> to revert.
        </p>

        {/* Safety note */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-start gap-2 text-sm text-amber-800">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Only the selected product will be published. Prices, variants, and inventory are not changed. Nothing is deleted.</span>
        </div>

        {/* Draft product list */}
        {draftProducts.length === 0 && !publishedTestProduct ? (
          <p className="text-sm text-muted-foreground italic">No draft garment products found.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Draft Products ({draftProducts.length} remaining hidden)
            </p>
            {draftProducts.map(p => {
              const brand = extractBrand(p);
              const variantCount = Array.isArray(p.size_prices) ? p.size_prices.length : (p.available_sizes || []).length;
              const isPublishing = publishing === p.id;
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 border rounded-xl px-4 py-3 bg-white flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{p.name}</p>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                      <span>Brand: <span className="font-medium text-foreground">{brand}</span></span>
                      <span>Style: <span className="font-mono font-medium text-foreground">{p.supplier_sku || '—'}</span></span>
                      <span>Variants: <span className="font-medium text-foreground">{variantCount}</span></span>
                      <span>From: <span className="font-semibold text-green-700">${Number(p.price || 0).toFixed(2)}</span></span>
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">{p.visibility}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handlePublish(p)}
                    disabled={isPublishing || !!publishing}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 shrink-0"
                  >
                    <Eye className="w-4 h-4" />
                    {isPublishing ? 'Publishing…' : 'Publish This Product Only'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Published test product panel */}
        {publishedTestProduct && (
          <div className="border-2 border-green-300 bg-green-50 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <p className="font-bold text-sm text-green-800">Test product is now LIVE</p>
            </div>

            <div className="bg-white rounded-lg border p-3 text-sm space-y-1">
              <p className="font-semibold">{publishedTestProduct.name}</p>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                <span>Brand: <span className="font-medium text-foreground">{extractBrand(publishedTestProduct)}</span></span>
                <span>Style: <span className="font-mono font-medium text-foreground">{publishedTestProduct.supplier_sku || '—'}</span></span>
                <span>Price: <span className="font-semibold text-green-700">${Number(publishedTestProduct.price || 0).toFixed(2)}</span></span>
                <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-semibold">PUBLIC</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <Link to={`/ProductDetail?id=${publishedTestProduct.id}`}>
                <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-white border border-gray-300 text-gray-800 hover:bg-gray-50">
                  <ExternalLink className="w-4 h-4" />
                  View Published Product
                </button>
              </Link>
              <Link to="/ShopGarments">
                <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-white border border-gray-300 text-gray-800 hover:bg-gray-50">
                  <ShoppingBag className="w-4 h-4" />
                  View Shop Garments
                </button>
              </Link>
              <button
                onClick={() => setPublishedId(id => id)} // no-op — "keep published" just acknowledges
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700"
              >
                <CheckCircle2 className="w-4 h-4" />
                Keep Product Published
              </button>
              <button
                onClick={handleUnpublish}
                disabled={!!unpublishing}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-40"
              >
                <EyeOff className="w-4 h-4" />
                {unpublishing ? 'Unpublishing…' : 'Unpublish Test Product'}
              </button>
            </div>

            {/* Test checklist */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Test Checklist — {checksPassed} / {TEST_CHECKLIST.length} passed
              </p>
              <div className="bg-white border rounded-xl divide-y overflow-hidden">
                {TEST_CHECKLIST.map(label => (
                  <label key={label} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/30 select-none">
                    <input
                      type="checkbox"
                      checked={!!checklist[label]}
                      onChange={() => toggleCheck(label)}
                      className="rounded w-4 h-4 accent-green-600"
                    />
                    <span className={`text-sm ${checklist[label] ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {label}
                    </span>
                    {checklist[label] && <CheckCircle2 className="w-4 h-4 text-green-500 ml-auto shrink-0" />}
                  </label>
                ))}
              </div>
              {checksPassed === TEST_CHECKLIST.length && (
                <div className="mt-3 bg-green-100 border border-green-300 rounded-lg px-4 py-2.5 flex items-center gap-2 text-green-800 text-sm font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  All test checks passed! Product is ready.
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}