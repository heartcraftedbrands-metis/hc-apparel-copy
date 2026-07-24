import React, { useMemo, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle2, FlaskConical, KeyRound, Loader2, QrCode, ShieldAlert, Tags } from 'lucide-react';
import { toast } from 'sonner';

const DECORATION_METHODS = [
  ['DTF', 'DTF'],
  ['DTG', 'DTG'],
  ['embroidery', 'Embroidery'],
  ['screen_print', 'Screen Print'],
  ['other', 'Other'],
];

const DECORATION_LOCATIONS = [
  ['front', 'Front'],
  ['left_chest', 'Left Chest'],
  ['back', 'Back'],
  ['sleeve', 'Sleeve'],
  ['custom', 'Custom'],
];

const addressComplete = (address = {}) =>
  Boolean(
    (address.street || address.line1 || address.address1)
    && address.city
    && address.state
    && (address.zip || address.postal_code),
  );

const totalUnits = (items = []) => items.reduce(
  (sum, item) => sum + Number(item.quantity || 0),
  0,
);

const createDesignId = (draft) => {
  const orderPart = String(draft.customer_order_number || draft.customer_order_id || 'ORDER')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(-10)
    .toUpperCase();
  return `HC-${orderPart}-${Date.now().toString(36).toUpperCase()}`;
};

const generateQrPayload = (draft, form) => {
  const item = draft.items?.[0] || {};
  return {
    hc_order_number: draft.customer_order_number || draft.customer_order_id,
    vendor_draft_id: draft.id,
    customer_name: draft.customer_name,
    product_name: item.product_name || '',
    brand: item.brand || '',
    style_number: item.style_number || '',
    sku: item.sku || '',
    color: item.color || '',
    size: item.size || '',
    quantity: totalUnits(draft.items || []),
    artwork_file_url: form.artwork_file_url,
    decoration_method: form.decoration_method,
    decoration_location: form.decoration_location,
    print_notes: form.decoration_notes,
    production_packet_url: `/AdminVendorOrderDraft?id=${draft.id}#production-packet`,
  };
};

const localErrors = (draft, order, form) => {
  const errors = [];
  const items = draft.items || [];
  if (!form.zerotouch_enabled) errors.push('ZeroTouch is not enabled');
  if (form.zerotouch_mode === 'none') errors.push('ZeroTouch mode is required');
  if (!form.design_id.trim()) errors.push('DesignID is required');
  if (!form.artwork_file_url.trim()) errors.push('Artwork file URL is required');
  if (!form.decoration_method) errors.push('Decoration method is required');
  if (!form.decoration_location) errors.push('Decoration placement is required');
  if (!items.length) errors.push('At least one product item is required');
  if (items.some((item) => !String(item.sku || '').trim())) errors.push('Every item requires an SKU');
  if (items.some((item) => Number(item.quantity) <= 0)) errors.push('Every item requires a quantity');
  if (!addressComplete(draft.shipping_address || order?.shipping_address)) errors.push('Complete shipping address is required');
  if (draft.payment_status !== 'paid' && order?.payment_status !== 'paid') errors.push('Payment confirmation is required');
  if (Number(form.label_quantity) <= 0) errors.push('Label quantity must be at least 1');
  return errors;
};

