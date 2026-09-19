import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import SSVendorOrderTimeline from '@/components/orders/SSVendorOrderTimeline';
import LiveSSSubmissionPanel from '@/components/orders/LiveSSSubmissionPanel';
import ZeroTouchPrepPanel from '@/components/orders/ZeroTouchPrepPanel';
import { ssVendorOrderStageLabel } from '@/lib/ssVendorOrderWorkflow';
import { getVendorDraftWarnings } from '@/lib/smallOrderCheckout';
import { isBlankGarmentOrder } from '@/lib/blankFulfillment';

const emptyItem = () => ({
  product_name: '',
  brand: '',
  style_number: '',
  sku: '',
  color: '',
  size: '',
  quantity: 1,
  garment_cost: 0,
  sale_price: 0,
  estimated_profit: 0,
  notes: '',
});

const addressValue = (address, ...keys) =>
  keys.map((key) => address?.[key]).find((value) => String(value ?? '').trim()) || '';

function validationWarnings(draft) {
  const warnings = getVendorDraftWarnings(draft);
  const items = Array.isArray(draft?.items) ? draft.items : [];
  if (items.some((item) => !String(item.size || '').trim())) warnings.push('Missing size');
  if (items.some((item) => !String(item.color || '').trim())) warnings.push('Missing color');
  if (!draft?.shipping_method) warnings.push('Missing shipping method');
  if (items.some((item) => !(Number(item.garment_cost) > 0))
    && !String(draft?.cost_override_reason || '').trim()) warnings.push('Vendor cost is missing. Refresh S&S cost before submitting.');
  return [...new Set(warnings)];
}

