import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import PublishedProductTestRunner from '@/components/admin/PublishedProductTestRunner';

export default function AdminSSDraftProductTest() {
  const [publicProducts, setPublicProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPublic = async () => {
      try {
        const products = await base44.entities.Product.filter(
          { visibility: 'public' },
          '-created_date',
          100
        );
        setPublicProducts(products);
        if (products.length > 0) {
          setSelectedProduct(products[0]);
        }
      } catch (err) {
        console.error('Failed to load products:', err);
      } finally {
        setLoading(false);
      }
    };
    loadPublic();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-8 px-4 md:px-8">
        <div className="max-w-4xl mx-auto">
          <Link to="/AdminDashboard" className="inline-flex items-center gap-1.5 text-xs text-primary-foreground/60 hover:text-primary-foreground mb-3 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />Back to Admin Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-7 h-7 text-accent" />
            <div>
              <h1 className="text-2xl font-extrabold">Published Product QA Test</h1>
              <p className="text-primary-foreground/70 text-sm">Run the 11-point checklist on public products</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-8">

        {/* Product Selection */}
        <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold mb-2">Select Product to Test</h2>
            <p className="text-sm text-muted-foreground">Choose a public product to run the full checklist.</p>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading public products...</p>
          ) : publicProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No public products found</p>
          ) : (
            <div className="space-y-2">
              {publicProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className={`w-full text-left p-3 border rounded-lg transition-colors ${
                    selectedProduct?.id === product.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <p className="font-semibold text-sm">{product.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Brand: {product.brand} • Style: {product.supplier_sku || '—'} • Price: ${product.price}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Test Runner */}
        {selectedProduct && (
          <div className="bg-white border border-border rounded-2xl p-6 space-y-6">
            <div>
              <h2 className="text-lg font-bold mb-1">Checklist: {selectedProduct.name}</h2>
              <p className="text-sm text-muted-foreground">11-point verification for public shop readiness</p>
            </div>
            <PublishedProductTestRunner 
              productId={selectedProduct.id}
              productName={selectedProduct.name}
            />
          </div>
        )}

        {/* Safety Notes */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-2">
          <p className="text-sm font-semibold text-amber-900">Test Checklist (11 items)</p>
          <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
            <li>Product visible in Shop Garments</li>
            <li>Product detail page opens</li>
            <li>Main image loads</li>
            <li>Variant images load or fallback works</li>
            <li>Color swatches show correctly</li>
            <li>Size options show correctly</li>
            <li>Price displays correctly</li>
            <li>Quantity selector works</li>
            <li>Request Order Help button works</li>
            <li>Request Quote page receives details</li>
            <li>No payment/debug language publicly</li>
          </ul>
        </div>

      </div>
    </div>
  );
}