import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CircleDollarSign,
  ListChecks,
  Loader2,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const numberFormat = new Intl.NumberFormat('en-US');
const moneyFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const count = (value) => Number(value) || 0;
const money = (value) => moneyFormat.format(Number(value) || 0);

function SummaryCard({ icon, label, value, detail }) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <div className="rounded-xl bg-primary/10 p-2 text-primary">{icon}</div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export default function AdminSSPricingPreview() {
  const [session, setSession] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: latest, error: latestError } = await supabase
        .from('ss_import_staging')
        .select('import_session_id,created_date')
        .order('created_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) return;
      if (latestError || !latest) {
        setError(latestError?.message || 'No S&S staging session was found.');
        setLoading(false);
        return;
      }

      const { data, error: previewError } = await supabase.rpc('ss_sku_pricing_preview', {
        p_style_session_id: latest.import_session_id,
      });
      if (!active) return;
      if (previewError) setError(previewError.message);
      else {
        setSession(latest);
        setRows(data || []);
      }
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  const totals = useMemo(() => {
    const summary = rows.reduce((result, row) => {
      const skus = count(row.total_skus);
      return {
        skus: result.skus + skus,
        costValue: result.costValue + Number(row.average_customer_cost || 0) * skus,
        priceValue: result.priceValue + Number(row.average_proposed_price || 0) * skus,
        marginValue: result.marginValue + Number(row.estimated_contribution_margin || 0) * skus,
        map: result.map + count(row.map_enforced_skus),
        retailCapped: result.retailCapped + count(row.retail_capped_skus),
        aboveRetail: result.aboveRetail + count(row.above_vendor_retail_skus),
        belowSafe: result.belowSafe + count(row.below_safe_margin_skus),
        restricted: result.restricted + count(row.marketplace_restricted_skus),
      };
    }, {
      skus: 0,
      costValue: 0,
      priceValue: 0,
      marginValue: 0,
      map: 0,
      retailCapped: 0,
      aboveRetail: 0,
      belowSafe: 0,
      restricted: 0,
    });

    return {
      ...summary,
      averageCost: summary.skus ? summary.costValue / summary.skus : 0,
      averagePrice: summary.skus ? summary.priceValue / summary.skus : 0,
      averageMargin: summary.skus ? summary.marginValue / summary.skus : 0,
    };
  }, [rows]);

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-primary px-4 py-6 text-primary-foreground">
        <div className="container mx-auto flex max-w-6xl items-center gap-4">
          <Link to="/AdminSSSkuReview">
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">Recommended Pricing Preview</h1>
            <p className="text-sm text-primary-foreground/70">Private calculations—no rules or product prices are saved</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-6xl px-4 py-8">
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
        )}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {!loading && !error && session && (
          <div className="space-y-6">
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                Previewing session {session.import_session_id}. No pricing rule, catalog record, or storefront product is changed.
              </AlertDescription>
            </Alert>

            <div className="rounded-2xl border bg-white p-5">
              <div className="flex items-start gap-3">
                <Calculator className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <div>
                  <h2 className="font-bold">Recommended launch assumptions</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    $1.00 operating allowance per item, 2.9% + $0.30 card processing, $7.99 minimum,
                    MAP protection, vendor-retail cap, and upward `.99` rounding. Shipping, tax, and decoration are excluded.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div className="rounded-lg border p-3"><strong>≤ $5 cost</strong><br />45% target</div>
                    <div className="rounded-lg border p-3"><strong>$5–$15</strong><br />40% target</div>
                    <div className="rounded-lg border p-3"><strong>$15–$30</strong><br />35% target</div>
                    <div className="rounded-lg border p-3"><strong>Over $30</strong><br />30% target</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard
                icon={<CircleDollarSign className="h-5 w-5" />}
                label="Average S&S cost"
                value={money(totals.averageCost)}
                detail={`${numberFormat.format(totals.skus)} privately staged SKUs`}
              />
              <SummaryCard
                icon={<TrendingUp className="h-5 w-5" />}
                label="Average proposed price"
                value={money(totals.averagePrice)}
                detail={`${totals.averageMargin.toFixed(1)}% estimated contribution margin`}
              />
              <SummaryCard
                icon={<ShieldCheck className="h-5 w-5" />}
                label="Retail-capped SKUs"
                value={numberFormat.format(totals.retailCapped)}
                detail="Proposed price was lowered to S&S vendor retail"
              />
              <SummaryCard
                icon={<AlertTriangle className="h-5 w-5" />}
                label="Below 20% margin"
                value={numberFormat.format(totals.belowSafe)}
                detail="Exclude or manually review before approval"
              />
            </div>

            {totals.aboveRetail > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {numberFormat.format(totals.aboveRetail)} SKUs have an S&amp;S MAP value above vendor retail.
                  These vendor-data conflicts require review before approval.
                </AlertDescription>
              </Alert>
            )}
            {totals.belowSafe > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {numberFormat.format(totals.belowSafe)} retail-capped SKUs fall below a 20% contribution margin.
                  They should be excluded or manually repriced before a rule is approved.
                </AlertDescription>
              </Alert>
            )}

            <div className="overflow-hidden rounded-2xl border bg-white">
              <div className="border-b p-5">
                <h2 className="font-bold">Pricing preview by brand</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Results are calculated directly from the current private S&amp;S customer cost.
                </p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead className="text-right">SKUs</TableHead>
                      <TableHead className="text-right">Avg. cost</TableHead>
                      <TableHead>Proposed range</TableHead>
                      <TableHead className="text-right">Avg. price</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead className="text-right">MAP raised</TableHead>
                      <TableHead className="text-right">Retail capped</TableHead>
                      <TableHead className="text-right">Low margin</TableHead>
                      <TableHead className="text-right">Retail conflicts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.brand}>
                        <TableCell className="font-medium">{row.brand}</TableCell>
                        <TableCell className="text-right">{numberFormat.format(count(row.total_skus))}</TableCell>
                        <TableCell className="text-right">{money(row.average_customer_cost)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {money(row.minimum_proposed_price)}–{money(row.maximum_proposed_price)}
                        </TableCell>
                        <TableCell className="text-right">{money(row.average_proposed_price)}</TableCell>
                        <TableCell className="text-right">{Number(row.estimated_contribution_margin || 0).toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{numberFormat.format(count(row.map_enforced_skus))}</TableCell>
                        <TableCell className="text-right">
                          {numberFormat.format(count(row.retail_capped_skus))}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={count(row.below_safe_margin_skus) > 0 ? 'font-semibold text-destructive' : ''}>
                            {numberFormat.format(count(row.below_safe_margin_skus))}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={count(row.above_vendor_retail_skus) > 0 ? 'font-semibold text-destructive' : ''}>
                            {numberFormat.format(count(row.above_vendor_retail_skus))}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-bold">Review pricing exceptions</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Inspect MAP-versus-retail conflicts and low-margin SKUs grouped by style before anything is approved.
                </p>
              </div>
              <Link to="/AdminSSPricingExceptions">
                <Button className="w-full sm:w-auto">
                  <ListChecks className="mr-2 h-4 w-4" />
                  Review exception styles
                </Button>
              </Link>
            </div>

            <Alert>
              <Calculator className="h-4 w-4" />
              <AlertDescription>
                Preview only. After the above-retail exceptions are acceptable, the next step is saving a versioned rule
                and applying it to a small draft-product test—not the public storefront.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </div>
    </div>
  );
}