export default function AdminVendorOrderDraft() {
  const id = new URLSearchParams(window.location.search).get('id');
  const queryClient = useQueryClient();
  const [form, setForm] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const { data: draft, isLoading, refetch: refetchDraft } = useQuery({
    queryKey: ['ss-vendor-order-draft', id],
    queryFn: () => base44.entities.VendorOrderDraft.get(id),
    enabled: Boolean(id),
  });

  const { data: customerOrder } = useQuery({
    queryKey: ['zerotouch-customer-order', draft?.customer_order_id],
    queryFn: () => base44.entities.Order.get(draft.customer_order_id),
    enabled: Boolean(draft?.customer_order_id),
  });

  useEffect(() => {
    if (draft) {
      setForm({
        ...draft,
        items: Array.isArray(draft.items) && draft.items.length ? draft.items : [emptyItem()],
        shipping_address: draft.shipping_address || {},
      });
      setTestResult(draft.test_validation || null);
    }
  }, [draft]);

  const warnings = useMemo(() => validationWarnings(form), [form]);
  const totals = useMemo(() => {
    const items = form?.items || [];
    const result = items.reduce((sum, item) => {
      const quantity = Number(item.quantity) || 0;
      const garmentCost = Number(item.garment_cost);
      const salePrice = Number(item.sale_price) || 0;
      const costLoaded = garmentCost > 0;
      return {
        quantity: sum.quantity + quantity,
        cost: sum.cost + (costLoaded ? garmentCost * quantity : 0),
        sale: sum.sale + salePrice * quantity,
        profit: sum.profit + (costLoaded ? (salePrice - garmentCost) * quantity : 0),
        costsLoaded: sum.costsLoaded && costLoaded,
      };
    }, { quantity: 0, cost: 0, sale: 0, profit: 0, costsLoaded: items.length > 0 });
    const fees = Number(form?.vendor_shipping_estimate || 0) + Number(form?.vendor_other_fees || 0);
    return { ...result, fees, margin: result.costsLoaded ? result.profit - fees : null };
  }, [form]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['ss-vendor-order-draft', id] });
    queryClient.invalidateQueries({ queryKey: ['vendor_order_drafts'] });
    queryClient.invalidateQueries({ queryKey: ['ss-vendor-order-history', id, form?.quote_request_id] });
  };

  const saveMutation = useMutation({
    mutationFn: () => base44.entities.VendorOrderDraft.update(id, {
      customer_name: form.customer_name,
      customer_email: form.customer_email,
      customer_phone: form.customer_phone,
      shipping_address: form.shipping_address,
      shipping_method: form.shipping_method,
      items: form.items.map((item) => ({
        ...item,
        quantity: Number(item.quantity) || 0,
        garment_cost: Number(item.garment_cost) > 0 ? Number(item.garment_cost) : 0,
        sale_price: Number(item.sale_price) || 0,
        estimated_profit: Number(item.garment_cost) > 0
          ? ((Number(item.sale_price) || 0) - Number(item.garment_cost)) * (Number(item.quantity) || 0)
          : null,
      })),
      garment_cost: totals.cost,
      sale_price: totals.sale,
      estimated_profit: totals.margin ?? 0,
      vendor_shipping_estimate: form.vendor_shipping_estimate === '' ? null : Number(form.vendor_shipping_estimate),
      vendor_other_fees: form.vendor_other_fees === '' ? null : Number(form.vendor_other_fees),
      cost_override_reason: form.cost_override_reason || null,
      total_quantity: totals.quantity,
      item_count: form.items.length,
      admin_notes: form.admin_notes,
      customer_notes: form.customer_notes,
      has_sku_warnings: warnings.includes('Missing SKU'),
      has_missing_warnings: warnings.length > 0,
      validation_passed: false,
      test_validation: null,
    }),
    onSuccess: () => {
      toast.success('Vendor order draft saved');
      setTestResult(null);
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      if (saveMutation.isPending) throw new Error('Wait for the draft to finish saving');
      await saveMutation.mutateAsync();
      const { data } = await base44.functions.invoke('ss-activewear', {
        action: 'validate_vendor_order_draft',
        draft_id: id,
      });
      return data;
    },
    onSuccess: (result) => {
      setTestResult(result);
      toast.success(result.api_connected
        ? 'Test-mode validation completed'
        : 'Payload checked; S&S API not connected');
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const refreshCostMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('ss-activewear', {
        action: 'refresh_vendor_order_cost_inventory', draft_id: id,
      });
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: async (result) => {
      setForm((current) => ({ ...current, ...result.draft, items: result.items }));
      setTestResult(null);
      await refetchDraft();
      refresh();
      toast.success('Current S&S cost and inventory loaded. No order was submitted.');
    },
    onError: (error) => toast.error(error.message),
  });

  const stageMutation = useMutation({
    mutationFn: async (stage) => {
      const { data, error } = await supabase.rpc('advance_ss_vendor_order_stage', {
        p_draft_id: id,
        p_stage: stage,
        p_admin_note: form.admin_notes || null,
        p_customer_note: form.customer_notes || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Order workflow updated');
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setAddress = (key, value) => setForm((current) => ({
    ...current,
    shipping_address: { ...current.shipping_address, [key]: value },
  }));
  const setItem = (index, key, value) => setForm((current) => ({
    ...current,
    items: current.items.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [key]: value } : item
    )),
  }));
  const costReady = totals.costsLoaded || Boolean(String(form?.cost_override_reason || '').trim());

  if (!id) return <div className="p-8 text-center">No vendor order draft selected.</div>;
  if (isLoading || !form) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground py-6 px-4">
        <div className="max-w-6xl mx-auto">
          <Link to="/AdminVendorOrders" className="inline-flex items-center gap-1 text-xs opacity-75 mb-3">
            <ArrowLeft className="w-3 h-3" /> Vendor orders
          </Link>
          <div className="flex justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-extrabold">S&S Vendor Order Draft</h1>
              <p className="text-sm opacity-75">{form.vendor_order_number}</p>
            </div>
            <Badge className="bg-white/15 text-white">
              {ssVendorOrderStageLabel(form.workflow_status)}
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
        {form.is_sample && (
          <div className="border border-amber-300 bg-amber-50 text-amber-900 rounded-2xl p-4 flex gap-3">
            <FlaskConical className="w-6 h-6 shrink-0" />
            <div>
              <p className="font-extrabold">QA/Test — Do Not Fulfill</p>
              <p className="text-sm">This audit record cannot be submitted to S&amp;S.</p>
            </div>
          </div>
        )}
        <div className="border border-amber-300 bg-amber-50 text-amber-900 rounded-2xl p-4 flex gap-3">
          <ShieldAlert className="w-6 h-6 shrink-0" />
          <div>
            <p className="font-extrabold">Controlled live ordering</p>
            <p className="text-sm">Payment creates a protected draft only. A reviewed S&amp;S draft requires a separate admin enablement and confirmation before any real order can be placed.</p>
          </div>
        </div>

        {warnings.length > 0 && (
          <section className="border border-amber-300 bg-amber-50 rounded-2xl p-4">
            <p className="font-bold flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4" /> Validation warnings
            </p>
            <div className="flex flex-wrap gap-2">
              {warnings.map((warning) => (
                <Badge key={warning} className="bg-amber-100 text-amber-800">{warning}</Badge>
              ))}
            </div>
          </section>
        )}

        <section className="bg-white border rounded-2xl p-5 space-y-4">
          <h2 className="font-bold">Customer and shipping</h2>
          <div className="grid md:grid-cols-3 gap-3">
            <Field label="Customer name" value={form.customer_name} onChange={(v) => setField('customer_name', v)} />
            <Field label="Customer email" value={form.customer_email} onChange={(v) => setField('customer_email', v)} />
            <Field label="Customer phone" value={form.customer_phone} onChange={(v) => setField('customer_phone', v)} />
            <Field label="Street" value={addressValue(form.shipping_address, 'street', 'line1', 'address1')} onChange={(v) => setAddress('street', v)} />
            <Field label="City" value={form.shipping_address.city} onChange={(v) => setAddress('city', v)} />
            <Field label="State" value={form.shipping_address.state} onChange={(v) => setAddress('state', v)} />
            <Field label="ZIP" value={addressValue(form.shipping_address, 'zip', 'postal_code')} onChange={(v) => setAddress('zip', v)} />
            <Field label="Shipping method" value={form.shipping_method} onChange={(v) => setField('shipping_method', v)} />
            <div>
              <Label>Payment status</Label>
              <Input value={form.payment_status === 'paid' ? 'Payment received' : 'Unpaid — submission blocked'} disabled />
            </div>
          </div>
        </section>

        <section className="bg-white border rounded-2xl p-5 space-y-4">
          <div className="flex justify-between items-center gap-3">
            <div>
              <h2 className="font-bold">Vendor order items</h2>
              <p className="text-xs text-muted-foreground">Product, style, SKU, color, size, quantity, and prices are required.</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setForm((current) => ({ ...current, items: [...current.items, emptyItem()] }))}
            >
              <Plus className="w-4 h-4 mr-1" /> Add item
            </Button>
          </div>
          {form.items.map((item, index) => (
            <div key={`${index}-${item.sku}`} className="border rounded-xl p-4 space-y-3">
              <div className="flex justify-between">
                <p className="font-semibold text-sm">Item {index + 1}</p>
                {form.items.length > 1 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setForm((current) => ({
                      ...current,
                      items: current.items.filter((_, itemIndex) => itemIndex !== index),
                    }))}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                )}
              </div>
              <div className="grid md:grid-cols-4 gap-3">
                <Field label="Product" value={item.product_name} onChange={(v) => setItem(index, 'product_name', v)} />
                <Field label="Brand" value={item.brand} onChange={(v) => setItem(index, 'brand', v)} />
                <Field label="Style number" value={item.style_number} onChange={(v) => setItem(index, 'style_number', v)} />
                <Field label="SKU" value={item.sku} onChange={(v) => setItem(index, 'sku', v)} />
                <Field label="Color" value={item.color} onChange={(v) => setItem(index, 'color', v)} />
                <Field label="Size" value={item.size} onChange={(v) => setItem(index, 'size', v)} />
                <Field label="Quantity" type="number" value={item.quantity} onChange={(v) => setItem(index, 'quantity', v)} />
                <div><Label>S&amp;S garment cost</Label><Input disabled value={Number(item.garment_cost) > 0 ? `$${Number(item.garment_cost).toFixed(2)}` : 'Cost not loaded'} /></div>
                <Field label="Customer paid" type="number" value={item.sale_price} onChange={(v) => setItem(index, 'sale_price', v)} />
                <div>
                  <Label>Estimated margin before shipping/fees</Label>
                  <Input
                    disabled
                    value={Number(item.garment_cost) > 0
                      ? `$${(((Number(item.sale_price) || 0) - Number(item.garment_cost)) * (Number(item.quantity) || 0)).toFixed(2)}`
                      : 'Unavailable'}
                  />
                </div>
              </div>
            </div>
          ))}
          <div className="grid sm:grid-cols-4 gap-3 bg-muted/30 rounded-xl p-3 text-sm">
            <Summary label="Units" value={totals.quantity} />
            <Summary label="S&S garment cost" value={totals.costsLoaded ? `$${totals.cost.toFixed(2)}` : 'Cost not loaded'} />
            <Summary label="Customer paid" value={`$${totals.sale.toFixed(2)}`} />
            <Summary label={totals.fees > 0 ? 'Estimated margin' : 'Estimated margin before shipping/fees'} value={totals.margin === null ? 'Unavailable' : `$${totals.margin.toFixed(2)}`} />
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <Field label="S&S shipping estimate (optional)" type="number" value={form.vendor_shipping_estimate ?? ''} onChange={(v) => setField('vendor_shipping_estimate', v)} />
            <Field label="Other vendor fees (optional)" type="number" value={form.vendor_other_fees ?? ''} onChange={(v) => setField('vendor_other_fees', v)} />
            <Field label="Missing-cost override reason" value={form.cost_override_reason || ''} onChange={(v) => setField('cost_override_reason', v)} />
          </div>
          {!totals.costsLoaded && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Vendor cost is missing. Refresh S&amp;S cost before submitting. Estimated margin is unavailable.</p>}
        </section>

        <section className="grid md:grid-cols-2 gap-4">
          <div className="bg-white border rounded-2xl p-5">
            <Label>Admin-only notes</Label>
            <Textarea rows={5} value={form.admin_notes || ''} onChange={(event) => setField('admin_notes', event.target.value)} />
          </div>
          <div className="bg-white border rounded-2xl p-5">
            <Label>Customer-facing notes</Label>
            <Textarea rows={5} value={form.customer_notes || ''} onChange={(event) => setField('customer_notes', event.target.value)} />
          </div>
        </section>

        {!isBlankGarmentOrder(customerOrder) && <ZeroTouchPrepPanel
          draft={form}
          customerOrder={customerOrder}
          onUpdated={async (saved) => {
            if (saved) setForm((current) => ({ ...current, ...saved }));
            await refetchDraft();
            refresh();
          }}
        />}

        <section className="bg-white border rounded-2xl p-5 space-y-4">
          <h2 className="font-bold">Safe order controls</h2>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save draft
            </Button>
            <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
              {testMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FlaskConical className="w-4 h-4 mr-2" />}
              Test S&S payload
            </Button>
            <Button variant="outline" onClick={() => refreshCostMutation.mutate()} disabled={refreshCostMutation.isPending}>
              {refreshCostMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Refresh S&amp;S Cost &amp; Inventory
            </Button>
            <Button
              variant="outline"
              onClick={() => stageMutation.mutate('vendor_order_reviewed')}
              disabled={stageMutation.isPending}
            >
              Mark vendor order reviewed
            </Button>
            <Button
              variant="outline"
              onClick={() => stageMutation.mutate('ready_to_submit_to_ss')}
              disabled={stageMutation.isPending || !form.validation_passed || warnings.length > 0 || !costReady}
            >
              Mark ready to submit
            </Button>
          </div>

          {testResult && (
            <div className={`rounded-xl border p-4 space-y-3 ${testResult.api_connected ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              <p className="font-bold flex items-center gap-2">
                {testResult.api_connected
                  ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                  : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                {testResult.connection_message || (testResult.api_connected ? 'S&S API connected' : 'S&S API not connected')}
              </p>
              <p className="text-sm mt-1">
                Payload {testResult.payload_valid ? 'passed' : 'did not pass'} validation. Submitted: no.
              </p>
              {testResult.dry_run && testResult.submission_payload && (
                <div className="rounded-xl border bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <p className="font-bold text-sm">Exact S&amp;S Orders API dry-run payload</p>
                    <Badge className="bg-blue-100 text-blue-800">Never submitted</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Credentials: {testResult.credentials?.account_number}; API key: {testResult.credentials?.api_key}.
                    {' '}Current inventory: {testResult.inventory_check?.valid ? 'valid' : 'not ready or unavailable'}.
                  </p>
                  <pre className="max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100 whitespace-pre-wrap break-words">
                    {JSON.stringify(testResult.submission_payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </section>

        {!form.is_sample && (
          <LiveSSSubmissionPanel
            draft={form}
            onUpdated={async () => {
              await refetchDraft();
              refresh();
            }}
          />
        )}

        <section className="bg-white border rounded-2xl p-5 space-y-4">
          <h2 className="font-bold">Order status timeline</h2>
          <SSVendorOrderTimeline
            currentStatus={form.workflow_status}
            draftId={form.id}
            quoteRequestId={form.quote_request_id}
          />
        </section>
      </main>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type={type}
        step={type === 'number' ? '0.01' : undefined}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function Summary({ label, value }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-bold">{value}</p></div>;
}
