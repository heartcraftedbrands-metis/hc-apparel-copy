import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, LockKeyhole, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/api/supabaseClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

async function invoke(action, body = {}) {
  const { data, error } = await supabase.functions.invoke('ss-activewear', {
    body: { action, ...body },
  });
  if (!error) return data;

  let message = error.message || 'S&S request failed';
  try {
    const details = await error.context?.json();
    if (details?.error) message = details.error;
  } catch {
    // Keep the safe generic invocation message.
  }
  throw new Error(message);
}

export default function LiveSSSubmissionPanel({ draft = null, onUpdated }) {
  const queryClient = useQueryClient();
  const { data: status, isLoading, error } = useQuery({
    queryKey: ['live-integration-status'],
    queryFn: () => invoke('get_admin_status'),
  });

  const controlsMutation = useMutation({
    mutationFn: ({ ssEnabled, zeroTouchEnabled }) => invoke('set_live_controls', {
      ss_live_submission_enabled: ssEnabled,
      zerotouch_live_submission_enabled: zeroTouchEnabled,
    }),
    onSuccess: (result) => {
      queryClient.setQueryData(['live-integration-status'], (current) => ({ ...current, ...result }));
      toast.success('Live integration controls updated');
    },
    onError: (mutationError) => toast.error(mutationError.message),
  });

  const submitMutation = useMutation({
    mutationFn: () => invoke('submit_vendor_order', { draft_id: draft.id }),
    onSuccess: async (result) => {
      toast.success(`S&S order ${result.order_numbers?.join(', ') || ''} submitted`);
      await queryClient.invalidateQueries({ queryKey: ['live-integration-status'] });
      await onUpdated?.(result);
    },
    onError: (mutationError) => toast.error(mutationError.message),
  });

  const previewMutation = useMutation({
    mutationFn: () => invoke('preview_vendor_order_submission', { draft_id: draft.id }),
  });

  const refreshStatusMutation = useMutation({
    mutationFn: () => invoke('refresh_vendor_order_status', { draft_id: draft.id }),
    onSuccess: async (result) => {
      toast.success(`S&S order ${result.confirmation?.order_number || ''} confirmed`);
      await queryClient.invalidateQueries({ queryKey: ['live-integration-status'] });
      await onUpdated?.(result);
    },
    onError: (mutationError) => toast.error(mutationError.message),
  });

  const updateSS = (checked) => {
    if (checked && !window.confirm(
      'Enable the live S&S submission control? This does not place an order. Every order still requires a separate admin confirmation.',
    )) return;
    controlsMutation.mutate({
      ssEnabled: checked,
      zeroTouchEnabled: Boolean(status?.zerotouch_live_submission_enabled),
    });
  };

  const updateZeroTouch = (checked) => {
    if (checked && !window.confirm(
      'Enable the ZeroTouch live control? This does not submit anything. Live ZeroTouch remains separate and requires its own confirmed action.',
    )) return;
    controlsMutation.mutate({
      ssEnabled: Boolean(status?.ss_live_submission_enabled),
      zeroTouchEnabled: checked,
    });
  };

  const submitLive = () => {
    const orderNumber = draft.customer_order_number || draft.customer_order_id || 'this customer order';
    if (!window.confirm(`This will place a real S&S order for customer order ${orderNumber}. Continue?`)) return;
    submitMutation.mutate();
  };

  const alreadySubmitted = draft?.ss_submission_state === 'submitted'
    || Boolean(String(draft?.ss_order_number || draft?.external_vendor_order_number || draft?.ss_guid || '').trim());
  const isReady = Boolean(
    draft
    && !draft.is_sample
    && status?.ss_live_submission_enabled
    && status?.ss_credentials_configured
    && status?.ss_api_connected
    && draft.payment_status === 'paid'
    && draft.workflow_status === 'ready_to_submit_to_ss'
    && draft.vendor_status === 'ready_to_order'
    && draft.validation_passed
    && !alreadySubmitted
    && draft.ss_submission_state !== 'submitting',
  );

  return (
    <section className="rounded-2xl border bg-white p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" /> Live vendor controls
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Admin-only controls. Customer payment never submits an S&amp;S or ZeroTouch order automatically.
          </p>
        </div>
        <Badge className={status?.ss_live_submission_enabled ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}>
          S&amp;S live {status?.ss_live_submission_enabled ? 'enabled' : 'disabled'}
        </Badge>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading integration status…</p>}
      {error && <p className="text-sm text-red-700">{error.message}</p>}

      {status && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <Status label="S&S credentials" ok={status.ss_credentials_configured} />
            <Status label="S&S API check" ok={status.ss_api_connected} />
            <Status label="ZeroTouch live" ok={status.zerotouch_live_submission_enabled} />
            <Status label="Automatic emails" ok={false} disabledLabel="Disabled · drafts only" />
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/[0.025] p-4 text-sm">
            <p className="font-semibold">S&amp;S submission mode: Admin-only</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Public customers cannot access these controls. Payment never triggers S&amp;S, ZeroTouch, or email delivery automatically.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Control
              label="S&S live submission"
              description="Off by default. Enabling only reveals the final admin-gated submission path."
              checked={Boolean(status.ss_live_submission_enabled)}
              disabled={controlsMutation.isPending || !status.ss_credentials_configured}
              onCheckedChange={updateSS}
            />
            <Control
              label="ZeroTouch live"
              description="Separate control; no automatic ZeroTouch submission is implemented here."
              checked={Boolean(status.zerotouch_live_submission_enabled)}
              disabled={controlsMutation.isPending}
              onCheckedChange={updateZeroTouch}
            />
          </div>

          {(status.last_ss_submission_at || status.last_ss_connection_at) && (
            <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
              {status.last_ss_submission_at
                ? `Last S&S submission result: ${status.last_ss_submission_status || 'unknown'} at ${new Date(status.last_ss_submission_at).toLocaleString()}`
                : `Last S&S connection check: ${new Date(status.last_ss_connection_at).toLocaleString()}`}
              {status.last_ss_submission_order_number && ` · Order ${status.last_ss_submission_order_number}`}
              {status.last_ss_submission_error && ` · ${status.last_ss_submission_error}`}
            </div>
          )}
        </div>
      )}

      {draft && (
        <div className="border-t pt-4 space-y-3">
          <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-sm">S&amp;S Confirmation</h3>
                <p className="text-xs text-muted-foreground">Read-only status lookup. This does not submit or retry an order.</p>
              </div>
              <Button type="button" size="sm" variant="outline" className="gap-2"
                disabled={refreshStatusMutation.isPending} onClick={() => refreshStatusMutation.mutate()}>
                {refreshStatusMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Refresh S&amp;S Order Status
              </Button>
            </div>
            {refreshStatusMutation.error && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {refreshStatusMutation.error.message}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <Confirmation label="S&S order number" value={draft.ss_order_number || draft.external_vendor_order_number} />
              <Confirmation label="S&S GUID" value={draft.ss_guid} />
              <Confirmation label="PO number" value={draft.ss_po_number || draft.vendor_order_number} />
              <Confirmation label="Warehouse" value={draft.ss_warehouse} />
              <Confirmation label="Status" value={draft.ss_order_status} />
              <Confirmation label="Submitted at" value={formatDate(draft.ss_submitted_at)} />
              <Confirmation label="Expected delivery" value={formatDate(draft.ss_expected_delivery_date)} />
              <Confirmation label="Tracking number" value={draft.ss_tracking_number} />
              <Confirmation label="Last status refresh" value={formatDate(draft.ss_status_refreshed_at)} />
            </div>
          </div>
          {alreadySubmitted ? (
            <div className="flex gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              S&amp;S order submitted: {draft.ss_order_number || draft.external_vendor_order_number}
            </div>
          ) : (
            <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              Live submission requires paid status, admin review, a ready draft, a passed validation, current stock, and the live control enabled.
            </div>
          )}
          {isReady ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="gap-2" disabled={previewMutation.isPending || submitMutation.isPending}
                  onClick={() => previewMutation.mutate()}>
                  {previewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Verify Live Submission (No Order)
                </Button>
                <Button className="gap-2 bg-red-700 text-white hover:bg-red-800"
                  disabled={submitMutation.isPending || previewMutation.isPending} onClick={submitLive}>
                  {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Submit Live S&amp;S Order
                </Button>
              </div>
              {previewMutation.data?.would_post && <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">Dry run passed every server-side check and reached the live POST boundary. No order was submitted.</p>}
              {previewMutation.data?.duplicate_blocked && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">An existing S&amp;S order was found. Live POST is blocked.</p>}
              {previewMutation.error && <p className="text-sm text-red-700">Dry run blocked: {previewMutation.error.message}</p>}
              {submitMutation.error && <p className="text-sm text-red-700">Live submission blocked: {submitMutation.error.message}</p>}
            </div>
          ) : !alreadySubmitted ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <LockKeyhole className="h-3.5 w-3.5" />
              Live submit remains hidden until every safety requirement passes.
            </p>
          ) : null}
          {draft.ss_submission_state === 'failed' && draft.ss_submission_error && (
            <p className="text-sm text-red-700">Last submission failed: {draft.ss_submission_error}</p>
          )}
        </div>
      )}
    </section>
  );
}

function Status({ label, ok, disabledLabel = 'Not ready / disabled' }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-semibold ${ok ? 'text-green-700' : 'text-amber-700'}`}>{ok ? 'Ready' : disabledLabel}</p>
    </div>
  );
}

function Confirmation({ label, value }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold break-words">{value || 'Not available'}</p></div>;
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function Control({ label, description, checked, disabled, onCheckedChange }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
      <div>
        <p className="font-semibold text-sm">{label}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}
