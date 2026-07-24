import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const numberFormat = new Intl.NumberFormat('en-US');
const moneyFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const money = value => moneyFormat.format(Number(value) || 0);

export default function AdminSSPostPublishQA() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const runReport = useCallback(async () => {
    setLoading(true);
    setError('');

    const { data: batch, error: batchError } = await supabase
      .from('ss_launch_batches')
      .select('id')
      .eq('status', 'approved')
      .order('approved_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (batchError || !batch) {
      setError(batchError?.message || 'No approved S&S launch batch was found.');
      setReport(null);
      setLoading(false);
      return;
    }

    const { data, error: reportError } = await supabase.rpc('run_ss_post_publish_verification', {
      p_batch_id: batch.id,
    });

    if (reportError) {
      setError(reportError.message);
      setReport(null);
    } else {
      setReport(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    runReport();
  }, [runReport]);

  const passedProducts = useMemo(() => {
    if (!report?.products) return 0;
    return report.products.filter(product => (
      product.active_public_pass
      && product.public_route_pass
      && product.image_pass
      && product.data_pass
      && Number(product.restricted_sku_count) === 0
    )).length;
  }, [report]);

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-primary px-4 py-6 text-primary-foreground">
        <div className="container mx-auto flex max-w-7xl items-center gap-4">
          <Link to="/AdminSSLaunchQA">
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">S&amp;S Post-Publish Verification</h1>
            <p className="text-sm text-primary-foreground/70">Current public state; read-only admin report</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
        )}

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        {!loading && !error && report && (
          <>
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                Live report for batch <span className="font-mono">{report.batch.id}</span>.
                Generated {new Date(report.generated_at).toLocaleString()} from current products, storefront data,
                SKU approvals, and public quote-request permissions.
              </AlertDescription>
            </Alert>

            <div className={`rounded-2xl border p-6 ${
              report.all_passed ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
            }`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  {report.all_passed
                    ? <CheckCircle2 className="mt-0.5 h-7 w-7 text-emerald-700" />
                    : <XCircle className="mt-0.5 h-7 w-7 text-destructive" />}
                  <div>
                    <h2 className="text-lg font-bold">
                      {report.all_passed ? 'Post-publish verification passed' : 'Post-publish verification needs review'}
                    </h2>
                    <p className="mt-1 text-sm">
                      {passedProducts} of {report.summary.product_count} batch products passed all public product checks;
                      {' '}{numberFormat.format(report.summary.variant_count)} live SKU variants were audited.
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={runReport} className="gap-2 bg-white">
                  <RefreshCw className="h-4 w-4" /> Run live report again
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {report.checklist.map(check => (
                <article
                  key={check.id}
                  className={`rounded-2xl border bg-white p-5 ${
                    check.passed ? 'border-emerald-200' : 'border-red-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {check.passed
                      ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                      : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />}
                    <div>
                      <h3 className="font-bold">{check.label}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{check.detail}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-muted-foreground">Active/public</p>
                <p className="mt-1 text-2xl font-black">{report.summary.active_public_count}/25</p>
              </div>
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-muted-foreground">Public storefront</p>
                <p className="mt-1 text-2xl font-black">{report.summary.storefront_visible_count}/25</p>
              </div>
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-muted-foreground">SKU variants</p>
                <p className="mt-1 text-2xl font-black">{numberFormat.format(report.summary.variant_count)}</p>
              </div>
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-muted-foreground">Restricted SKUs</p>
                <p className="mt-1 text-2xl font-black">{numberFormat.format(report.summary.restricted_variant_count)}</p>
              </div>
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-muted-foreground">Missing images</p>
                <p className="mt-1 text-2xl font-black">{numberFormat.format(report.summary.missing_image_count)}</p>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-bold">Live public product evidence</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Each link below uses the same public product route available to Shop Garments visitors.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] text-sm">
                  <thead className="border-b bg-muted/50 text-left">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Brand / style</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-4 py-3">Colors</th>
                      <th className="px-4 py-3">Sizes</th>
                      <th className="px-4 py-3">SKUs</th>
                      <th className="px-4 py-3">Public</th>
                      <th className="px-4 py-3">Restricted</th>
                      <th className="px-4 py-3">Public route</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {report.products.map(product => {
                      const passed = product.active_public_pass
                        && product.public_route_pass
                        && product.image_pass
                        && product.data_pass
                        && Number(product.restricted_sku_count) === 0;
                      return (
                        <tr key={product.item_id}>
                          <td className="px-4 py-3">
                            <div className="flex min-w-[230px] items-center gap-3">
                              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                                {product.image_url
                                  ? <img src={product.image_url} alt={product.name} className="h-full w-full object-contain" />
                                  : <div className="flex h-full items-center justify-center"><ImageIcon className="h-5 w-5" /></div>}
                              </div>
                              <div>
                                <p className="font-semibold">{product.name}</p>
                                <Badge variant={passed ? 'default' : 'destructive'} className="mt-1">
                                  {passed ? 'Passed' : 'Review'}
                                </Badge>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">{product.brand} / {product.style_number}</td>
                          <td className="px-4 py-3 font-semibold">{money(product.price)}</td>
                          <td className="px-4 py-3">{numberFormat.format(product.color_count)}</td>
                          <td className="px-4 py-3">{numberFormat.format(product.size_count)}</td>
                          <td className="px-4 py-3">{numberFormat.format(product.variant_count)}</td>
                          <td className="px-4 py-3">
                            {product.active_public_pass && product.public_route_pass
                              ? <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                              : <XCircle className="h-5 w-5 text-destructive" />}
                          </td>
                          <td className="px-4 py-3">{numberFormat.format(product.restricted_sku_count)}</td>
                          <td className="px-4 py-3">
                            <Link to={product.public_url}>
                              <Button size="sm" variant="outline" className="gap-2">
                                <ExternalLink className="h-4 w-4" /> Open public product
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5 text-sm text-muted-foreground">
              This report is read-only. It does not modify products, checkout, quotes, navigation, pricing, or suspension state.
              Suspension remains available from the private batch QA page and targets exactly
              {' '}{numberFormat.format(report.summary.suspend_scope_product_count)} recorded batch products.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
