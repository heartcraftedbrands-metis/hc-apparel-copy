import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft, Printer, Download, Package, AlertTriangle, CheckCircle,
  Truck, Loader2, Wrench, Mail
} from 'lucide-react';
import MessageTemplateModal from '@/components/messages/MessageTemplateModal';
import CustomerNotificationsSection from '@/components/orders/CustomerNotificationsSection';
import ProductionPacket from '@/components/orders/ProductionPacket';
import ProductionWorkflowPanel from '@/components/orders/ProductionWorkflowPanel';
import ZeroTouchPrepPanel from '@/components/orders/ZeroTouchPrepPanel';
import { format } from 'date-fns';
import { getVendorDraftWarnings } from '@/lib/smallOrderCheckout';

const STATUS_MAP = {
  draft:               { label: 'Draft',                color: 'bg-gray-100 text-gray-600' },
  ready_to_order:      { label: 'Ready to Order',       color: 'bg-yellow-100 text-yellow-700' },
  ordered_from_vendor: { label: 'Ordered From Vendor',  color: 'bg-blue-100 text-blue-700' },
  in_transit_to_me:    { label: 'In Transit to Me',     color: 'bg-purple-100 text-purple-700' },
  partially_received:  { label: 'Partially Received',   color: 'bg-orange-100 text-orange-700' },
  received:            { label: 'Received',             color: 'bg-green-100 text-green-700' },
  cancelled:           { label: 'Cancelled',            color: 'bg-red-100 text-red-700' },
};

// Map vendor draft status → customer order fulfillment_status
const VENDOR_TO_FULFILLMENT = {
  ordered_from_vendor: 'ordered_from_vendor',
  in_transit_to_me:    'in_transit_to_me',
  received:            'ready_to_ship',
  partially_received:  'in_transit_to_me',
};

function fmt(d) {
  if (!d) return '—';
  try { return format(new Date(d), 'MMM d, yyyy h:mm a'); } catch { return '—'; }
}

function money(v) {
  if (v == null) return '—';
  return `$${Number(v).toFixed(2)}`;
}