export default function ZeroTouchPrepPanel({ draft, customerOrder = null, onUpdated = () => undefined }) {
  const units = totalUnits(draft.items || []);
  const firstItem = draft.items?.[0] || {};
  const initialArtwork = draft.artwork_file_url
    || customerOrder?.artwork_file_url
    || customerOrder?.artwork_link
    || '';
  const [form, setForm] = useState({
    zerotouch_enabled: draft.zerotouch_enabled || false,
    zerotouch_mode: draft.zerotouch_mode || 'none',
    design_id: draft.design_id || '',
    design_group_id: draft.design_group_id || '',
    decoration_method: draft.decoration_method || '',
    decoration_location: draft.decoration_location || '',
    decoration_notes: draft.decoration_notes || customerOrder?.what_to_print || customerOrder?.project_notes || '',
    artwork_file_url: initialArtwork,
    label_text_line_1: draft.label_text_line_1 || draft.customer_order_number || '',
    label_text_line_2: draft.label_text_line_2 || `${firstItem.brand || ''} ${firstItem.style_number || ''}`.trim(),
    label_barcode_value: draft.label_barcode_value || draft.vendor_order_number || draft.id,
    label_quantity: Number(draft.label_quantity) || 1,
    zerotouch_trial_applied: draft.zerotouch_trial_applied || false,
  });
  const [payloadPreview, setPayloadPreview] = useState(draft.qr_payload || null);
  const [validationResult, setValidationResult] = useState(null);
  const [saving, setSaving] = useState(false);

  const errors = useMemo(
    () => localErrors(draft, customerOrder, form),
    [draft, customerOrder, form],
  );
  const labelCost = form.zerotouch_mode === 'garment_level' && !form.zerotouch_trial_applied
    ? Math.max(0, Number(form.label_quantity) || 0) * 0.20
    : 0;

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const changeMode = (mode) => {
    setForm((current) => ({
      ...current,
      zerotouch_enabled: mode !== 'none',
      zerotouch_mode: mode,
      label_quantity: mode === 'box_level' ? 1 : Math.max(1, current.label_quantity || units),
    }));
  };

  const savePrep = async () => {
    const qrPayload = generateQrPayload(draft, form);
    const saved = await base44.entities.VendorOrderDraft.update(draft.id, {
      ...form,
      label_quantity: Math.max(0, Number(form.label_quantity) || 0),
      label_cost_estimate: Number(labelCost.toFixed(2)),
      qr_payload: qrPayload,
      zerotouch_ready: false,
      zerotouch_validation_errors: errors,
      live_submission_enabled: false,
    });
    setPayloadPreview(qrPayload);
    await onUpdated(saved);
    return saved;
  };

  const runValidation = async (markReady) => {
    setSaving(true);
    try {
      await savePrep();
      const { data, error } = await supabase.rpc('validate_zerotouch_preparation', {
        p_draft_id: draft.id,
        p_mark_ready: markReady,
      });
      if (error) throw error;
      setValidationResult(data);
      setPayloadPreview(data.payload);
      await onUpdated();
      if (markReady && data.zerotouch_ready) {
        toast.success('ZeroTouch preparation marked ready. No S&S order was submitted.');
      } else if (data.valid) {
        toast.success('ZeroTouch preparation passed test-only validation.');
      } else {
        toast.error('ZeroTouch preparation has validation errors.');
      }
    } catch (error) {
      toast.error(`ZeroTouch validation failed: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const previewPayload = async () => {
    setSaving(true);
    try {
      await savePrep();
      const payload = {
        ...generateQrPayload(draft, form),
        zerotouch: {
          mode: form.zerotouch_mode,
          design_id: form.design_id,
          design_group_id: form.design_group_id,
          label_text_line_1: form.label_text_line_1,
          label_text_line_2: form.label_text_line_2,
          label_barcode_value: form.label_barcode_value,
          label_quantity: Number(form.label_quantity) || 0,
          label_cost_estimate: Number(labelCost.toFixed(2)),
          trial_applied: form.zerotouch_trial_applied,
        },
        test_mode: true,
        submitted: false,
        live_submission_enabled: false,
      };
      setPayloadPreview(payload);
      setValidationResult({
        valid: errors.length === 0,
        validation_errors: errors,
        test_mode: true,
        submitted: false,
        live_submission_enabled: false,
      });
      toast.success('Test-only ZeroTouch payload prepared. Nothing was submitted.');
    } catch (error) {
      toast.error(`Payload preview failed: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border-2 border-violet-200 bg-violet-50/30 p-5 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <QrCode className="w-5 h-5 text-violet-700" />
        <div>
          <h2 className="font-bold">S&amp;S ZeroTouch Prep</h2>
          <p className="text-xs text-muted-foreground">Admin-only payload and label preparation. No live endpoint call.</p>
        </div>
        <Badge className="ml-auto bg-violet-100 text-violet-800">
          {draft.zerotouch_ready ? 'Ready — not submitted' : 'Preparation only'}
        </Badge>
      </div>

      <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        Live S&amp;S ZeroTouch submission remains disabled. These controls never place an order.
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>ZeroTouch Mode</Label>
          <Select value={form.zerotouch_mode} onValueChange={changeMode}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="box_level">Box-Level</SelectItem>
              <SelectItem value="garment_level">Garment-Level</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Box-level groups garments sharing artwork, product, and decoration. Garment-level supports unit or batched labels.
          </p>
        </div>
        <div>
          <Label>Label Quantity</Label>
          <Input
            className="mt-1"
            type="number"
            min="1"
            max={Math.max(1, units)}
            value={form.label_quantity}
            onChange={(event) => setField('label_quantity', Number(event.target.value))}
          />
          <p className="text-xs text-muted-foreground mt-1">{units} total garment units. Use fewer labels when approved batching applies.</p>
        </div>
        <div>
          <Label>DesignID</Label>
          <div className="flex gap-2 mt-1">
            <Input value={form.design_id} onChange={(event) => setField('design_id', event.target.value)} />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const designId = createDesignId(draft);
                setForm((current) => ({
                  ...current,
                  design_id: designId,
                  design_group_id: current.design_group_id || `${designId}-GROUP`,
                }));
              }}
            >
              <KeyRound className="w-4 h-4 mr-1.5" />Generate
            </Button>
          </div>
        </div>
        <div>
          <Label>Design Group ID</Label>
          <Input className="mt-1" value={form.design_group_id} onChange={(event) => setField('design_group_id', event.target.value)} />
        </div>
        <div>
          <Label>Decoration Method</Label>
          <Select value={form.decoration_method} onValueChange={(value) => setField('decoration_method', value)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select method" /></SelectTrigger>
            <SelectContent>
              {DECORATION_METHODS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Decoration Location</Label>
          <Select value={form.decoration_location} onValueChange={(value) => setField('decoration_location', value)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select placement" /></SelectTrigger>
            <SelectContent>
              {DECORATION_LOCATIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label>Artwork File URL</Label>
          <Input className="mt-1" value={form.artwork_file_url} onChange={(event) => setField('artwork_file_url', event.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>Decoration / Print Notes</Label>
          <Textarea className="mt-1" rows={3} value={form.decoration_notes} onChange={(event) => setField('decoration_notes', event.target.value)} />
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="flex items-center gap-2"><Tags className="w-4 h-4 text-violet-700" /><h3 className="font-semibold text-sm">Label Text Preview</h3></div>
        <div className="grid md:grid-cols-3 gap-3">
          <div><Label>Line 1</Label><Input className="mt-1" value={form.label_text_line_1} onChange={(event) => setField('label_text_line_1', event.target.value)} /></div>
          <div><Label>Line 2</Label><Input className="mt-1" value={form.label_text_line_2} onChange={(event) => setField('label_text_line_2', event.target.value)} /></div>
          <div><Label>Barcode Value</Label><Input className="mt-1 font-mono" value={form.label_barcode_value} onChange={(event) => setField('label_barcode_value', event.target.value)} /></div>
        </div>
        <div className="rounded-lg border-2 border-dashed p-4 text-center">
          <p className="font-bold">{form.label_text_line_1 || 'Label line 1'}</p>
          <p className="text-sm">{form.label_text_line_2 || 'Label line 2'}</p>
          <p className="font-mono text-xs mt-2">||| {form.label_barcode_value || 'BARCODE'} |||</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 rounded-xl border bg-white p-4">
        <div>
          <p className="text-xs text-muted-foreground">Estimated Label Cost</p>
          <p className="text-2xl font-extrabold">${labelCost.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">
            {form.zerotouch_mode === 'box_level' ? 'Box-level labels are free.' : '$0.20 × label count after the trial.'}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.zerotouch_trial_applied} onChange={(event) => setField('zerotouch_trial_applied', event.target.checked)} />
          Apply approved ZeroTouch trial estimate
        </label>
        <p className="sm:col-span-2 text-xs text-muted-foreground">
          ZeroTouch trial: first 60 days or first 1,000 labels may be free, based on S&amp;S approval.
        </p>
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="font-semibold text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" />ZeroTouch Ready is blocked</p>
          <ul className="text-xs mt-2 list-disc pl-5 space-y-1">{errors.map((error) => <li key={error}>{error}</li>)}</ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={previewPayload} disabled={saving}>
          <QrCode className="w-4 h-4 mr-1.5" />Preview ZeroTouch Payload
        </Button>
        <Button variant="outline" onClick={() => runValidation(false)} disabled={saving}>
          <FlaskConical className="w-4 h-4 mr-1.5" />Validate ZeroTouch Prep
        </Button>
        <Button onClick={() => runValidation(true)} disabled={saving || errors.length > 0}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
          Mark ZeroTouch Ready
        </Button>
      </div>

      {validationResult && (
        <div className={`rounded-xl border p-3 text-sm ${validationResult.valid ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className="font-bold">{validationResult.valid ? 'ZeroTouch prep valid' : 'ZeroTouch prep needs attention'}</p>
          <p className="text-xs mt-1">Submitted: false · Live submission enabled: false</p>
        </div>
      )}

      {payloadPreview && (
        <div className="rounded-xl border bg-slate-950 text-slate-100 p-4">
          <p className="text-xs font-semibold mb-2">Test-Only QR / ZeroTouch Payload Preview</p>
          <pre className="text-[11px] whitespace-pre-wrap overflow-x-auto">{JSON.stringify(payloadPreview, null, 2)}</pre>
        </div>
      )}
    </section>
  );
}

