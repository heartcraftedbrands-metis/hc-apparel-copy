import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ClipboardCheck, Database, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

async function fetchSyncRuns(styleSessionId) {
  return supabase
    .from('ss_sku_sync_runs')
    .select('brand,status,total_styles,total_skus,skipped_rows,api_requests,rate_limit_remaining,error_message,completed_at')
    .eq('style_session_id', styleSessionId)
    .order('brand');
}

export default function AdminSSStagedImport() {
  const [rows, setRows] = useState([]);
  const [session, setSession] = useState(null);
  const [syncRuns, setSyncRuns] = useState([]);
  const [syncingBrand, setSyncingBrand] = useState('');
  const [syncError, setSyncError] = useState('');
  const [lastSync, setLastSync] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: latest, error: latestError } = await supabase
        .from('ss_import_staging')
        .select('import_session_id,created_date,total_staged_rows')
        .order('created_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) return;
      if (latestError) {
        setError(latestError.message);
        setLoading(false);
        return;
      }
      if (!latest) {
        setLoading(false);
        return;
      }

      const [rowsResult, runsResult] = await Promise.all([
        supabase
          .from('ss_import_staging')
          .select('brand,row_status,product_category')
          .eq('import_session_id', latest.import_session_id)
          .order('brand'),
        fetchSyncRuns(latest.import_session_id),
      ]);

      if (!active) return;
      if (rowsResult.error) setError(rowsResult.error.message);
      else if (runsResult.error) setError(runsResult.error.message);
      else {
        setSession(latest);
        setRows(rowsResult.data || []);
        setSyncRuns(runsResult.data || []);
      }
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  const brandCounts = useMemo(() => {
    const counts = {};
    for (const row of rows) counts[row.brand] = (counts[row.brand] || 0) + 1;
    return Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  }, [rows]);

  const syncRunsByBrand = useMemo(
    () => Object.fromEntries(syncRuns.map((run) => [run.brand, run])),
    [syncRuns],
  );
  const allBrandsSynced = brandCounts.length > 0
    && brandCounts.every(([brand]) => syncRunsByBrand[brand]?.status === 'completed');

  const invokeMessage = async (invokeError, fallback) => {
    let message = invokeError?.message || fallback;
    try {
      const details = await invokeError?.context?.json();
      if (details?.error) message = details.error;
    } catch {
      // The generic invocation error is still safe to display.
    }
    return message;
  };

  const handleSyncBrand = async (brand) => {
    if (!window.confirm(
      `Retrieve live S&S SKU details for ${brand}? Data stays in private staging and will not change the storefront.`,
    )) return;

    setSyncingBrand(brand);
    setSyncError('');
    setLastSync(null);
    const { data, error: invokeError } = await supabase.functions.invoke('ss-activewear', {
      body: { action: 'sync_brand_products', brand },
    });

    if (invokeError) {
      setSyncError(await invokeMessage(invokeError, `Unable to sync ${brand}.`));
    } else if (!data?.synced) {
      setSyncError(data?.error || `S&S did not complete the ${brand} SKU sync.`);
    } else {
      setLastSync(data);
    }

    if (session?.import_session_id) {
      const { data: refreshedRuns, error: runsError } = await fetchSyncRuns(session.import_session_id);
      if (runsError) setSyncError((current) => current || runsError.message);
      else setSyncRuns(refreshedRuns || []);
    }
    setSyncingBrand('');
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-primary text-primary-foreground py-6 px-4">
        <div className="container mx-auto max-w-4xl flex items-center gap-4">
          <Link to="/AdminSSApiSettings">
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">S&amp;S Style Staging</h1>
            <p className="text-sm text-primary-foreground/70">Private review area—nothing here is published</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-4 py-8">
        {loading && (
          <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin" /></div>
        )}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {!loading && !error && !session && (
          <div className="rounded-2xl border bg-white p-10 text-center">
            <Database className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-semibold">No staged S&amp;S styles yet</p>
            <Link to="/AdminSSApiSettings"><Button className="mt-4">Return to API preview</Button></Link>
          </div>
        )}
        {!loading && session && (
          <div className="space-y-6">
            <Alert>
              <Database className="w-4 h-4" />
              <AlertDescription>
                {rows.length} styles are staged in session {session.import_session_id}. No storefront products were changed.
              </AlertDescription>
            </Alert>
            {allBrandsSynced && (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="flex items-center gap-2 font-semibold text-green-900">
                      <CheckCircle2 className="h-5 w-5" />
                      All approved brands are privately staged
                    </p>
                    <p className="mt-1 text-sm text-green-800">
                      Review price, inventory, image, color, and size coverage before any publishing work begins.
                    </p>
                  </div>
                  <Link to="/AdminSSSkuReview">
                    <Button className="w-full gap-2 sm:w-auto">
                      <ClipboardCheck className="h-4 w-4" />
                      Review SKU quality
                    </Button>
                  </Link>
                </div>
              </div>
            )}
            <div className="rounded-2xl border bg-white p-6">
              <h2 className="font-bold text-lg">Sync SKU details by brand</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-5">
                Run one brand at a time. Each sync retrieves private pricing, inventory, sizes, colors, and images.
              </p>
              {syncError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{syncError}</AlertDescription>
                </Alert>
              )}
              {lastSync && (
                <Alert className="mb-4">
                  <CheckCircle2 className="w-4 h-4" />
                  <AlertDescription>
                    Staged {lastSync.skus} {lastSync.brand} SKUs from {lastSync.styles} styles.
                    No storefront records were changed.
                    {Number.isInteger(lastSync.rate_limit_remaining) &&
                      ` ${lastSync.rate_limit_remaining} API requests remain in the current window.`}
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-1 gap-2">
                {brandCounts.map(([brand, count]) => (
                  <div
                    key={brand}
                    className="flex flex-col gap-3 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{brand}</span>
                        <Badge variant="outline">{count} styles</Badge>
                        {syncRunsByBrand[brand]?.status === 'completed' && (
                          <Badge className="bg-green-100 text-green-800">
                            {syncRunsByBrand[brand].total_skus} SKUs staged
                          </Badge>
                        )}
                        {syncRunsByBrand[brand]?.status === 'failed' && (
                          <Badge variant="destructive">Sync failed</Badge>
                        )}
                      </div>
                      {syncRunsByBrand[brand]?.status === 'completed' && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {syncRunsByBrand[brand].api_requests} API requests
                          {Number.isInteger(syncRunsByBrand[brand].rate_limit_remaining) &&
                            ` · ${syncRunsByBrand[brand].rate_limit_remaining} remaining`}
                        </p>
                      )}
                      {syncRunsByBrand[brand]?.error_message && (
                        <p className="mt-1 text-xs text-destructive">{syncRunsByBrand[brand].error_message}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={syncRunsByBrand[brand]?.status === 'completed' ? 'outline' : 'default'}
                      className="w-full shrink-0 gap-2 sm:w-auto"
                      onClick={() => handleSyncBrand(brand)}
                      disabled={Boolean(syncingBrand)}
                    >
                      {syncingBrand === brand ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      {syncingBrand === brand
                        ? 'Syncing...'
                        : syncRunsByBrand[brand]?.status === 'completed'
                          ? 'Refresh details'
                          : 'Sync SKU details'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              SKU details remain private until the review and approval phase is built. Existing catalog duplicates and
              storefront products are not modified by this process.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
