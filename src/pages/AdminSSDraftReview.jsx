import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  LockKeyhole,
  PackageCheck,
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
const money = (value) => moneyFormat.format(Number(value) || 0);

function Check({ passed, children }) {
  return (
    <li className={`flex items-center gap-2 text-sm ${passed ? 'text-emerald-800' : 'text-destructive'}`}>
      {passed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {children}
    </li>
  );
}

export default function AdminSSDraftReview() {
  const [rule, setRule] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: latestRule, error: ruleError } = await supabase
        .from('ss_pricing_rule_versions')
        .select('id,version_label,style_session_id,approved_sku_count,publish_eligible_sku_count,draft_product_count')
        .order('approved_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) return;
      if (ruleError || !latestRule) {
        setError(ruleError?.message || 'No approved S&S pricing rule was found.');
        setLoading(false);
        return;
      }

      const { data: testRows, error: testError } = await supabase
        .from('ss_draft_product_tests')
        .select('product_id,brand,style_id,part_number')
        .eq('rule_version_id', latestRule.id)
        .order('brand');

      if (!active) return;
      if (testError) {
        setError(testError.message);
        setLoading(false);
        return;
      }

      const productIds = (testRows || []).map(row => row.product_id);
      const { data: products, error: productError } = productIds.length
        ? await supabase
          .from('products')
          .select('id,name,price,visibility,is_active,is_sample,image_url,stock,available_sizes,available_colors,vendor_source,supplier_sku')
          .in('id', productIds)
        : { data: [], error: null };

      if (!active) return;
      if (productError) {
        setError(productError.message);
        setLoading(false);
        return;
      }

      const productById = new Map((products || []).map(product => [product.id, product]));
      setRule(latestRule);
      setDrafts((testRows || []).map(row => ({
        ...row,
        product: productById.get(row.product_id) || null,
      })));
      setLoading(false);
    };

    load();
    return () => { active = false; };
  }, []);

  const review = useMemo(() => {
    const rows = drafts.map(row => {
      const product = row.product;
      const checks = {
        exists: Boolean(product),
        private: product?.visibility === 'draft' && product?.is_active === false,
        sample: product?.is_sample === true,
        source: product?.vendor_source === 'S&S Activewear',
        image: Boolean(product?.image_url),
        price: Number(product?.price) > 0,
        sizes: Array.isArray(product?.available_sizes) && product.available_sizes.length > 0,
        colors: Array.isArray(product?.available_colors) && product.available_colors.length > 0,
        stock: Number(product?.stock) > 0,
      };
      return {
        ...row,
        checks,
        passed: Object.values(checks).every(Boolean),
      };
    });

    return {
      rows,
      passed: rows.length === 5 && rows.every(row => row.passed),
    };
  }, [drafts]);

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-primary px-4 py-6 text-primary-foreground">
        <div className="container mx-auto flex max-w-6xl items-center gap-4">
          <Link to="/AdminProducts?tab=draft_ss">
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">S&amp;S Private Draft QA</h1>
            <p className="text-sm text-primary-foreground/70">Read-only checks; publishing remains locked</p>
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
        {!loading && !error && rule && (
          <>
            <Alert>
              <LockKeyhole className="h-4 w-4" />
              <AlertDescription>
                Reviewing rule {rule.version_label}. These products are inactive drafts and this page has no publishing controls.
              </AlertDescription>
            </Alert>

            <div className={`rounded-2xl border p-5 ${review.passed ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
              <div className="flex items-start gap-3">
                {review.passed
                  ? <PackageCheck className="mt-0.5 h-6 w-6 text-emerald-700" />
                  : <XCircle className="mt-0.5 h-6 w-6 text-destructive" />}
                <div>
                  <h2 className="font-bold">{review.passed ? 'All five private drafts passed' : 'Draft QA needs attention'}</h2>
                  <p className="mt-1 text-sm">
                    {numberFormat.format(rule.approved_sku_count)} approved prices are preserved;
                    {' '}{numberFormat.format(rule.publish_eligible_sku_count)} remain eligible for a future launch review.
                  </p>
                </div>
              </div>
            </div>

            {review.passed && (
              <div className="rounded-2xl border bg-white p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-bold">Next: build the 25-style private launch batch</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Reuse these five passed drafts and add twenty balanced S&amp;S styles for private product, variant, and cart QA.
                    </p>
                  </div>
                  <Link to="/AdminSSLaunchBatch">
                    <Button className="gap-2">
                      <PackageCheck className="h-4 w-4" /> Open private batch builder
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            <div className="grid gap-5 md:grid-cols-2">
              {review.rows.map(row => {
                const product = row.product;
                return (
                  <article key={row.product_id} className="overflow-hidden rounded-2xl border bg-white">
                    <div className="grid grid-cols-[140px_1fr]">
                      <div className="aspect-square bg-muted">
                        {product?.image_url
                          ? <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                          : <div className="flex h-full items-center justify-center"><ImageIcon className="h-8 w-8 text-muted-foreground" /></div>}
                      </div>
                      <div className="p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={row.passed ? 'default' : 'destructive'}>
                            {row.passed ? 'Passed' : 'Needs review'}
                          </Badge>
                          <Badge variant="outline">Private draft</Badge>
                        </div>
                        <h3 className="mt-3 font-bold">{product?.name || `${row.brand} ${row.part_number}`}</h3>
                        <p className="mt-1 text-lg font-bold text-accent">{money(product?.price)}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.brand} · Style {row.part_number || row.style_id}
                        </p>
                      </div>
                    </div>
                    <div className="border-t p-4">
                      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Check passed={row.checks.private}>Draft and inactive</Check>
                        <Check passed={row.checks.sample}>Marked as test sample</Check>
                        <Check passed={row.checks.source}>S&amp;S source retained</Check>
                        <Check passed={row.checks.image}>Product image present</Check>
                        <Check passed={row.checks.price}>Recommended price present</Check>
                        <Check passed={row.checks.sizes}>{product?.available_sizes?.length || 0} sizes</Check>
                        <Check passed={row.checks.colors}>{product?.available_colors?.length || 0} colors</Check>
                        <Check passed={row.checks.stock}>{numberFormat.format(Number(product?.stock) || 0)} units available</Check>
                      </ul>
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
