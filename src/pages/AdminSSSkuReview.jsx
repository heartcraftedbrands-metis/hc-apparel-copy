import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Database,
  Image,
  Loader2,
  PackageCheck,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
const percent = (covered, total) => total > 0 ? Math.round((covered / total) * 1000) / 10 : 0;

function MetricCard({ icon, label, value, detail, progress }) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <div className="rounded-xl bg-primary/10 p-2 text-primary">{icon}</div>
      </div>
      {Number.isFinite(progress) && <Progress value={progress} className="mt-4 h-2" />}
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export default function AdminSSSkuReview() {
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

      const { data, error: summaryError } = await supabase.rpc('ss_sku_review_summary', {
        p_style_session_id: latest.import_session_id,
      });
      if (!active) return;
      if (summaryError) setError(summaryError.message);
      else {
        setSession(latest);
        setRows(data || []);
      }
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  const totals = useMemo(() => rows.reduce((summary, row) => ({
    styles: summary.styles + count(row.total_styles),
    skus: summary.skus + count(row.total_skus),
    priced: summary.priced + count(row.priced_skus),
    inStock: summary.inStock + count(row.in_stock_skus),
    images: summary.images + count(row.image_skus),
    missingPrice: summary.missingPrice + count(row.missing_price_skus),
    missingImage: summary.missingImage + count(row.missing_image_skus),
    missingColor: summary.missingColor + count(row.missing_color_skus),
    missingSize: summary.missingSize + count(row.missing_size_skus),
    restricted: summary.restricted + count(row.marketplace_restricted_skus),
    inventory: summary.inventory + count(row.total_inventory),
  }), {
    styles: 0,
    skus: 0,
    priced: 0,
    inStock: 0,
    images: 0,
    missingPrice: 0,
    missingImage: 0,
    missingColor: 0,
    missingSize: 0,
    restricted: 0,
    inventory: 0,
  }), [rows]);

  const priceCoverage = percent(totals.priced, totals.skus);
  const imageCoverage = percent(totals.images, totals.skus);
  const inventoryCoverage = percent(totals.inStock, totals.skus);
  const criticalIssues = totals.missingPrice + totals.missingColor + totals.missingSize;

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-primary px-4 py-6 text-primary-foreground">
        <div className="container mx-auto flex max-w-6xl items-center gap-4">
          <Link to="/AdminSSStagedImport">
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">S&amp;S SKU Quality Review</h1>
            <p className="text-sm text-primary-foreground/70">Private validation—publishing remains disabled</p>
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
                Reviewing session {session.import_session_id}. This dashboard is read-only and cannot publish products.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                icon={<Database className="h-5 w-5" />}
                label="Private SKUs"
                value={numberFormat.format(totals.skus)}
                detail={`${numberFormat.format(totals.styles)} styles across ${rows.length} brands`}
              />
              <MetricCard
                icon={<CircleDollarSign className="h-5 w-5" />}
                label="Customer price coverage"
                value={`${priceCoverage}%`}
                detail={`${numberFormat.format(totals.missingPrice)} SKUs missing a usable customer price`}
                progress={priceCoverage}
              />
              <MetricCard
                icon={<PackageCheck className="h-5 w-5" />}
                label="Currently in stock"
                value={`${inventoryCoverage}%`}
                detail={`${numberFormat.format(totals.inStock)} SKUs · ${numberFormat.format(totals.inventory)} units`}
                progress={inventoryCoverage}
              />
              <MetricCard
                icon={<Image className="h-5 w-5" />}
                label="Image coverage"
                value={`${imageCoverage}%`}
                detail={`${numberFormat.format(totals.missingImage)} SKUs without a color or model image`}
                progress={imageCoverage}
              />
            </div>

            {criticalIssues > 0 ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {numberFormat.format(criticalIssues)} critical field exceptions need review:
                  {' '}{numberFormat.format(totals.missingPrice)} price,
                  {' '}{numberFormat.format(totals.missingColor)} color, and
                  {' '}{numberFormat.format(totals.missingSize)} size.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>All staged SKUs have customer price, color, and size values.</AlertDescription>
              </Alert>
            )}

            <div className="overflow-hidden rounded-2xl border bg-white">
              <div className="border-b p-5">
                <h2 className="font-bold">Coverage by brand</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Marketplace restrictions are retained so prohibited SKUs can be excluded before publishing.
                </p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead className="text-right">SKUs</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">In stock</TableHead>
                      <TableHead className="text-right">Images</TableHead>
                      <TableHead className="text-right">Colors</TableHead>
                      <TableHead className="text-right">Sizes</TableHead>
                      <TableHead className="text-right">Restricted</TableHead>
                      <TableHead>Price range</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const total = count(row.total_skus);
                      const missingCritical = count(row.missing_price_skus)
                        + count(row.missing_color_skus)
                        + count(row.missing_size_skus);
                      return (
                        <TableRow key={row.brand}>
                          <TableCell>
                            <div className="flex items-center gap-2 font-medium">
                              {row.brand}
                              {missingCritical === 0
                                ? <Badge className="bg-green-100 text-green-800">Ready</Badge>
                                : <Badge variant="destructive">Review</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{numberFormat.format(total)}</TableCell>
                          <TableCell className="text-right">{percent(count(row.priced_skus), total)}%</TableCell>
                          <TableCell className="text-right">{percent(count(row.in_stock_skus), total)}%</TableCell>
                          <TableCell className="text-right">{percent(count(row.image_skus), total)}%</TableCell>
                          <TableCell className="text-right">{numberFormat.format(count(row.unique_colors))}</TableCell>
                          <TableCell className="text-right">{numberFormat.format(count(row.unique_sizes))}</TableCell>
                          <TableCell className="text-right">
                            {numberFormat.format(count(row.marketplace_restricted_skus))}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {row.minimum_customer_price === null
                              ? 'No price'
                              : `${moneyFormat.format(Number(row.minimum_customer_price))}–${moneyFormat.format(
                                Number(row.maximum_customer_price),
                              )}`}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <Alert>
              <Database className="h-4 w-4" />
              <AlertDescription>
                No approval or publishing action is enabled yet. The next step is reviewing exception SKUs and defining
                storefront pricing rules.
              </AlertDescription>
            </Alert>
            <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-green-900">SKU quality checks passed</p>
                  <p className="mt-1 text-sm text-green-800">
                    Continue to a read-only recommended pricing preview before saving any rules.
                  </p>
                </div>
                <Link to="/AdminSSPricingPreview">
                  <Button className="w-full gap-2 sm:w-auto">
                    <Calculator className="h-4 w-4" />
                    Preview recommended pricing
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
