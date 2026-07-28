import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Eye,
  Loader2,
  LockKeyhole,
  PackagePlus,
  PauseCircle,
  RefreshCw,
  ShieldCheck,
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

export default function AdminSSLaunchBatch() {
  const [rule, setRule] = useState(null);
  const [workflowStatus, setWorkflowStatus] = useState(null);
  const [batch, setBatch] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    const { data: currentWorkflowStatus, error: workflowError } = await supabase
      .from('ss_catalog_workflow_status')
      .select('product_loading_paused,pause_message,api_read_checks_enabled,max_batch_sequence,paused_at')
      .eq('id', true)
      .maybeSingle();

    if (workflowError || !currentWorkflowStatus) {
      setError(workflowError?.message || 'The S&S product-loading status could not be verified.');
      setLoading(false);
      return;
    }

    setWorkflowStatus(currentWorkflowStatus);

    const { data: latestRule, error: ruleError } = await supabase
      .from('ss_pricing_rule_versions')
      .select('id,version_label,style_session_id,approved_sku_count,publish_eligible_sku_count')
      .eq('status', 'approved_private')
      .order('approved_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ruleError || !latestRule) {
      setError(ruleError?.message || 'No approved private S&S pricing rule was found.');
      setLoading(false);
      return;
    }

    setRule(latestRule);

    const { data: existingBatch, error: batchError } = await supabase
      .from('ss_launch_batches')
      .select('id,batch_label,batch_sequence,status,requested_style_count,product_count,variant_count,created_date')
      .eq('rule_version_id', latestRule.id)
      .in('status', ['private_draft', 'qa_passed'])
      .order('created_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (batchError) {
      setError(batchError.message);
      setLoading(false);
      return;
    }

    setBatch(existingBatch || null);
    if (!existingBatch) {
      setItems([]);
      setLoading(false);
      return;
    }

    const { data: batchItems, error: itemError } = await supabase
      .from('ss_launch_batch_items')
      .select('id,product_id,brand,style_id,part_number,variant_count,reused_test_product,qa_status')
      .eq('batch_id', existingBatch.id)
      .order('brand')
      .order('part_number');

    if (itemError) {
      setError(itemError.message);
      setLoading(false);
      return;
    }

    const productIds = (batchItems || []).map(item => item.product_id);
    const { data: products, error: productError } = productIds.length
      ? await supabase
        .from('products')
        .select('id,name,price,visibility,is_active,is_sample,image_url,stock,available_sizes,available_colors,size_prices,vendor_source,supplier_sku')
        .in('id', productIds)
      : { data: [], error: null };

    if (productError) {
      setError(productError.message);
      setLoading(false);
      return;
    }

    const productById = new Map((products || []).map(product => [product.id, product]));
    setItems((batchItems || []).map(item => ({
      ...item,
      product: productById.get(item.product_id) || null,
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => ({
    productCount: items.length,
    variantCount: items.reduce((sum, item) => sum + Number(item.variant_count || 0), 0),
    reusedCount: items.filter(item => item.reused_test_product).length,
    validCount: items.filter(item => (
      item.product?.visibility === 'draft'
      && item.product?.is_active === false
      && item.product?.is_sample === true
      && item.product?.vendor_source === 'S&S Activewear'
      && Array.isArray(item.product?.size_prices)
      && item.product.size_prices.length > 0
    )).length,
  }), [items]);

  const productLoadingPaused = workflowStatus?.product_loading_paused !== false;

  const buildBatch = async () => {
    if (!rule || building) return;
    if (productLoadingPaused) {
      setError(workflowStatus?.pause_message || 'Product loading is paused. Current catalog is stable.');
      return;
    }
    setBuilding(true);
    setError('');
    setNotice('');

    const { data, error: rpcError } = await supabase.rpc('create_ss_next_hc_private_launch_batch', {
      p_rule_version_id: rule.id,
      p_style_limit: 25,
    });

    if (rpcError) {
      setError(rpcError.message);
      setBuilding(false);
      return;
    }

    const result = data?.[0];
    setNotice(
      `${numberFormat.format(Number(result?.product_count) || 0)} private products and `
      + `${numberFormat.format(Number(result?.variant_count) || 0)} in-stock variants are ready for QA.`
    );
    setBuilding(false);
    await load();
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-primary px-4 py-6 text-primary-foreground">
        <div className="container mx-auto flex max-w-6xl items-center gap-4">
          <Link to="/AdminSSDraftReview">
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">S&amp;S Private Launch Batch</h1>
            <p className="text-sm text-primary-foreground/70">Admin QA remains available; new batch creation is paused</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
        )}

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {notice && !error && <Alert><CheckCircle2 className="h-4 w-4" /><AlertDescription>{notice}</AlertDescription></Alert>}

        {!loading && !error && workflowStatus && productLoadingPaused && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <PauseCircle className="mt-0.5 h-7 w-7 shrink-0 text-amber-700" />
                <div>
                  <h2 className="text-lg font-bold">
                    {workflowStatus.pause_message || 'Product loading is paused. Current catalog is stable.'}
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                    Automatic batches remain disabled. The intentionally controlled cold-weather private batch is the
                    only exception; it cannot publish without private QA and separate admin approval. Private QA,
                    post-publish QA, and batch suspension remain available.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/AdminSSLaunchQA">
                  <Button variant="outline" className="gap-2 bg-white">
                    <ShieldCheck className="h-4 w-4" /> Private QA and suspend
                  </Button>
                </Link>
                <Link to="/AdminSSPostPublishQA">
                  <Button variant="outline" className="gap-2 bg-white">
                    <ShieldCheck className="h-4 w-4" /> Post-publish QA
                  </Button>
                </Link>
                <Link to="/AdminSSApiSettings">
                  <Button variant="outline" className="gap-2 bg-white">
                    <RefreshCw className="h-4 w-4" /> Pricing/inventory checks
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && rule && !batch && !productLoadingPaused && (
          <>
            <Alert>
              <LockKeyhole className="h-4 w-4" />
              <AlertDescription>
                This creates the next balanced 25-style catalog batch from rule {rule.version_label}. Styles already used
                by earlier S&amp;S batches are excluded. All products remain inactive,
                private, and blocked from the public shop.
              </AlertDescription>
            </Alert>
            <div className="rounded-2xl border bg-white p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold">Build the private QA batch</h2>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    The next unused eligible styles will be selected from HC Apparel&apos;s preferred apparel,
                    Oakley accessory, hat, and bag categories. Only publish-eligible, in-stock S&amp;S SKUs are attached
                    as variants. Nothing is published automatically.
                  </p>
                </div>
                <Button onClick={buildBatch} disabled={building} className="gap-2">
                  {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
                  Build next private 25-style batch
                </Button>
              </div>
            </div>
          </>
        )}

        {!loading && !error && batch && (
          <>
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                Batch #{batch.batch_sequence} ({batch.batch_label}) is private. Every product is a draft, inactive,
                and marked as an S&amp;S test sample.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-muted-foreground">Private products</p>
                <p className="mt-1 text-2xl font-black">{numberFormat.format(summary.productCount)}</p>
              </div>
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-muted-foreground">In-stock SKU variants</p>
                <p className="mt-1 text-2xl font-black">{numberFormat.format(summary.variantCount)}</p>
              </div>
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-muted-foreground">Reused QA drafts</p>
                <p className="mt-1 text-2xl font-black">{numberFormat.format(summary.reusedCount)}</p>
              </div>
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-muted-foreground">Privacy checks passed</p>
                <p className="mt-1 text-2xl font-black">{summary.validCount}/{summary.productCount}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Private product and cart QA</h2>
                <p className="text-sm text-muted-foreground">
                  Open a product, choose an in-stock color and size, then add that exact SKU to the QA cart.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/AdminSSLaunchQA">
                  <Button className="gap-2">
                    <ShieldCheck className="h-4 w-4" /> Open private QA report
                  </Button>
                </Link>
                <Button variant="outline" onClick={load} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Refresh checks
                </Button>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {items.map(item => {
                const product = item.product;
                const privateReady = product?.visibility === 'draft'
                  && product?.is_active === false
                  && product?.is_sample === true;
                return (
                  <article key={item.id} className="overflow-hidden rounded-2xl border bg-white">
                    <div className="grid grid-cols-[120px_1fr]">
                      <div className="aspect-square bg-muted">
                        {product?.image_url
                          ? <img src={product.image_url} alt={product.name} className="h-full w-full object-contain" />
                          : <div className="flex h-full items-center justify-center"><Boxes className="h-8 w-8 text-muted-foreground" /></div>}
                      </div>
                      <div className="p-4">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={privateReady ? 'default' : 'destructive'}>
                            {privateReady ? 'Private draft' : 'Needs review'}
                          </Badge>
                          {item.reused_test_product && <Badge variant="outline">Reused QA draft</Badge>}
                        </div>
                        <h3 className="mt-3 font-bold">{product?.name || `${item.brand} ${item.part_number}`}</h3>
                        <p className="mt-1 font-bold text-accent">{money(product?.price)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.brand} · {numberFormat.format(item.variant_count)} in-stock variants
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
                      <p className="text-xs text-muted-foreground">
                        {product?.available_colors?.length || 0} colors · {product?.available_sizes?.length || 0} sizes
                      </p>
                      <Link to={`/ProductDetail?id=${item.product_id}&preview=draft`}>
                        <Button size="sm" variant="outline" className="gap-2">
                          <Eye className="h-4 w-4" /> Private product preview
                        </Button>
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
