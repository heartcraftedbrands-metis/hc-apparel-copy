import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Image as ImageIcon,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Upload,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const numberFormat = new Intl.NumberFormat('en-US');
const moneyFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const money = value => moneyFormat.format(Number(value) || 0);

export default function AdminSSLaunchQA() {
  const [report, setReport] = useState(null);
  const [release, setRelease] = useState(null);
  const [approval, setApproval] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [suspending, setSuspending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setActionError('');

    const { data: latestBatch, error: batchError } = await supabase
      .from('ss_launch_batches')
      .select('id,batch_label,status,product_count,variant_count,approved_by,approved_at,suspended_by,suspended_at')
      .order('created_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (batchError || !latestBatch) {
      setError(batchError?.message || 'No private S&S launch batch was found.');
      setReport(null);
      setRelease(null);
      setLoading(false);
      return;
    }

    setRelease(latestBatch);

    const { data: latestApproval, error: approvalError } = await supabase
      .from('ss_launch_batch_approval_logs')
      .select('id,batch_id,approved_by,approved_at,products_published_count,sku_variants_count,qa_snapshot')
      .eq('batch_id', latestBatch.id)
      .order('approved_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (approvalError) {
      setError(approvalError.message);
      setReport(null);
      setLoading(false);
      return;
    }

    setApproval(latestApproval || null);

    if (latestBatch.status === 'approved' && latestApproval?.qa_snapshot) {
      setReport(latestApproval.qa_snapshot);
      setLoading(false);
      return;
    }

    const { data, error: reportError } = await supabase.rpc('run_ss_private_launch_qa', {
      p_batch_id: latestBatch.id,
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
    load();
  }, [load]);

  const approveBatch = async () => {
    if (!report?.batch?.id || publishing) return;
    setPublishing(true);
    setActionError('');
    setActionNotice('');

    const { data, error: approvalError } = await supabase.rpc('approve_ss_private_launch_batch', {
      p_batch_id: report.batch.id,
    });

    if (approvalError) {
      setActionError(approvalError.message);
    } else {
      const result = data?.[0];
      setActionNotice(
        `${numberFormat.format(Number(result?.products_published_count) || 0)} QA-passed batch products are now public.`
      );
      await load();
    }
    setPublishing(false);
  };

  const suspendBatch = async () => {
    if (!release?.id || suspending) return;
    setSuspending(true);
    setActionError('');
    setActionNotice('');

    const { data, error: suspensionError } = await supabase.rpc('suspend_ss_public_launch_batch', {
      p_batch_id: release.id,
    });

    if (suspensionError) {
      setActionError(suspensionError.message);
    } else {
      const result = data?.[0];
      setActionNotice(
        `${numberFormat.format(Number(result?.products_suspended_count) || 0)} batch products were hidden and returned to private drafts.`
      );
      await load();
    }
    setSuspending(false);
  };

  const passedProducts = useMemo(() => {
    if (!report?.products) return 0;
    return report.products.filter(product => (
      product.private_pass
      && product.image_pass
      && product.data_pass
      && product.preview_pass
      && product.cart_test_pass
      && Number(product.restricted_sku_count) === 0
      && product.public_shop_exposed === false
    )).length;
  }, [report]);

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-primary px-4 py-6 text-primary-foreground">
        <div className="container mx-auto flex max-w-7xl items-center gap-4">
          <Link to="/AdminSSLaunchBatch">
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">S&amp;S Private Batch QA Report</h1>
            <p className="text-sm text-primary-foreground/70">Admin-only QA, batch approval, and suspension controls</p>
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
        {actionError && <Alert variant="destructive"><AlertDescription>{actionError}</AlertDescription></Alert>}
        {actionNotice && !actionError && (
          <Alert><CheckCircle2 className="h-4 w-4" /><AlertDescription>{actionNotice}</AlertDescription></Alert>
        )}

        {!loading && !error && report && (
          <>
            <Alert>
              <LockKeyhole className="h-4 w-4" />
              <AlertDescription>
                {release?.status === 'approved'
                  ? `Batch ${report.batch.label} is approved. The checklist below is the immutable QA snapshot captured immediately before publication.`
                  : `Report ${report.batch.label}. Checks read the private product tables, approved S&S SKU records, and the actual public storefront view.`}
              </AlertDescription>
            </Alert>

            <div className={`rounded-2xl border p-6 ${
              report.all_passed ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
            }`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  {report.all_passed
                    ? <ShieldCheck className="mt-0.5 h-7 w-7 text-emerald-700" />
                    : <XCircle className="mt-0.5 h-7 w-7 text-destructive" />}
                  <div>
                    <h2 className="text-lg font-bold">
                      {report.all_passed ? 'Private batch passed all automated QA checks' : 'Private batch needs review'}
                    </h2>
                    <p className="mt-1 text-sm">
                      {passedProducts} of {report.summary.product_count} products passed every product-level check;
                      {' '}{numberFormat.format(report.summary.variant_count)} SKU variants were audited.
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={load} className="gap-2 bg-white">
                  <RefreshCw className="h-4 w-4" /> Run report again
                </Button>
              </div>
            </div>

            {release?.status === 'approved' ? (
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-3">
                    <Upload className="mt-0.5 h-6 w-6 text-emerald-700" />
                    <div>
                      <h2 className="font-bold">Batch approved for the public shop</h2>
                      <p className="mt-1 text-sm">
                        Batch ID: <span className="font-mono">{release.id}</span>
                      </p>
                      <p className="mt-1 text-sm">
                        {numberFormat.format(approval?.products_published_count || release.product_count)} products ·
                        {' '}{numberFormat.format(approval?.sku_variants_count || release.variant_count)} SKU variants
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Approved {approval?.approved_at ? new Date(approval.approved_at).toLocaleString() : ''}
                      </p>
                      {approval?.approved_by && (
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          Approved by: <span className="font-mono">{approval.approved_by}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link to="/AdminSSPostPublishQA">
                      <Button className="gap-2">
                        <ShieldCheck className="h-4 w-4" /> Open post-publish report
                      </Button>
                    </Link>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={suspending}>
                          {suspending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Suspend and hide this batch
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Suspend this public batch?</AlertDialogTitle>
                          <AlertDialogDescription className="space-y-3">
                            <span className="block">
                              This will hide only the {numberFormat.format(release.product_count)} products belonging to
                              batch <span className="font-mono">{release.id}</span>.
                            </span>
                            <span className="block font-semibold text-foreground">
                              Existing public products outside this batch will not be changed.
                            </span>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={suspendBatch} className="bg-destructive hover:bg-destructive/90">
                            Suspend batch
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border bg-white p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="font-bold">
                      {release?.status === 'suspended' ? 'Batch is suspended and private' : 'Batch approval'}
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                      The database will rerun every QA check inside the approval transaction. If any check fails,
                      nothing will be published.
                    </p>
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button disabled={!report.all_passed || publishing} className="gap-2">
                        {publishing
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <ShieldCheck className="h-4 w-4" />}
                        Approve QA-Passed Batch for Public Shop.
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirm QA-passed batch approval</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-4 text-sm">
                            <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2">
                              <div>
                                <p className="text-muted-foreground">Batch ID</p>
                                <p className="break-all font-mono text-foreground">{report.batch.id}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Number of products</p>
                                <p className="font-bold text-foreground">{numberFormat.format(report.summary.product_count)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Number of SKU variants</p>
                                <p className="font-bold text-foreground">{numberFormat.format(report.summary.variant_count)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Restricted SKUs included</p>
                                <p className="font-bold text-foreground">{numberFormat.format(report.summary.restricted_variant_count)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Products missing images</p>
                                <p className="font-bold text-foreground">{numberFormat.format(report.summary.missing_image_count)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Products visible in public shop before approval</p>
                                <p className="font-bold text-foreground">{numberFormat.format(report.summary.storefront_exposed_count)}</p>
                              </div>
                            </div>
                            <p className="font-bold text-foreground">
                              This will publish only the products from this QA-passed private batch.
                            </p>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={approveBatch}
                          disabled={
                            !report.all_passed
                            || Number(report.summary.restricted_variant_count) !== 0
                            || Number(report.summary.missing_image_count) !== 0
                            || Number(report.summary.storefront_exposed_count) !== 0
                          }
                        >
                          Approve and publish this batch
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )}

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

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-muted-foreground">Private products</p>
                <p className="mt-1 text-2xl font-black">{numberFormat.format(report.summary.product_count)}</p>
              </div>
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-muted-foreground">SKU variants audited</p>
                <p className="mt-1 text-2xl font-black">{numberFormat.format(report.summary.variant_count)}</p>
              </div>
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-muted-foreground">Restricted SKUs included</p>
                <p className="mt-1 text-2xl font-black">{numberFormat.format(report.summary.restricted_variant_count)}</p>
              </div>
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-muted-foreground">Visible in public shop</p>
                <p className="mt-1 text-2xl font-black">{numberFormat.format(report.summary.storefront_exposed_count)}</p>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-bold">Product-level evidence</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Preview links remain admin-only. Use them to manually select a color and size and add one SKU to the private QA cart.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-sm">
                  <thead className="border-b bg-muted/50 text-left">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Brand / style</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-4 py-3">Colors</th>
                      <th className="px-4 py-3">Sizes</th>
                      <th className="px-4 py-3">SKUs</th>
                      <th className="px-4 py-3">Private</th>
                      <th className="px-4 py-3">Restricted</th>
                      <th className="px-4 py-3">QA preview</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {report.products.map(product => {
                      const rowPassed = product.private_pass
                        && product.image_pass
                        && product.data_pass
                        && product.preview_pass
                        && product.cart_test_pass
                        && Number(product.restricted_sku_count) === 0
                        && product.public_shop_exposed === false;
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
                                <Badge variant={rowPassed ? 'default' : 'destructive'} className="mt-1">
                                  {rowPassed ? 'Passed' : 'Review'}
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
                            {product.private_pass && !product.public_shop_exposed
                              ? <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                              : <XCircle className="h-5 w-5 text-destructive" />}
                          </td>
                          <td className="px-4 py-3">{numberFormat.format(product.restricted_sku_count)}</td>
                          <td className="px-4 py-3">
                            <Link to={product.preview_url}>
                              <Button size="sm" variant="outline" className="gap-2">
                                <Eye className="h-4 w-4" /> Preview / test cart
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

            <div className="rounded-2xl border bg-white p-5">
              <div className="flex items-start gap-3">
                <ShoppingCart className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-bold">Functional QA boundary</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Private previews and the QA cart use the staged SKU data only. Checkout and the live quote flow were not
                    modified, and no batch product is returned by the public Shop Garments storefront view.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