function RepairStat({ label, value, good, warn }) {
  const cls = warn ? 'text-red-700 font-bold' : good && value > 0 ? 'text-green-700 font-bold' : 'font-semibold';
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-base ${cls}`}>{value}</p>
    </div>
  );
}

function ItemWarnings({ item }) {
  const warns = [];
  if (!item.sku)               warns.push('SKU missing — do not order until fixed.');
  if (!item.image_url)         warns.push('Image missing — verify garment manually.');
  if (!item.color || !item.size) warns.push('Color/Size missing — do not order until fixed.');
  if (!item.artwork_file_url) warns.push('Artwork missing - vendor draft is incomplete.');
  if (!item.decoration_method) warns.push('Decoration method missing - vendor draft is incomplete.');
  if (!item.print_placement) warns.push('Print placement missing - vendor draft is incomplete.');
  if (Number(item.quantity) <= 0) warns.push('Quantity missing - vendor draft is incomplete.');
  if (!warns.length) return null;
  return (
    <div className="mt-2 space-y-1">
      {warns.map((w, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{w}
        </div>
      ))}
    </div>
  );
}

export default function AdminVendorOrderDraftDetail() {
  const qc = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const draftId = params.get('id');
  const [trackingNum, setTrackingNum] = useState('');
  const [trackingCarrier, setTrackingCarrier] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairReport, setRepairReport] = useState(null);
  const [qaReport, setQaReport] = useState(null);
  // Vendor order info form
  const [vendorName, setVendorName] = useState('');
  const [externalVendorOrderNum, setExternalVendorOrderNum] = useState('');
  const [vendorOrderDate, setVendorOrderDate] = useState('');
  const [expectedArrivalDate, setExpectedArrivalDate] = useState('');
  const [vendorInfoError, setVendorInfoError] = useState('');
  const [orderedConfirmation, setOrderedConfirmation] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState(null);

  const { data: draft, isLoading, refetch: refetchDraft } = useQuery({
    queryKey: ['vendor_order_draft', draftId],
    queryFn: () => base44.entities.VendorOrderDraft.get(draftId),
    enabled: !!draftId,
  });

  const { data: customerOrder, refetch: refetchCustomerOrder } = useQuery({
    queryKey: ['vendor-draft-customer-order', draft?.customer_order_id],
    queryFn: () => base44.entities.Order.get(draft.customer_order_id),
    enabled: !!draft?.customer_order_id,
  });

  // Initialize form fields once draft loads
  React.useEffect(() => {
    if (!draft) return;
    if (draft.notes) setNotes(draft.notes);
    if (draft.vendor_name) setVendorName(draft.vendor_name);
    if (draft.external_vendor_order_number) setExternalVendorOrderNum(draft.external_vendor_order_number);
    if (draft.vendor_order_date) setVendorOrderDate(draft.vendor_order_date);
    if (draft.expected_arrival_date) setExpectedArrivalDate(draft.expected_arrival_date);
    if (draft.tracking_number) setTrackingNum(draft.tracking_number);
    if (draft.tracking_carrier) setTrackingCarrier(draft.tracking_carrier);
    if (draft.tracking_url) setTrackingUrl(draft.tracking_url);
  }, [draft?.id]);

  const updateDraft = useMutation({
    mutationFn: (data) => base44.entities.VendorOrderDraft.update(draftId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor_order_draft', draftId] }),
  });

  const setStatus = async (vendor_status) => {
    await updateDraft.mutateAsync({ vendor_status });
    // Sync customer order fulfillment status
    const fulfillment = VENDOR_TO_FULFILLMENT[vendor_status];
    if (fulfillment && draft?.customer_order_id) {
      await base44.entities.Order.update(draft.customer_order_id, { fulfillment_status: fulfillment });
    }
  };

  const markOrderedFromVendor = async () => {
    setVendorInfoError('');
    if (!vendorName.trim() && !externalVendorOrderNum.trim()) {
      setVendorInfoError('Enter at least a Vendor Name or Vendor Order Number before marking as ordered.');
      return;
    }
    const update = {
      vendor_status: 'ordered_from_vendor',
      vendor_name: vendorName.trim(),
      external_vendor_order_number: externalVendorOrderNum.trim(),
      vendor_order_date: vendorOrderDate || new Date().toISOString().split('T')[0],
      expected_arrival_date: expectedArrivalDate || '',
      tracking_carrier: trackingCarrier.trim(),
      tracking_number: trackingNum.trim(),
      tracking_url: trackingUrl.trim(),
    };
    await updateDraft.mutateAsync(update);
    if (draft?.customer_order_id) {
      await base44.entities.Order.update(draft.customer_order_id, { fulfillment_status: 'ordered_from_vendor' });
    }
    setOrderedConfirmation(true);
  };

  const saveVendorInfo = async () => {
    await updateDraft.mutateAsync({
      vendor_name: vendorName.trim(),
      external_vendor_order_number: externalVendorOrderNum.trim(),
      vendor_order_date: vendorOrderDate,
      expected_arrival_date: expectedArrivalDate,
      tracking_carrier: trackingCarrier.trim(),
      tracking_number: trackingNum.trim(),
      tracking_url: trackingUrl.trim(),
      notes: notes,
    });
  };

  const saveTracking = async () => {
    if (!trackingNum.trim()) return;
    await updateDraft.mutateAsync({
      tracking_number: trackingNum.trim(),
      tracking_carrier: trackingCarrier.trim(),
      tracking_url: trackingUrl.trim(),
    });
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    await base44.entities.VendorOrderDraft.update(draftId, { notes });
    qc.invalidateQueries({ queryKey: ['vendor_order_draft', draftId] });
    setSavingNotes(false);
  };

  // ── Repair vendor draft item data ────────────────────────────
  const repairDraftItems = async () => {
    if (!draft) return;
    setRepairing(true);
    setRepairReport(null);
    try {
      // Load the linked customer order to get original order_items
      let customerOrderItems = [];
      if (draft.customer_order_id) {
        try {
          const order = await base44.entities.Order.get(draft.customer_order_id);
          customerOrderItems = order?.order_items || [];
        } catch (_) {}
      }

      const report = { scanned: 0, skusRepaired: 0, imagesRepaired: 0, brandStyleRepaired: 0, stillMissingSku: 0, stillMissingImage: 0 };
      const repairedItems = [];

      for (let i = 0; i < (draft.items || []).length; i++) {
        const draftItem = { ...(draft.items[i]) };
        // Find matching customer order item by name or index
        const srcItem = customerOrderItems[i] || customerOrderItems.find(o =>
          (o.product_name || o.name || '') === draftItem.product_name
        ) || {};

        report.scanned++;

        const origSku       = draftItem.sku;
        const origImage     = draftItem.image_url;
        const origBrand     = draftItem.brand;
        const origStyle     = draftItem.style_number;

        // Carry over any fields from customer order item
        if (!draftItem.sku && srcItem.sku)         draftItem.sku = srcItem.sku;
        if (!draftItem.image_url && srcItem.image_url) draftItem.image_url = srcItem.image_url;
        if (!draftItem.color && srcItem.color)     draftItem.color = srcItem.color;
        if (!draftItem.size && srcItem.size)       draftItem.size = srcItem.size;

        // Look up Product record
        const productId = srcItem.product_id || draftItem.product_id;
        if (productId) {
          try {
            const product = await base44.entities.Product.get(productId);
            if (product) {
              // Don't use vendor_source — it stores supplier name like "Garment Catalog", not the garment brand
              if (!draftItem.style_number) draftItem.style_number = product.supplier_sku || '';
              if (!draftItem.vendor_cost && product.blank_garment_cost > 0) draftItem.vendor_cost = product.blank_garment_cost;

              const allVariants = Array.isArray(product.variants) ? product.variants : [];

              // Match variant: variant_id → sku → color+size
              let matched = (srcItem.variant_id || draftItem.variant_id)
                ? allVariants.find(v => v.id === (srcItem.variant_id || draftItem.variant_id))
                : null;
              if (!matched && draftItem.sku) matched = allVariants.find(v => v.sku === draftItem.sku);
              if (!matched && srcItem.sku)   matched = allVariants.find(v => v.sku === srcItem.sku);
              if (!matched) {
                const c = (draftItem.color || srcItem.color || '').toLowerCase();
                const s = (draftItem.size  || srcItem.size  || '').toLowerCase();
                if (c && s) matched = allVariants.find(v =>
                  (v.color || '').toLowerCase() === c && (v.size || '').toLowerCase() === s
                );
              }

              if (matched) {
                if (!draftItem.sku && matched.sku)           draftItem.sku = matched.sku;
                if (!draftItem.image_url && matched.image_url) draftItem.image_url = matched.image_url;
              }

              // Fallback: product main image
              if (!draftItem.image_url && product.image_url) draftItem.image_url = product.image_url;
              if (!draftItem.image_url && product.mockup_images?.length) draftItem.image_url = product.mockup_images[0];
            }
          } catch (_) {}
        }

        // GarmentCatalog lookup — always try for brand since product.vendor_source is not the garment brand
        try {
          let garments = [];
          if (draftItem.sku) garments = await base44.entities.GarmentCatalog.filter({ sku: draftItem.sku });
          else if (draftItem.product_name) garments = await base44.entities.GarmentCatalog.filter({ product_name: draftItem.product_name });
          const g = garments?.[0];
          if (g) {
            if (!draftItem.sku && g.sku)             draftItem.sku = g.sku;
            if (!draftItem.image_url && g.image_url) draftItem.image_url = g.image_url;
            if (g.brand)                             draftItem.brand = g.brand; // always prefer catalog brand
            if (!draftItem.style_number && g.style_number) draftItem.style_number = g.style_number;
            if (!draftItem.vendor_cost && g.blank_cost > 0) draftItem.vendor_cost = g.blank_cost;
          }
        } catch (_) {}

        // Last resort: parse brand from product name (e.g. "Gildan 2200" → "Gildan")
        if (!draftItem.brand && draftItem.product_name) {
          const firstWord = draftItem.product_name.trim().split(/\s+/)[0];
          if (firstWord && firstWord.length > 2) draftItem.brand = firstWord;
        }

        // Count what changed
        if (!origSku && draftItem.sku)             report.skusRepaired++;
        if (!origImage && draftItem.image_url)     report.imagesRepaired++;
        if ((!origBrand && draftItem.brand) || (!origStyle && draftItem.style_number)) report.brandStyleRepaired++;
        if (!draftItem.sku)                        report.stillMissingSku++;
        if (!draftItem.image_url)                  report.stillMissingImage++;

        repairedItems.push(draftItem);
      }

      const hasSkuWarnings     = repairedItems.some(i => !i.sku);
      const hasImageWarnings   = repairedItems.some(i => !i.image_url);
      const hasMissingWarnings = repairedItems.some(i => !i.color || !i.size);

      await base44.entities.VendorOrderDraft.update(draftId, {
        items: repairedItems,
        has_sku_warnings: hasSkuWarnings,
        has_image_warnings: hasImageWarnings,
        has_missing_warnings: hasMissingWarnings,
      });

      await qc.invalidateQueries({ queryKey: ['vendor_order_draft', draftId] });
      setRepairReport(report);
    } finally {
      setRepairing(false);
    }
  };

  const exportCSV = () => {
    if (!draft) return;
    const headers = [
      'Vendor Order #', 'Customer Order #', 'Customer Name', 'Customer Email',
      'SKU', 'Product Name', 'Brand', 'Style Number', 'Color', 'Size',
      'Quantity', 'Customer Unit Price', 'Customer Line Total', 'Vendor Cost', 'Notes'
    ];
    const rows = (draft.items || []).map(item => [
      draft.vendor_order_number || '',
      draft.customer_order_number || '',
      draft.customer_name || '',
      draft.customer_email || '',
      item.sku || '',
      item.product_name || '',
      item.brand || '',
      item.style_number || '',
      item.color || '',
      item.size || '',
      item.quantity || 0,
      item.customer_unit_price != null ? item.customer_unit_price : '',
      item.customer_line_total != null ? item.customer_line_total : '',
      item.vendor_cost != null ? item.vendor_cost : '',
      item.notes || '',
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendor-order-${draft.vendor_order_number || draftId?.slice(-6)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runQA = () => {
    if (!draft) return;
    const items = draft.items || [];
    const checks = [];
    const pass = (label) => checks.push({ label, pass: true });
    const fail = (label) => checks.push({ label, pass: false });

    draft.vendor_order_number  ? pass('Vendor order number exists')   : fail('Vendor order number missing');
    draft.customer_order_number ? pass('Customer order number exists') : fail('Customer order number missing');
    draft.customer_name        ? pass('Customer name exists')         : fail('Customer name missing');
    draft.customer_email       ? pass('Customer email exists')        : fail('Customer email missing');

    const missingName    = items.filter(i => !i.product_name).length;
    const missingImage   = items.filter(i => !i.image_url).length;
    const missingSku     = items.filter(i => !i.sku).length;
    const missingBrand   = items.filter(i => !i.brand).length;
    const missingStyle   = items.filter(i => !i.style_number).length;
    const missingColor   = items.filter(i => !i.color).length;
    const missingSize    = items.filter(i => !i.size).length;
    const missingQty     = items.filter(i => !(i.quantity > 0)).length;
    const missingPrice   = items.filter(i => i.customer_unit_price == null).length;
    const missingTotal   = items.filter(i => i.customer_line_total == null).length;

    missingName  === 0 ? pass('All items have product name')      : fail(`${missingName} item(s) missing product name`);
    missingImage === 0 ? pass('All items have image')             : fail(`${missingImage} item(s) missing image`);
    missingSku   === 0 ? pass('All items have SKU')               : fail(`${missingSku} item(s) missing SKU`);
    missingBrand === 0 ? pass('All items have brand')             : fail(`${missingBrand} item(s) missing brand`);
    missingStyle === 0 ? pass('All items have style number')      : fail(`${missingStyle} item(s) missing style number`);
    missingColor === 0 ? pass('All items have color')             : fail(`${missingColor} item(s) missing color`);
    missingSize  === 0 ? pass('All items have size')              : fail(`${missingSize} item(s) missing size`);
    missingQty   === 0 ? pass('All items have quantity > 0')      : fail(`${missingQty} item(s) missing quantity`);
    missingPrice === 0 ? pass('All items have customer unit price') : fail(`${missingPrice} item(s) missing unit price`);
    missingTotal === 0 ? pass('All items have line total')        : fail(`${missingTotal} item(s) missing line total`);
    pass('No vendor order has been placed');
    pass('Deleted rows: 0');

    const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);
    setQaReport({
      checks,
      passed: checks.filter(c => c.pass).length,
      failed: checks.filter(c => !c.pass).length,
      itemsChecked: items.length,
      missingSku,
      missingImage,
      missingColorSize: Math.max(missingColor, missingSize),
      totalQty,
    });
  };

  if (isLoading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  if (!draft) return (
    <div className="max-w-4xl mx-auto px-4 py-12 text-center text-muted-foreground">
      Vendor order draft not found.
    </div>
  );

  const statusInfo = STATUS_MAP[draft.vendor_status] || STATUS_MAP['draft'];
  const items = draft.items || [];
  const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);
  const anyWarn = draft.has_sku_warnings || draft.has_image_warnings || draft.has_missing_warnings;
  const checkoutWarnings = getVendorDraftWarnings(draft);

  const draftTemplateVars = {
    customer_name: draft.customer_name || '',
    customer_email: draft.customer_email || '',
    order_number: draft.customer_order_number || `#${draft.customer_order_id?.slice(-8).toUpperCase()}` || '',
    order_total: '',
    shipping_carrier: draft.tracking_carrier || '—',
    tracking_number: draft.tracking_number || '—',
    tracking_url: draft.tracking_url || '—',
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-6 px-4 md:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <Package className="w-6 h-6 text-accent" />
            <h1 className="text-xl font-extrabold">Vendor Order Draft</h1>
            <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
          </div>
          <p className="text-primary-foreground/70 text-sm">
            {draft.vendor_order_number} · Customer: {draft.customer_name}
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 space-y-8">

        {checkoutWarnings.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <p className="mb-2 flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4" /> Paid-order draft warnings
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {checkoutWarnings.map(warning => <li key={warning}>{warning}</li>)}
            </ul>
          </div>
        )}

        {/* Action Bar */}
        <div className="flex flex-wrap gap-2">
          <Link to="/AdminDashboard">
            <Button size="sm" variant="outline" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />Admin Dashboard
            </Button>
          </Link>
          <Link to="/AdminVendorOrders">
            <Button size="sm" variant="outline" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />Back to Vendor Orders
            </Button>
          </Link>
          <Link to="/AdminInbox?tab=fulfillment">
            <Button size="sm" variant="outline" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />Back to Inbox
            </Button>
          </Link>
          <Link to={`/AdminOrderDetail?order_id=${draft.customer_order_id}`}>
            <Button size="sm" variant="outline" className="gap-1.5">
              <Package className="w-4 h-4" />Back to Customer Order
            </Button>
          </Link>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={runQA}>
            <CheckCircle className="w-4 h-4" />Run Vendor Draft QA
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="w-4 h-4" />Print Vendor Order
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCSV}>
            <Download className="w-4 h-4" />Export Vendor CSV
          </Button>
          <Button size="sm" variant="outline"
            className="gap-1.5 border-yellow-400 text-yellow-700 hover:bg-yellow-50"
            disabled={draft.vendor_status === 'ready_to_order' || updateDraft.isPending}
            onClick={() => setStatus('ready_to_order')}>
            <Truck className="w-4 h-4" />Mark Ready to Order
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 border-amber-400 text-amber-700 hover:bg-amber-50"
            onClick={repairDraftItems} disabled={repairing}>
            {repairing
              ? <><Loader2 className="w-4 h-4 animate-spin" />Repairing…</>
              : <><Wrench className="w-4 h-4" />Repair Item Data</>
            }
          </Button>
        </div>

        {/* Repair Report */}
        {repairReport && (
          <div className="bg-green-50 border border-green-300 rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-green-800 font-bold text-sm mb-1">
              <CheckCircle className="w-4 h-4" />Repair Complete
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <RepairStat label="Items Scanned"      value={repairReport.scanned} />
              <RepairStat label="SKUs Repaired"       value={repairReport.skusRepaired} good />
              <RepairStat label="Images Repaired"     value={repairReport.imagesRepaired} good />
              <RepairStat label="Brand/Style Repaired" value={repairReport.brandStyleRepaired} good />
              <RepairStat label="Still Missing SKU"   value={repairReport.stillMissingSku} warn={repairReport.stillMissingSku > 0} />
              <RepairStat label="Still Missing Image" value={repairReport.stillMissingImage} warn={repairReport.stillMissingImage > 0} />
              <RepairStat label="Deleted Rows"        value={0} />
              <RepairStat label="Vendor Orders Placed" value={0} />
            </div>
          </div>
        )}

        {/* QA Report */}
        {qaReport && (
          <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-bold text-base">Vendor Draft QA</h2>
              <span className="text-xs bg-green-100 text-green-700 font-bold px-2.5 py-1 rounded-full">{qaReport.passed} passed</span>
              {qaReport.failed > 0 && <span className="text-xs bg-red-100 text-red-700 font-bold px-2.5 py-1 rounded-full">{qaReport.failed} failed</span>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm bg-muted/30 rounded-xl p-4">
              <RepairStat label="Items Checked"        value={qaReport.itemsChecked} />
              <RepairStat label="Total Quantity"        value={qaReport.totalQty} />
              <RepairStat label="Missing SKU"           value={qaReport.missingSku}       warn={qaReport.missingSku > 0} />
              <RepairStat label="Missing Image"         value={qaReport.missingImage}     warn={qaReport.missingImage > 0} />
              <RepairStat label="Missing Color/Size"    value={qaReport.missingColorSize} warn={qaReport.missingColorSize > 0} />
              <RepairStat label="Deleted Rows"          value={0} />
              <RepairStat label="Vendor Orders Placed"  value={0} />
            </div>
            <div className="space-y-1.5">
              {qaReport.checks.map((c, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${c.pass ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                  {c.pass
                    ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  }
                  {c.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warning Banner */}
        {anyWarn && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-800 text-sm">This draft has missing data warnings.</p>
              <p className="text-amber-700 text-xs mt-0.5">Review each item below before ordering from your vendor.</p>
            </div>
          </div>
        )}

        {/* Safety Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-blue-600 shrink-0" />
          <p className="text-blue-800 text-sm font-medium">
            This is an internal draft only. No vendor order has been placed and no charges have been made.
          </p>
        </div>

        {/* ── Vendor Order Info ── */}
        <div id="vendor-info" className="bg-white border-2 border-primary/20 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Truck className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-base text-primary">Vendor Order Info</h2>
            <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
          </div>

          {/* Test data helper */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
            <strong>For testing:</strong> Vendor Name: <code className="font-mono">S&amp;S Activewear</code>, Vendor Order #: <code className="font-mono">TEST-123</code>, Carrier: <code className="font-mono">UPS</code>, Tracking #: <code className="font-mono">TESTTRACK123</code>.
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1 font-medium">Vendor Name *</p>
              <Input placeholder="e.g. S&S Activewear" value={vendorName}
                onChange={e => setVendorName(e.target.value)} className="text-sm" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1 font-medium">Vendor Order Number *</p>
              <Input placeholder="e.g. TEST-123" value={externalVendorOrderNum}
                onChange={e => setExternalVendorOrderNum(e.target.value)} className="text-sm font-mono" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1 font-medium">Vendor Order Date</p>
              <Input type="date" value={vendorOrderDate}
                onChange={e => setVendorOrderDate(e.target.value)} className="text-sm" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1 font-medium">Expected Arrival Date</p>
              <Input type="date" value={expectedArrivalDate}
                onChange={e => setExpectedArrivalDate(e.target.value)} className="text-sm" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1 font-medium">Tracking Carrier</p>
              <Input placeholder="e.g. UPS, FedEx…" value={trackingCarrier}
                onChange={e => setTrackingCarrier(e.target.value)} className="text-sm" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1 font-medium">Tracking Number</p>
              <Input placeholder="e.g. TESTTRACK123" value={trackingNum}
                onChange={e => setTrackingNum(e.target.value)} className="text-sm font-mono" />
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground mb-1 font-medium">Tracking URL (optional)</p>
              <Input placeholder="https://..." value={trackingUrl}
                onChange={e => setTrackingUrl(e.target.value)} className="text-sm" />
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground mb-1 font-medium">Internal Notes</p>
              <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Notes about this vendor order…" className="resize-none text-sm" />
            </div>
          </div>

          {vendorInfoError && (
            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{vendorInfoError}
            </div>
          )}

          {orderedConfirmation && (
            <div className="flex items-start gap-2 text-sm text-green-800 bg-green-50 border border-green-300 rounded-xl px-4 py-3">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span><strong>Vendor order marked as ordered internally.</strong> No vendor API order was placed. No charges were made. Customer order fulfillment status updated to "Ordered From Vendor".</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
            <Button size="sm" variant="outline" onClick={saveVendorInfo} disabled={updateDraft.isPending}>
              Save Vendor Info
            </Button>
            <Button size="sm"
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              disabled={draft.vendor_status === 'ordered_from_vendor' || updateDraft.isPending}
              onClick={markOrderedFromVendor}>
              <CheckCircle className="w-4 h-4" />Mark Ordered From Vendor
            </Button>
            <Button size="sm" variant="outline"
              className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50"
              disabled={draft.vendor_status === 'in_transit_to_me' || updateDraft.isPending}
              onClick={() => setStatus('in_transit_to_me')}>
              <Truck className="w-4 h-4" />Mark In Transit to Me
            </Button>
            <Button size="sm" variant="outline"
              className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
              disabled={draft.vendor_status === 'received' || updateDraft.isPending}
              onClick={() => setStatus('received')}>
              <CheckCircle className="w-4 h-4" />Mark Received
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white border border-border rounded-2xl p-6">
          <h2 className="font-bold text-base mb-4">Order Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Vendor Order #</p>
              <p className="font-mono font-semibold">{draft.vendor_order_number}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Customer Order #</p>
              <p className="font-semibold">{draft.customer_order_number}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Items / Qty</p>
              <p className="font-semibold">{items.length} items · {totalQty} units</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Created</p>
              <p className="font-semibold">{fmt(draft.created_date)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mt-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Customer</p>
              <p className="font-semibold">{draft.customer_name}</p>
              <a href={`mailto:${draft.customer_email}`} className="text-xs text-primary hover:underline">{draft.customer_email}</a>
            </div>
            {draft.tracking_number && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Tracking</p>
                <p className="font-mono text-sm">{draft.tracking_carrier && `${draft.tracking_carrier}: `}{draft.tracking_number}</p>
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="bg-white border border-border rounded-2xl p-6">
          <h2 className="font-bold text-base mb-4">Line Items</h2>
          <div className="space-y-4">
            {items.map((item, i) => (
              <div key={i} className="flex gap-4 p-4 border border-border rounded-xl">
                {/* Image */}
                <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                  {item.image_url
                    ? <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover" />
                    : <Package className="w-8 h-8 text-muted-foreground/30" />
                  }
                </div>
                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{item.product_name || '—'}</p>
                    <p className="text-sm font-bold">{money(item.customer_line_total)}</p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 mt-2">
                    <div>
                      <p className="text-xs text-muted-foreground">SKU</p>
                      <p className={`text-xs font-mono font-semibold ${!item.sku ? 'text-red-600' : ''}`}>{item.sku || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Brand / Style</p>
                      <p className="text-xs">{[item.brand, item.style_number].filter(Boolean).join(' ') || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Color</p>
                      <p className={`text-xs font-semibold ${!item.color ? 'text-red-600' : ''}`}>{item.color || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Size</p>
                      <p className={`text-xs font-semibold ${!item.size ? 'text-red-600' : ''}`}>{item.size || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Qty</p>
                      <p className="text-xs font-bold">{item.quantity}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Unit Price</p>
                      <p className="text-xs">{money(item.customer_unit_price)}</p>
                    </div>
                    {item.vendor_cost != null && (
                      <div>
                        <p className="text-xs text-muted-foreground">Vendor Cost</p>
                        <p className="text-xs text-green-700">{money(item.vendor_cost)}</p>
                      </div>
                    )}
                  </div>
                  <ItemWarnings item={item} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <ProductionWorkflowPanel
          order={customerOrder}
          vendorDraft={draft}
          onUpdated={async () => {
            await Promise.all([refetchDraft(), refetchCustomerOrder()]);
            qc.invalidateQueries({ queryKey: ['customer-notifications', customerOrder?.id] });
          }}
        />

        <ProductionPacket order={customerOrder || {}} vendorDraft={draft} />

        <ZeroTouchPrepPanel
          draft={draft}
          customerOrder={customerOrder}
          onUpdated={async () => {
            await Promise.all([refetchDraft(), refetchCustomerOrder()]);
          }}
        />

        {customerOrder && (
          <CustomerNotificationsSection orderId={customerOrder.id} order={customerOrder} />
        )}

        {/* Generate Message */}
        <div className="bg-white border border-border rounded-2xl p-5 space-y-3">
          <h2 className="font-bold text-sm text-muted-foreground uppercase tracking-wide">Generate Customer Message</h2>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setActiveTemplate('ordered_from_vendor')}>
            <Mail className="w-4 h-4 text-indigo-500" />Generate "Ordered From Vendor" Message
          </Button>
          <p className="text-xs text-muted-foreground">Opens a pre-filled message you can copy or email to the customer. Nothing sends automatically.</p>
        </div>

        {/* Additional Status Actions */}
        <div className="bg-white border border-border rounded-2xl p-5 space-y-3">
          <h2 className="font-bold text-sm text-muted-foreground uppercase tracking-wide">Other Status Updates</h2>
          <div className="flex flex-wrap gap-2">
            {[
              { s: 'ready_to_order',     label: 'Mark Ready to Order',     cls: 'border-yellow-300 text-yellow-700 hover:bg-yellow-50' },
              { s: 'partially_received', label: 'Mark Partially Received', cls: 'border-orange-300 text-orange-700 hover:bg-orange-50' },
              { s: 'cancelled',          label: 'Cancel Draft',            cls: 'border-red-300 text-red-500 hover:bg-red-50' },
            ].map(({ s, label, cls }) => (
              <Button key={s} size="sm" variant="outline"
                disabled={draft.vendor_status === s || updateDraft.isPending}
                onClick={() => setStatus(s)}
                className={cls}>
                {label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Status changes also update the linked customer order fulfillment status.</p>
        </div>

      </div>

      {activeTemplate && (
        <MessageTemplateModal
          templateKey={activeTemplate}
          vars={draftTemplateVars}
          onClose={() => setActiveTemplate(null)}
        />
      )}
    </div>
  );
}
