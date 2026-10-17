import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Info,
  Loader2,
  PauseCircle,
  Ruler,
  Settings2,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import LiveSSSubmissionPanel from '@/components/orders/LiveSSSubmissionPanel';

export default function AdminSSApiSettings() {
  const [workflowStatus, setWorkflowStatus] = useState(null);
  const [testing, setTesting] = useState(false);
  const [connection, setConnection] = useState(null);
  const [error, setError] = useState('');
  const [carharttChecking, setCarharttChecking] = useState(false);
  const [carharttSource, setCarharttSource] = useState(null);
  const [carharttError, setCarharttError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [staging, setStaging] = useState(false);
  const [stagedResult, setStagedResult] = useState(null);
  const [stagingError, setStagingError] = useState('');
  const [exactBrand, setExactBrand] = useState('Shaka Wear');
  const [exactStyleNumbers, setExactStyleNumbers] = useState('');
  const [exactStaging, setExactStaging] = useState(false);
  const [exactStageResult, setExactStageResult] = useState(null);
  const [exactStageError, setExactStageError] = useState('');
  const [autoPublishing, setAutoPublishing] = useState(false);
  const [autoPublishResult, setAutoPublishResult] = useState(null);
  const [autoPublishError, setAutoPublishError] = useState('');
  const [contentRefreshing, setContentRefreshing] = useState(false);
  const [contentRefreshResult, setContentRefreshResult] = useState(null);
  const [contentRefreshError, setContentRefreshError] = useState('');
  const [sizeGuideRefreshing, setSizeGuideRefreshing] = useState(false);
  const [sizeGuideRefreshResult, setSizeGuideRefreshResult] = useState(null);
  const [sizeGuideRefreshError, setSizeGuideRefreshError] = useState('');
  const [sizeGuideAudit, setSizeGuideAudit] = useState([]);
  const [sizeGuideAuditLoading, setSizeGuideAuditLoading] = useState(true);
  const [paymentEmail, setPaymentEmail] = useState('');
  const [paymentProfiles, setPaymentProfiles] = useState([]);
  const [selectedPaymentProfile, setSelectedPaymentProfile] = useState('');
  const [paymentProfilesLoading, setPaymentProfilesLoading] = useState(false);
  const [paymentProfileSaving, setPaymentProfileSaving] = useState(false);
  const [paymentProfileMessage, setPaymentProfileMessage] = useState('');
  const [paymentProfileError, setPaymentProfileError] = useState('');

  useEffect(() => {
    let active = true;

    const loadWorkflowStatus = async () => {
      const { data } = await supabase
        .from('ss_catalog_workflow_status')
        .select('product_loading_paused,pause_message,api_read_checks_enabled,controlled_cold_weather_batch_allowed')
        .eq('id', true)
        .maybeSingle();

      if (active) setWorkflowStatus(data || null);

      const { data: adminStatus } = await supabase.functions.invoke('ss-activewear', {
        body: { action: 'get_admin_status' },
      });
      if (active && adminStatus) {
        setPaymentEmail(adminStatus.ss_payment_profile_email || '');
        setSelectedPaymentProfile(adminStatus.ss_default_payment_profile_id
          ? String(adminStatus.ss_default_payment_profile_id)
          : '');
      }
    };

    loadWorkflowStatus();
    return () => {
      active = false;
    };
  }, []);

  const loadSizeGuideAudit = async () => {
    setSizeGuideAuditLoading(true);
    const { data, error: auditError } = await supabase.rpc('admin_product_size_guide_audit');
    if (!auditError) setSizeGuideAudit(data || []);
    setSizeGuideAuditLoading(false);
  };

  useEffect(() => {
    loadSizeGuideAudit();
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

  const handleLoadPaymentProfiles = async () => {
    setPaymentProfilesLoading(true);
    setPaymentProfileError('');
    setPaymentProfileMessage('');
    const { data, error: invokeError } = await supabase.functions.invoke('ss-activewear', {
      body: { action: 'list_payment_profiles', payment_profile_email: paymentEmail },
    });
    if (invokeError) {
      setPaymentProfileError(await invokeMessage(invokeError, 'S&S payment profiles could not be loaded.'));
    } else {
      setPaymentProfiles(data?.profiles || []);
      setSelectedPaymentProfile(data?.selected_profile_id ? String(data.selected_profile_id) : '');
      setPaymentProfileMessage(data?.message || 'Payment profiles loaded.');
    }
    setPaymentProfilesLoading(false);
  };

  const handleSavePaymentProfile = async () => {
    setPaymentProfileSaving(true);
    setPaymentProfileError('');
    setPaymentProfileMessage('');
    const { data, error: invokeError } = await supabase.functions.invoke('ss-activewear', {
      body: {
        action: 'set_default_payment_profile',
        payment_profile_email: paymentEmail,
        payment_profile_id: Number(selectedPaymentProfile),
      },
    });
    if (invokeError) {
      setPaymentProfileError(await invokeMessage(invokeError, 'Default S&S PaymentProfile could not be saved.'));
    } else {
      setPaymentProfiles(data?.profiles || paymentProfiles);
      setSelectedPaymentProfile(String(data?.selected_profile_id || selectedPaymentProfile));
      setPaymentProfileMessage('Default S&S PaymentProfile saved and verified. No order was submitted.');
    }
    setPaymentProfileSaving(false);
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

  const handleVerifyCarharttSource = async () => {
    setCarharttChecking(true);
    setCarharttSource(null);
    setCarharttError('');
    const { data, error: invokeError } = await supabase.functions.invoke('ss-activewear', {
      body: { action: 'verify_carhartt_source' },
    });
    if (invokeError) {
      setCarharttError(await invokeMessage(invokeError, 'Carhartt sourcing could not be verified.'));
    } else if (!data?.authenticated) {
      setCarharttError(data?.error || 'Carhartt sourcing could not be verified.');
    } else {
      setCarharttSource(data);
    }
    setCarharttChecking(false);
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

  const handleExactStyleStage = async () => {
    const styleNumbers = exactStyleNumbers.split(/[\s,]+/).map(value => value.trim()).filter(Boolean);
    if (styleNumbers.length === 0) {
      setExactStageError('Enter at least one exact manufacturer style number.');
      return;
    }
    setExactStaging(true);
    setExactStageResult(null);
    setExactStageError('');
    const { data, error: invokeError } = await supabase.functions.invoke('ss-activewear', {
      body: { action: 'stage_exact_styles', brand: exactBrand, style_numbers: styleNumbers },
    });
    if (invokeError) {
      setExactStageError(await invokeMessage(invokeError, 'Exact-style staging failed.'));
    } else if (!data?.staged) {
      setExactStageError(data?.error || 'S&S did not complete the exact-style staging request.');
    } else {
      setExactStageResult(data);
    }
    setExactStaging(false);
  };

  const handleSyncPublishAdvertised = async () => {
    setAutoPublishing(true);
    setAutoPublishResult(null);
    setAutoPublishError('');
    const { data, error: invokeError } = await supabase.functions.invoke('ss-activewear', {
      body: { action: 'sync_publish_advertised_products' },
    });
    if (invokeError) setAutoPublishError(await invokeMessage(invokeError, 'S&S synchronization and publication failed.'));
    else if (!data?.completed) setAutoPublishError(data?.error || 'S&S did not complete the catalog workflow.');
    else setAutoPublishResult(data);
    setAutoPublishing(false);
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

  const handleSizeGuideRefresh = async () => {
    setSizeGuideRefreshing(true);
    setSizeGuideRefreshResult(null);
    setSizeGuideRefreshError('');
    const { data, error: invokeError } = await supabase.functions.invoke('ss-activewear', {
      body: { action: 'refresh_product_size_guides' },
    });
    if (invokeError) {
      setSizeGuideRefreshError(await invokeMessage(invokeError, 'The size-guide audit could not be completed.'));
    } else if (!data?.refreshed) {
      setSizeGuideRefreshError(data?.error || 'The size-guide audit could not be completed.');
    } else {
      setSizeGuideRefreshResult(data);
      await loadSizeGuideAudit();
    }
    setSizeGuideRefreshing(false);
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
              S&amp;S Vendor Settings
            </h1>
            <p className="text-primary-foreground/70 text-sm">Secure, administrator-controlled vendor fulfillment</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <LiveSSSubmissionPanel />

        <div className="mt-6 rounded-2xl border border-primary/20 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3"><Database className="mt-0.5 h-5 w-5 text-accent" /><div><h2 className="font-bold text-lg">Advertised S&amp;S catalog</h2><p className="mt-1 text-sm text-muted-foreground">One authenticated action synchronizes exact supplier SKUs, applies active HC Apparel pricing rules, runs publication safeguards, and publishes eligible products. Genuine exceptions are reported without stopping other products.</p></div></div>
          <Button type="button" className="mt-4 min-h-12 w-full" onClick={handleSyncPublishAdvertised} disabled={autoPublishing}>
            {autoPublishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
            {autoPublishing ? 'Syncing, pricing, checking, and publishing…' : 'Sync & Publish S&S Products'}
          </Button>
          {autoPublishError && <Alert variant="destructive" className="mt-4"><AlertDescription>{autoPublishError}</AlertDescription></Alert>}
          {autoPublishResult && <div className="mt-4 space-y-2" aria-live="polite"><p className="text-sm font-semibold">{autoPublishResult.published_or_updated} published or refreshed · {autoPublishResult.blocked} exception(s)</p>{(autoPublishResult.products || []).map(item => <div key={`${item.brand}-${item.style}`} className={`rounded-lg border p-3 text-sm ${item.status === 'blocked' ? 'border-amber-300 bg-amber-50' : 'border-green-200 bg-green-50'}`}><p className="font-bold">{item.brand} {item.style}</p><p>{item.status === 'blocked' ? item.message : `${item.status === 'updated' ? 'Updated' : 'Published'} · ${Number(item.price).toFixed(2)} · ${item.variants} variants`}</p>{item.product_id && <Link className="font-semibold text-primary underline" to={`/ProductDetail?id=${encodeURIComponent(item.product_id)}`}>Open public product</Link>}</div>)}</div>}
        </div>

        <div className="mt-6 bg-white rounded-2xl border shadow-sm p-6 space-y-5">
          <div>
            <h2 className="font-bold text-lg">Default S&amp;S Payment Profile</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Load saved payment methods from S&amp;S using the account email, then select the profile used for
              admin-confirmed live orders. Only the PaymentProfile ID and required email are stored; card and bank
              credentials never enter HC Apparel or this browser.
            </p>
          </div>

          <label className="block space-y-2 text-sm font-medium">
            S&amp;S payment-profile email
            <input
              type="email"
              value={paymentEmail}
              onChange={(event) => setPaymentEmail(event.target.value)}
              placeholder="Email used for the saved payment method"
              autoComplete="off"
              className="w-full rounded-lg border bg-background px-3 py-2 font-normal"
            />
          </label>

          <Button type="button" variant="outline" className="w-full gap-2"
            onClick={handleLoadPaymentProfiles} disabled={paymentProfilesLoading || !paymentEmail.trim()}>
            {paymentProfilesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            {paymentProfilesLoading ? 'Loading payment profiles...' : 'Load S&S Payment Profiles'}
          </Button>

          {paymentProfiles.length > 0 && (
            <div className="space-y-3">
              <label className="block space-y-2 text-sm font-medium">
                Default S&amp;S Payment Profile
                <select
                  value={selectedPaymentProfile}
                  onChange={(event) => setSelectedPaymentProfile(event.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 font-normal"
                >
                  <option value="">Choose a payment profile</option>
                  {paymentProfiles.map((profile) => (
                    <option key={profile.profile_id} value={profile.profile_id}>
                      {profile.label} — PaymentProfile ID {profile.profile_id}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="button" className="w-full" onClick={handleSavePaymentProfile}
                disabled={paymentProfileSaving || !selectedPaymentProfile}>
                {paymentProfileSaving ? 'Saving verified profile...' : 'Save Default S&S Payment Profile'}
              </Button>
            </div>
          )}

          {paymentProfileError && <Alert variant="destructive"><AlertDescription>{paymentProfileError}</AlertDescription></Alert>}
          {paymentProfileMessage && (
            <Alert><CheckCircle2 className="w-4 h-4" /><AlertDescription>{paymentProfileMessage}</AlertDescription></Alert>
          )}
        </div>

        {workflowStatus?.product_loading_paused && (
          <div className="my-6 flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-5">
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

        <div className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex gap-3">
            <Database className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <h3 className="font-bold">Carhartt source verification</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Checks this authenticated S&amp;S account for genuine Carhartt styles, purchasable SKU inventory,
                current vendor pricing, images, and online-retail eligibility. This does not stage or publish products.
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" className="mt-5 w-full gap-2"
            onClick={handleVerifyCarharttSource} disabled={carharttChecking}>
            {carharttChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {carharttChecking ? 'Checking authenticated catalog...' : 'Verify Carhartt sourcing'}
          </Button>
          {carharttError && (
            <Alert variant="destructive" className="mt-4"><AlertDescription>{carharttError}</AlertDescription></Alert>
          )}
          {carharttSource && (
            <Alert className="mt-4">
              <AlertDescription>
                S&amp;S account check: {carharttSource.styles_found} Carhartt styles found;{' '}
                {carharttSource.qualifying_styles} currently have stocked, priced, imaged, online-retail-eligible SKUs.{' '}
                {carharttSource.can_source_20_styles
                  ? 'Twenty-style sourcing is available for private catalog QA.'
                  : 'Twenty verified styles are not available, so publication must remain blocked.'}
              </AlertDescription>
            </Alert>
          )}
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

        <div className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex gap-3">
            <Database className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <h3 className="font-bold">Exact manufacturer styles</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Retrieve exact S&amp;S style records into private staging. This does not publish products or place a supplier order.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-[11rem_1fr]">
            <select value={exactBrand} onChange={event => setExactBrand(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm">
              <option>Shaka Wear</option>
              <option>Under Armour</option>
              <option>American Apparel</option>
              <option>Champion</option>
              <option>Lane Seven</option>
              <option>Next Level</option>
              <option>Independent Trading Co</option>
              <option>Comfort Colors</option>
            </select>
            <input
              value={exactStyleNumbers}
              onChange={event => setExactStyleNumbers(event.target.value)}
              placeholder="e.g. SH3NORJ or 6006364, 6011361"
              className="rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>
          <Button type="button" variant="outline" className="mt-3 w-full gap-2" onClick={handleExactStyleStage} disabled={exactStaging}>
            {exactStaging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            {exactStaging ? 'Retrieving exact styles...' : 'Stage exact styles privately'}
          </Button>
          {exactStageError && <Alert variant="destructive" className="mt-4"><AlertDescription>{exactStageError}</AlertDescription></Alert>}
          {exactStageResult && (
            <Alert className="mt-4"><CheckCircle2 className="h-4 w-4" /><AlertDescription>
              Staged {exactStageResult.staged_styles} exact {exactBrand} style{exactStageResult.staged_styles === 1 ? '' : 's'} privately.{' '}
              Existing catalog matches: {exactStageResult.existing_products?.length || 0}.{' '}
              <Link to="/AdminSSStagedImport" className="font-semibold underline">Sync SKU details</Link>
            </AlertDescription></Alert>
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

        <div className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex gap-3">
            <Ruler className="h-5 w-5 shrink-0 text-accent" />
            <div>
              <h3 className="font-bold">Product-specific size guides</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Matches every published physical product to its exact supplier StyleID and manufacturer style,
                caches official measurement rows, and records missing or ambiguous charts for follow-up. Digital
                products, prices, inventory, and orders are not changed.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-5 w-full gap-2"
            onClick={handleSizeGuideRefresh}
            disabled={sizeGuideRefreshing}
          >
            {sizeGuideRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ruler className="h-4 w-4" />}
            {sizeGuideRefreshing ? 'Auditing official measurements…' : 'Refresh Product Size Guides'}
          </Button>
          {sizeGuideRefreshError && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{sizeGuideRefreshError}</AlertDescription>
            </Alert>
          )}
          {sizeGuideRefreshResult && (
            <Alert className="mt-4">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Audited {sizeGuideRefreshResult.products_audited} published apparel products. Verified charts:{' '}
                {sizeGuideRefreshResult.charts_added}. Unavailable: {sizeGuideRefreshResult.products_unavailable}.
                Review required: {sizeGuideRefreshResult.products_review_required}. Prices and inventory were unchanged.
              </AlertDescription>
            </Alert>
          )}

          <div className="mt-5 rounded-xl border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Published apparel audit report</p>
                <p className="text-xs text-muted-foreground">
                  {sizeGuideAuditLoading
                    ? 'Loading…'
                    : `${sizeGuideAudit.length} products · ${sizeGuideAudit.filter((row) => row.guide_status === 'verified').length} verified · ${sizeGuideAudit.filter((row) => row.guide_status !== 'verified').length} need follow-up`}
                </p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={loadSizeGuideAudit} disabled={sizeGuideAuditLoading}>
                Refresh report
              </Button>
            </div>
            <div className="max-h-80 overflow-auto">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b">
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Style</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Chart</th>
                    <th className="px-3 py-2">Source / issue</th>
                  </tr>
                </thead>
                <tbody>
                  {sizeGuideAudit.map((row) => (
                    <tr key={row.product_id} className="border-b align-top last:border-0">
                      <td className="px-3 py-2"><span className="font-semibold">{row.product_name}</span><br />{row.brand || 'Brand missing'}</td>
                      <td className="px-3 py-2">{row.manufacturer_style || 'Style missing'}</td>
                      <td className="px-3 py-2">
                        <Badge variant={row.guide_status === 'verified' ? 'default' : 'secondary'}>{row.guide_status}</Badge>
                      </td>
                      <td className="px-3 py-2">{row.size_count} sizes · {row.measurement_count} rows</td>
                      <td className="max-w-64 px-3 py-2 text-muted-foreground">{row.source_reference || row.issue || 'Not yet retrieved'}</td>
                    </tr>
                  ))}
                  {!sizeGuideAuditLoading && sizeGuideAudit.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No published physical apparel products found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
