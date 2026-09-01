import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Info,
  Loader2,
  PauseCircle,
  Settings2,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function AdminSSApiSettings() {
  const [workflowStatus, setWorkflowStatus] = useState(null);
  const [testing, setTesting] = useState(false);
  const [connection, setConnection] = useState(null);
  const [error, setError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [staging, setStaging] = useState(false);
  const [stagedResult, setStagedResult] = useState(null);
  const [stagingError, setStagingError] = useState('');
  const [contentRefreshing, setContentRefreshing] = useState(false);
  const [contentRefreshResult, setContentRefreshResult] = useState(null);
  const [contentRefreshError, setContentRefreshError] = useState('');

  useEffect(() => {
    let active = true;

    const loadWorkflowStatus = async () => {
      const { data } = await supabase
        .from('ss_catalog_workflow_status')
        .select('product_loading_paused,pause_message,api_read_checks_enabled,controlled_cold_weather_batch_allowed')
        .eq('id', true)
        .maybeSingle();

      if (active) setWorkflowStatus(data || null);
    };

    loadWorkflowStatus();
    return () => {
      active = false;
    };
  }, []);

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

  const handleTestConnection = async () => {
    setTesting(true);
    setConnection(null);
    setError('');

    const { data, error: invokeError } = await supabase.functions.invoke('ss-activewear', {
      body: { action: 'test_connection' },
    });

    if (invokeError) {
      setError(await invokeMessage(invokeError, 'Connection test failed.'));
    } else if (!data?.connected) {
      setError(data?.error || 'S&S did not confirm the connection.');
    } else {
      setConnection(data);
    }

    setTesting(false);
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    setPreview(null);
    setPreviewError('');
    const { data, error: invokeError } = await supabase.functions.invoke('ss-activewear', {
      body: { action: 'preview_catalog' },
    });

    if (invokeError) {
      setPreviewError(await invokeMessage(invokeError, 'Catalog preview failed.'));
    } else if (!data?.preview) {
      setPreviewError(data?.error || 'S&S did not return a catalog preview.');
    } else {
      setPreview(data);
    }
    setPreviewLoading(false);
  };

  const handleStageStyles = async () => {
    if (!window.confirm('Stage these S&S styles for private admin review? No storefront products will be changed.')) return;
    setStaging(true);
    setStagedResult(null);
    setStagingError('');
    const { data, error: invokeError } = await supabase.functions.invoke('ss-activewear', {
      body: { action: 'stage_styles' },
    });

    if (invokeError) {
      setStagingError(await invokeMessage(invokeError, 'Staging import failed.'));
    } else if (!data?.staged) {
      setStagingError(data?.error || 'S&S did not complete the staging import.');
    } else {
      setStagedResult(data);
    }
    setStaging(false);
  };

  const handleColdWeatherStage = async () => {
    if (!window.confirm(
      'Stage eligible Columbia and approved cold-weather styles as private admin data? Nothing will be published.',
    )) return;
    setStaging(true);
    setStagedResult(null);
    setStagingError('');
    const { data, error: invokeError } = await supabase.functions.invoke('ss-activewear', {
      body: { action: 'stage_cold_weather_styles' },
    });

    if (invokeError) {
      setStagingError(await invokeMessage(invokeError, 'Cold-weather staging failed.'));
    } else if (!data?.staged) {
      setStagingError(data?.error || 'S&S did not complete the cold-weather staging import.');
    } else {
      setStagedResult(data);
    }
    setStaging(false);
  };

  const handleContentRefresh = async () => {
    if (!window.confirm(
      'Refresh descriptions and manufacturer specifications for existing S&S products? '
      + 'This does not add, publish, price, or order products.',
    )) return;

    setContentRefreshing(true);
    setContentRefreshResult(null);
    setContentRefreshError('');
    const { data, error: invokeError } = await supabase.functions.invoke('ss-activewear', {
      body: { action: 'refresh_public_style_content' },
    });

    if (invokeError) {
      setContentRefreshError(await invokeMessage(invokeError, 'S&S content refresh failed.'));
    } else if (!data?.refreshed) {
      setContentRefreshError(data?.error || 'S&S did not complete the content refresh.');
    } else {
      setContentRefreshResult(data);
    }
    setContentRefreshing(false);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-primary text-primary-foreground py-6 px-4">
        <div className="container mx-auto flex items-center gap-4">
          <Link to="/AdminSSCatalog">
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-accent" />
              S&amp;S Activewear API
            </h1>
            <p className="text-primary-foreground/70 text-sm">Secure vendor connection</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {workflowStatus?.product_loading_paused && (
          <div className="mb-6 flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-5">
            <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="font-semibold">
                {workflowStatus.pause_message || 'Product loading is paused. Current catalog is stable.'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connection tests, catalog previews, and private pricing/inventory data refreshes remain available.
                Automatic product loading remains disabled.
                {workflowStatus.controlled_cold_weather_batch_allowed
                  && ' One controlled private cold-weather batch is allowed and still requires QA and approval.'}
              </p>
            </div>
          </div>
        )}

        <div className="bg-accent/10 border border-accent/30 rounded-2xl p-5 mb-6 flex gap-3">
          <ShieldCheck className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Credentials protected</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your account number and API key are encrypted as Supabase Edge Function secrets.
              They are never sent to this browser or stored in the product database.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-lg">Connection status</h2>
              <p className="text-sm text-muted-foreground">Runs a read-only request against the S&amp;S Brands endpoint.</p>
            </div>
            {connection ? (
              <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
                <Wifi className="w-3 h-3" /> Connected
              </Badge>
            ) : (
              <Badge className="bg-gray-100 text-gray-600 flex items-center gap-1">
                <WifiOff className="w-3 h-3" /> Not tested
              </Badge>
            )}
          </div>

          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

          {connection && (
            <Alert>
              <CheckCircle2 className="w-4 h-4" />
              <AlertDescription>
                Connected to {connection.endpoint}.
                {Number.isInteger(connection.brands_available) && ` ${connection.brands_available} brands are available.`}
                {connection.rate_limit_remaining && ` ${connection.rate_limit_remaining} API requests remain in the current window.`}
              </AlertDescription>
            </Alert>
          )}

          <Button className="w-full gap-2" onClick={handleTestConnection} disabled={testing}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
            {testing ? 'Testing connection...' : 'Test S&S connection'}
          </Button>
        </div>

        <div className="mt-6 bg-white rounded-2xl border shadow-sm p-6">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold">Next integration stage</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Preview approved-brand data and refresh private pricing or inventory checks.
                Product loading remains paused and no storefront products are changed here.
              </p>
            </div>
          </div>
          <Button variant="outline" className="w-full mt-5 gap-2" onClick={handlePreview} disabled={previewLoading}>
            {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Info className="w-4 h-4" />}
            {previewLoading ? 'Loading approved brands...' : 'Preview approved-brand catalog'}
          </Button>
          {previewError && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{previewError}</AlertDescription>
            </Alert>
          )}
          {preview && (
            <div className="mt-5 space-y-4">
              <Alert>
                <CheckCircle2 className="w-4 h-4" />
                <AlertDescription>
                  Found {preview.matching_styles} styles across {preview.approved_brands} approved brands.
                  No catalog records were changed.
                </AlertDescription>
              </Alert>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {preview.brand_counts.map(({ brand, styles }) => (
                  <div key={brand} className="flex justify-between rounded-lg border px-3 py-2 text-sm">
                    <span>{brand}</span>
                    <span className="font-semibold">{styles}</span>
                  </div>
                ))}
              </div>
              {preview.unresolved_brands?.length > 0 && (
                <p className="text-xs text-amber-700">
                  No exact S&amp;S brand match: {preview.unresolved_brands.join(', ')}
                </p>
              )}
              {preview.unresolved_brands?.length === 0 && !stagedResult && (
                <Button className="w-full gap-2" onClick={handleStageStyles} disabled={staging}>
                  {staging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                  {staging ? 'Refreshing private data...' : `Refresh ${preview.matching_styles} styles for data checks`}
                </Button>
              )}
              {workflowStatus?.controlled_cold_weather_batch_allowed && !stagedResult && (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={handleColdWeatherStage}
                  disabled={staging}
                >
                  {staging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                  {staging ? 'Staging cold-weather catalog...' : 'Stage Columbia + cold-weather styles privately'}
                </Button>
              )}
              {stagingError && (
                <Alert variant="destructive">
                  <AlertDescription>{stagingError}</AlertDescription>
                </Alert>
              )}
              {stagedResult && (
                <Alert>
                  <CheckCircle2 className="w-4 h-4" />
                  <AlertDescription>
                    {stagedResult.staged_styles} styles are in private staging.
                    {stagedResult.reused ? ' The existing pending session was reused.' : ' No storefront records were changed.'}
                    {' '}<Link to="/AdminSSStagedImport" className="font-semibold underline">Review staging</Link>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 bg-white rounded-2xl border shadow-sm p-6">
          <div className="flex gap-3">
            <Database className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold">Refresh product descriptions and specs</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Imports S&amp;S style descriptions and manufacturer specification rows for products already in
                the catalog. This read-only vendor lookup cannot add products, publish products, change prices,
                or place an order.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full mt-5 gap-2"
            onClick={handleContentRefresh}
            disabled={contentRefreshing}
          >
            {contentRefreshing
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Database className="w-4 h-4" />}
            {contentRefreshing ? 'Refreshing S&S content...' : 'Refresh S&S descriptions and specs'}
          </Button>
          {contentRefreshError && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{contentRefreshError}</AlertDescription>
            </Alert>
          )}
          {contentRefreshResult && (
            <Alert className="mt-4">
              <CheckCircle2 className="w-4 h-4" />
              <AlertDescription>
                Reviewed {contentRefreshResult.products_reviewed} existing products and updated{' '}
                {contentRefreshResult.products_updated}. Descriptions are available for{' '}
                {contentRefreshResult.products_with_description}; manufacturer specs are available for{' '}
                {contentRefreshResult.products_with_specs}. No products were added or published and no S&amp;S
                order was submitted.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
