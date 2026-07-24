import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FlaskConical,
  Loader2,
  LockKeyhole,
  Plus,
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
import ZeroTouchPrepPanel from '@/components/orders/ZeroTouchPrepPanel';
import { ssVendorOrderStageLabel } from '@/lib/ssVendorOrderWorkflow';

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

const addressValue = (address, ...keys) => {
  for (const key of keys) {
    if (address?.[key]) return address[key];
  }
  return '';
};

function validationWarnings(draft) {
  const warnings = [];
  const items = Array.isArray(draft?.items) ? draft.items : [];
  if (!items.length) warnings.push('No product items');
  if (items.some((item) => !String(item.sku || '').trim())) warnings.push('Missing SKU');
  if (items.some((item) => !String(item.size || '').trim())) warnings.push('Missing size');
  if (items.some((item) => !String(item.color || '').trim())) warnings.push('Missing color');
  if (items.some((item) => Number(item.quantity) <= 0)) warnings.push('Missing quantity');
  const address = draft?.shipping_address || {};
  if (
    !addressValue(address, 'street', 'line1', 'address1') ||
    !address.city ||
    !address.state ||
    !addressValue(address, 'zip', 'postal_code') ||
    !draft?.shipping_method
  ) warnings.push('Missing shipping address or shipping method');
  if (draft?.payment_status !== 'paid') warnings.push('Unpaid order');
  return warnings;
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
    return items.reduce((sum, item) => {
      const quantity = Number(item.quantity) || 0;
      const garmentCost = Number(item.garment_cost) || 0;
      const salePrice = Number(item.sale_price) || 0;
      return {
        quantity: sum.quantity + quantity,
        cost: sum.cost + garmentCost * quantity,
        sale: sum.sale + salePrice * quantity,
        profit: sum.profit + (salePrice - garmentCost) * quantity,
      };
    }, { quantity: 0, cost: 0, sale: 0, profit: 0 });
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
        garment_cost: Number(item.garment_cost) || 0,
        sale_price: Number(item.sale_price) || 0,
        estimated_profit: ((Number(item.sale_price) || 0) - (Number(item.garment_cost) || 0))
          * (Number(item.quantity) || 0),
      })),
      garment_cost: totals.cost,
      sale_price: totals.sale,
      estimated_profit: totals.profit,
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
        <div className="border-2 border-red-300 bg-red-50 text-red-800 rounded-2xl p-4 flex gap-3">
          <ShieldAlert className="w-6 h-6 shrink-0" />
          <div>
            <p className="font-extrabold">Do Not Submit Live Order Yet</p>
            <p className="text-sm">Safety mode is locked on. Test mode validates data and connectivity only; it never places an S&S order.</p>
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
                <Field label="Garment cost" type="number" value={item.garment_cost} onChange={(v) => setItem(index, 'garment_cost', v)} />
                <Field label="Sale price" type="number" value={item.sale_price} onChange={(v) => setItem(index, 'sale_price', v)} />
                <div>
                  <Label>Estimated profit</Label>
                  <Input
                    disabled
                    value={`$${(((Number(item.sale_price) || 0) - (Number(item.garment_cost) || 0)) * (Number(item.quantity) || 0)).toFixed(2)}`}
                  />
                </div>
              </div>
            </div>
          ))}
          <div className="grid sm:grid-cols-4 gap-3 bg-muted/30 rounded-xl p-3 text-sm">
            <Summary label="Units" value={totals.quantity} />
            <Summary label="Garment cost" value={`$${totals.cost.toFixed(2)}`} />
            <Summary label="Sale total" value={`$${totals.sale.toFixed(2)}`} />
            <Summary label="Estimated profit" value={`$${totals.profit.toFixed(2)}`} />
          </div>
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

        <ZeroTouchPrepPanel
          draft={form}
          customerOrder={customerOrder}
          onUpdated={async (saved) => {
            if (saved) setForm((current) => ({ ...current, ...saved }));
            await refetchDraft();
            refresh();
          }}
        />

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
              disabled={stageMutation.isPending || !form.validation_passed || warnings.length > 0}
            >
              Mark ready to submit
            </Button>
            <Button disabled className="bg-slate-300 text-slate-600">
              <LockKeyhole className="w-4 h-4 mr-2" /> Submit live order disabled
            </Button>
          </div>

          {testResult && (
            <div className={`rounded-xl border p-4 ${testResult.api_connected ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              <p className="font-bold flex items-center gap-2">
                {testResult.api_connected
                  ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                  : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                {testResult.connection_message || (testResult.api_connected ? 'S&S API connected' : 'S&S API not connected')}
              </p>
              <p className="text-sm mt-1">
                Payload {testResult.payload_valid ? 'passed' : 'did not pass'} validation. Submitted: no.
              </p>
            </div>
          )}
        </section>

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
