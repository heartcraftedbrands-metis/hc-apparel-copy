import React, { useState, useEffect } from 'react';
import { ArrowLeft, AlertCircle, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

export default function PublicCatalogAudit() {
  const navigate = useNavigate();
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hiding, setHiding] = useState(false);

  const hideSamples = async () => {
    if (audit?.sampleProducts.length === 0) return;
    setHiding(true);
    try {
      const ids = audit.sampleProducts.map(p => p.id);
      await base44.functions.invoke('hideSampleProducts', { product_ids: ids });
      await refreshAudit();
    } catch (err) {
      setError(err.message);
    } finally {
      setHiding(false);
    }
  };

  const refreshAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await base44.functions.invoke('auditPublicCatalog', {});
      setAudit(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAudit();
    document.title = 'Public Catalog Audit | HC Apparel';
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6 flex items-center justify-center">
        <div className="animate-spin">
          <RefreshCw className="w-6 h-6 text-primary" />
        </div>
      </div>
    );
  }

  if (error || !audit) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <Button variant="outline" onClick={() => navigate('/AdminDashboard')} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800">{error || 'Failed to load audit'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { summary, sampleProducts, productsWithoutImages, notCheckoutReady } = audit;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <Button variant="outline" onClick={() => navigate('/AdminDashboard')} className="mb-6">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Admin Dashboard
      </Button>

      <div className="max-w-4xl">
        <h1 className="text-3xl font-bold mb-2 text-foreground">Public Catalog Audit</h1>
        <p className="text-muted-foreground mb-6">Monday Launch Readiness Check</p>

        {/* Summary Cards */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Public Products</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{summary.totalPublic}</p>
              <p className="text-sm text-muted-foreground mt-1">Active & visible on storefront</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">With Images</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{summary.withImages}/{summary.totalPublic}</p>
              <p className="text-sm text-muted-foreground mt-1">{summary.withoutImages} missing images</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Checkout Ready</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{summary.checkoutReady}/{summary.totalPublic}</p>
              <p className="text-sm text-muted-foreground mt-1">Colors, sizes, and price configured</p>
            </CardContent>
          </Card>

          <Card className={summary.samplesPublic > 0 ? 'border-orange-200 bg-orange-50' : ''}>
            <CardHeader>
              <CardTitle className="text-base">Sample/Demo Products</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${summary.samplesPublic > 0 ? 'text-orange-600' : 'text-primary'}`}>
                {summary.samplesPublic}
              </p>
              <p className="text-sm text-muted-foreground mt-1">{summary.samplesPublic > 0 ? 'Should be hidden' : 'None visible'}</p>
            </CardContent>
          </Card>
        </div>

        {/* Launch Readiness */}
        <Card className={summary.readyForLaunch ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {summary.readyForLaunch ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  Ready for Monday Launch
                </>
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  Launch Blocked ({summary.blockingIssues.length} issues)
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.blockingIssues.length > 0 ? (
              <ul className="space-y-2">
                {summary.blockingIssues.map((issue, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 bg-orange-600 rounded-full flex-shrink-0" />
                    {issue}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-green-700 font-medium">All systems go! Catalog is clean and launch-ready.</p>
            )}
          </CardContent>
        </Card>

        {/* Sample Products Detail */}
        {sampleProducts.length > 0 && (
          <Card className="mt-6 border-orange-200 bg-orange-50">
            <CardHeader className="flex flex-row items-start justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-orange-600" />
                Sample/Demo Products Showing ({sampleProducts.length})
              </CardTitle>
              <Button 
                onClick={hideSamples} 
                disabled={hiding} 
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                {hiding ? 'Hiding...' : 'Hide All'}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sampleProducts.map(p => (
                  <div key={p.id} className="text-sm p-2 bg-white rounded border border-orange-200">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">Vendor: {p.vendor || 'N/A'}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Products Without Images */}
        {productsWithoutImages.length > 0 && (
          <Card className="mt-6 border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-orange-600" />
                Public Products Missing Images ({productsWithoutImages.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {productsWithoutImages.map(p => (
                  <div key={p.id} className="text-sm p-2 bg-white rounded border border-orange-200">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.vendor || 'N/A'}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Not Checkout Ready */}
        {notCheckoutReady.length > 0 && (
          <Card className="mt-6 border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-orange-600" />
                Not Checkout Ready ({notCheckoutReady.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {notCheckoutReady.map(p => (
                  <div key={p.id} className="text-sm p-2 bg-white rounded border border-orange-200">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Colors: {p.hasColors ? '✓' : '✗'} | Sizes: {p.hasSizes ? '✓' : '✗'} | Price: {p.price > 0 ? '✓' : '✗'}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Button onClick={refreshAudit} className="mt-6 gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh Audit
        </Button>
      </div>
    </div>
  );
}