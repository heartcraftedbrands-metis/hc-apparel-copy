import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  Loader2,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
const range = (minimum, maximum) => Number(minimum) === Number(maximum)
  ? money(minimum)
  : `${money(minimum)}–${money(maximum)}`;

const issueDetails = {
  map_above_vendor_retail: {
    label: 'MAP exceeds retail',
    recommendation: 'Use recommended MAP price; warning retained',
  },
  below_20_percent_margin: {
    label: 'Below 20% margin',
    recommendation: 'Use recommended price; low-margin warning retained',
  },
};

export default function AdminSSPricingExceptions() {
  const [session, setSession] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);
  const [approval, setApproval] = useState(null);
  const [approvalError, setApprovalError] = useState('');

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

      const { data, error: exceptionsError } = await supabase.rpc('ss_sku_pricing_exceptions', {
        p_style_session_id: latest.import_session_id,
      });
      if (!active) return;
      if (exceptionsError) setError(exceptionsError.message);
      else {
        setSession(latest);
        setRows(data || []);

        const { data: existingApproval, error: approvalLookupError } = await supabase
          .from('ss_pricing_rule_versions')
          .select('id,version_label,approved_sku_count,publish_eligible_sku_count,draft_product_count')
          .eq('style_session_id', latest.import_session_id)
          .maybeSingle();
        if (!active) return;
        if (approvalLookupError) setApprovalError(approvalLookupError.message);
        else if (existingApproval) {
          setApproval({
            rule_version_id: existingApproval.id,
            version_label: existingApproval.version_label,
            approved_sku_count: existingApproval.approved_sku_count,
            publish_eligible_sku_count: existingApproval.publish_eligible_sku_count,
            draft_product_count: existingApproval.draft_product_count,
            already_approved: true,
          });
        }
      }
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  const totals = useMemo(() => rows.reduce((summary, row) => ({
    retailConflicts: summary.retailConflicts
      + (row.issue_type === 'map_above_vendor_retail' ? count(row.affected_skus) : 0),
    lowMargin: summary.lowMargin
      + (row.issue_type === 'below_20_percent_margin' ? count(row.affected_skus) : 0),
  }), { retailConflicts: 0, lowMargin: 0 }), [rows]);

  const approveRecommendedPrices = async () => {
    if (!session) return;
    setApproving(true);
    setApprovalError('');
    const { data, error: approvalRpcError } = await supabase.rpc('approve_ss_recommended_pricing', {
      p_style_session_id: session.import_session_id,
      p_draft_product_limit: 5,
    });
    if (approvalRpcError) setApprovalError(approvalRpcError.message);
    else setApproval(data?.[0] || null);
    setApproving(false);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-primary px-4 py-6 text-primary-foreground">
        <div className="container mx-auto flex max-w-6xl items-center gap-4">
          <Link to="/AdminSSPricingPreview">
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">S&amp;S Pricing Exceptions</h1>
            <p className="text-sm text-primary-foreground/70">Grouped by style for private review</p>
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
                Reviewing session {session.import_session_id}. This page is read-only and cannot exclude, reprice, or publish SKUs.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-muted-foreground">MAP above vendor retail</p>
                <p className="mt-1 text-3xl font-bold">{numberFormat.format(totals.retailConflicts)}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Recommended MAP prices will be used; the vendor-data warning remains visible.
                </p>
              </div>
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-muted-foreground">Below 20% contribution margin</p>
                <p className="mt-1 text-3xl font-bold">{numberFormat.format(totals.lowMargin)}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Recommended prices will be used even though the estimated margin is below 20%.
                </p>
              </div>
            </div>

            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Decision recorded for review: use the recommended proposed price for all
                {' '}{numberFormat.format(totals.retailConflicts + totals.lowMargin)} exception SKUs.
                Warnings remain visible for audit and do not override marketplace restrictions.
              </AlertDescription>
            </Alert>

            {approval ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" />
                  <div className="flex-1">
                    <h2 className="font-bold text-emerald-950">Recommended pricing saved privately</h2>
                    <p className="mt-1 text-sm text-emerald-900">
                      Rule {approval.version_label} preserves {numberFormat.format(count(approval.approved_sku_count))}
                      {' '}approved SKU prices. {numberFormat.format(count(approval.publish_eligible_sku_count))}
                      {' '}are eligible for a future storefront review, and {numberFormat.format(count(approval.draft_product_count))}
                      {' '}inactive draft products were created for testing.
                    </p>
                    <Link to="/AdminProducts?tab=draft_ss" className="mt-4 inline-block">
                      <Button variant="outline">Open private draft products</Button>
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="flex items-center gap-2 font-bold">
                      <Database className="h-4 w-4" />
                      Use all recommended prices
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Saves a versioned private price for every staged SKU and creates five inactive draft products.
                      This cannot publish products or place vendor orders.
                    </p>
                  </div>
                  <Button onClick={approveRecommendedPrices} disabled={approving}>
                    {approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Save prices and build drafts
                  </Button>
                </div>
              </div>
            )}

            {approvalError && (
              <Alert variant="destructive">
                <AlertDescription>{approvalError}</AlertDescription>
              </Alert>
            )}

            <div className="overflow-hidden rounded-2xl border bg-white">
              <div className="border-b p-5">
                <h2 className="flex items-center gap-2 font-bold">
                  <Search className="h-4 w-4" />
                  Exception styles
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Multiple size and color SKUs are consolidated into each style row.
                </p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Issue</TableHead>
                      <TableHead>Brand / style</TableHead>
                      <TableHead className="text-right">SKUs</TableHead>
                      <TableHead>Customer cost</TableHead>
                      <TableHead>MAP</TableHead>
                      <TableHead>Vendor retail</TableHead>
                      <TableHead>Proposed</TableHead>
                      <TableHead className="text-right">Lowest margin</TableHead>
                      <TableHead>Recommendation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const details = issueDetails[row.issue_type] || {
                        label: row.issue_type,
                        recommendation: 'Manual review',
                      };
                      return (
                        <TableRow key={`${row.issue_type}-${row.brand}-${row.style_id}`}>
                          <TableCell>
                            <Badge variant="destructive">{details.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{row.brand} {row.style_name || row.part_number}</p>
                            <p className="text-xs text-muted-foreground">{row.part_number || `Style ${row.style_id}`}</p>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {numberFormat.format(count(row.affected_skus))}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {range(row.minimum_customer_cost, row.maximum_customer_cost)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {range(row.minimum_map_price, row.maximum_map_price)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {range(row.minimum_vendor_retail, row.maximum_vendor_retail)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {range(row.minimum_proposed_price, row.maximum_proposed_price)}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(row.minimum_contribution_margin || 0).toFixed(1)}%
                          </TableCell>
                          <TableCell className="min-w-48 text-sm">{details.recommendation}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
