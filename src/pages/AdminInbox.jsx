import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Mail, MessageSquare, Package, Clock, Eye, CheckCircle, Archive,
  Loader2, ChevronRight, Inbox, DollarSign, Truck, AlertTriangle, ExternalLink, ArrowLeft
} from 'lucide-react';
import MessageTemplateModal from '@/components/messages/MessageTemplateModal';
import { format } from 'date-fns';

// Simple in-page toast
function useToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const show = (msg) => {
    setToast(msg);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 3500);
  };
  return { toast, show };
}

// ── Status maps ────────────────────────────────────────────────
const MSG_STATUS_MAP = {
  new:      { label: 'New',      color: 'bg-blue-100 text-blue-700' },
  reviewed: { label: 'Reviewed', color: 'bg-yellow-100 text-yellow-700' },
  replied:  { label: 'Replied',  color: 'bg-green-100 text-green-700' },
  archived: { label: 'Archived', color: 'bg-gray-100 text-gray-500' },
};

const QUOTE_STATUS_MAP = {
  new:                { label: 'New',                 color: 'bg-blue-100 text-blue-700' },
  reviewing:          { label: 'Reviewing',           color: 'bg-yellow-100 text-yellow-700' },
  waiting_on_customer:{ label: 'Waiting on Customer', color: 'bg-orange-100 text-orange-700' },
  quote_sent:         { label: 'Quote Sent',          color: 'bg-purple-100 text-purple-700' },
  approved:           { label: 'Approved',            color: 'bg-green-100 text-green-700' },
  declined:           { label: 'Declined',            color: 'bg-red-100 text-red-700' },
  completed:          { label: 'Completed',           color: 'bg-teal-100 text-teal-700' },
  converted_to_order: { label: 'Converted to Order',  color: 'bg-primary/10 text-primary' },
};

const PAY_STATUS_MAP = {
  unpaid:           { label: 'Unpaid',            color: 'bg-red-100 text-red-700' },
  awaiting_payment: { label: 'Awaiting Payment',  color: 'bg-orange-100 text-orange-700' },
  pending:          { label: 'Pending',            color: 'bg-orange-100 text-orange-700' },
  pay_later:        { label: 'Pay Later',          color: 'bg-yellow-100 text-yellow-700' },
  paid:             { label: 'Paid',               color: 'bg-green-100 text-green-700' },
  partially_paid:   { label: 'Partially Paid',     color: 'bg-teal-100 text-teal-700' },
  demo:             { label: 'Demo',               color: 'bg-gray-100 text-gray-500' },
  refunded:         { label: 'Refunded',           color: 'bg-purple-100 text-purple-700' },
};

const FULFILL_STATUS_MAP = {
  not_started:         { label: 'Not Started',           color: 'bg-gray-100 text-gray-600' },
  vendor_order_needed: { label: 'Awaiting Fulfillment',  color: 'bg-yellow-100 text-yellow-700' },
  ordered_from_vendor: { label: 'Ordered From Vendor',   color: 'bg-blue-100 text-blue-700' },
  in_transit_to_me:    { label: 'In Transit to Me',      color: 'bg-purple-100 text-purple-700' },
  ready_to_ship:       { label: 'Ready to Ship',         color: 'bg-teal-100 text-teal-700' },
  shipped:             { label: 'Shipped',               color: 'bg-indigo-100 text-indigo-700' },
  delivered:           { label: 'Delivered',             color: 'bg-green-100 text-green-700' },
  issue_hold:          { label: 'Issue / Hold',          color: 'bg-red-100 text-red-700' },
  completed:           { label: 'Completed',             color: 'bg-green-200 text-green-800' },
};

const PRODUCT_LABELS = {
  t_shirts: 'T-Shirts', hoodies: 'Hoodies', sweatshirts: 'Sweatshirts',
  tank_tops: 'Tank Tops', sportswear: 'Sportswear', youth_apparel: 'Youth Apparel',
  bulk_order: 'Bulk Order', other: 'Other',
};
const CONTACT_LABELS   = { email: 'Email', phone: 'Phone Call', text: 'Text Message' };
const PRINT_LABELS     = { dtf: 'DTF', screen_print: 'Screen Print', vinyl: 'Vinyl', embroidery: 'Embroidery', not_sure: 'Not Sure' };
const ARTWORK_LABELS   = { print_ready: 'Print-Ready Artwork', have_logo_need_help: 'Have Logo – Need Help', only_idea: 'Only an Idea', need_design_help: 'Needs Design Help' };
const GARMENT_LABELS   = { picked_from_shop: 'Picked from Shop', need_help_choosing: 'Needs Help Choosing', have_own_garment: 'Customer Has Own Garment' };
const PRINT_COLOR_LABELS = { '1_color': '1 Color', '2_colors': '2 Colors', full_color: 'Full Color', not_sure: 'Not Sure' };

function fmt(date, withTime = false) {
  if (!date) return '—';
  try { return format(new Date(date), withTime ? 'MMM d, yyyy h:mm a' : 'MMM d, yyyy'); } catch { return '—'; }
}

function money(v) {
  if (v == null) return '—';
  return `$${Number(v).toFixed(2)}`;
}

function Field({ label, value }) {
  if (value == null || value === '' || value === false) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function SectionLabel({ children }) {
  return <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">{children}</p>;
}

// ── Order card helper ──────────────────────────────────────────
function orderNum(o) {
  return o.id ? `#${o.id.slice(-6).toUpperCase()}` : '—';
}

function itemPreview(o) {
  const items = o.order_items || [];
  if (!items.length) return o.garment_type || '—';
  return items.map(i => i.product_name || i.name || '').filter(Boolean).join(', ') || '—';
}

// ── Main Component ─────────────────────────────────────────────
export default function AdminInbox() {
  const qc = useQueryClient();
  const { toast, show: showToast } = useToast();
  const [activeTab, setActiveTab]       = useState('messages');
  const [selectedMsg, setSelectedMsg]   = useState(null);
  const [selectedQ, setSelectedQ]       = useState(null);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [templateVars, setTemplateVars] = useState({});
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [paymentNote, setPaymentNote]   = useState('');
  const [trackingNum, setTrackingNum]   = useState('');
  const [savingNote, setSavingNote]     = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [draftCreated, setDraftCreated]   = useState(null); // { draftId, orderId }
  const [fulfillFilter, setFulfillFilter] = useState('all');
  // Local optimistic overlay for orders: id → patched fields
  const [orderPatches, setOrderPatches] = useState({});

  // ── Data fetches ────────────────────────────────────────────
  const { data: messages = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ['contact_messages'],
    queryFn: () => base44.entities.ContactMessage.list('-created_date'),
  });

  const { data: quotes = [], isLoading: loadingQuotes } = useQuery({
    queryKey: ['quote_requests'],
    queryFn: () => base44.entities.QuoteRequest.list('-created_date'),
  });

  const { data: rawOrders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['orders_inbox'],
    queryFn: () => base44.entities.Order.list('-created_date', 200),
    // On fresh data, clear patches that are now reflected in DB
    onSuccess: () => setOrderPatches({}),
  });

  // Apply local patches on top of DB data for instant UI
  const orders = rawOrders.map(o =>
    orderPatches[o.id] ? { ...o, ...orderPatches[o.id] } : o
  );

  // ── Mutations ───────────────────────────────────────────────
  const updateMsg = useMutation({
    mutationFn: ({ id, status }) => base44.entities.ContactMessage.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact_messages'] }),
  });

  const updateQuote = useMutation({
    mutationFn: ({ id, status }) => base44.entities.QuoteRequest.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quote_requests'] }),
  });

  // ── Helpers ─────────────────────────────────────────────────
  const setMsgStatus = (id, status) => {
    updateMsg.mutate({ id, status });
    if (selectedMsg?.id === id) setSelectedMsg(m => ({ ...m, status }));
  };

  const setQuoteStatus = (id, status) => {
    updateQuote.mutate({ id, status });
    if (selectedQ?.id === id) setSelectedQ(q => ({ ...q, status }));
  };

  // Patch an order locally + persist to DB
  const patchOrder = (id, data) => {
    setOrderPatches(p => ({ ...p, [id]: { ...(p[id] || {}), ...data } }));
    if (selectedOrder?.id === id) setSelectedOrder(o => ({ ...o, ...data }));
    base44.entities.Order.update(id, data).then(() =>
      qc.invalidateQueries({ queryKey: ['orders_inbox'] })
    );
  };

  // Mark paid: update locally, clear from payment list, auto-select next
  const markOrderPaid = (order) => {
    const paidData = {
      payment_status: 'paid',
      amount_paid: order.total_amount,
      fulfillment_status: order.fulfillment_status || 'not_started',
      status: 'awaiting_fulfillment',
    };
    // Apply patch immediately so filters re-compute
    setOrderPatches(p => ({ ...p, [order.id]: { ...(p[order.id] || {}), ...paidData } }));
    base44.entities.Order.update(order.id, paidData).then(() =>
      qc.invalidateQueries({ queryKey: ['orders_inbox'] })
    );
    // After patch, the order will drop from awaitingPaymentOrders.
    // Pick next unpaid order to select (computed after patch below).
    const remaining = orders.filter(o =>
      o.id !== order.id &&
      isAwaitingPayment({ ...o, ...(orderPatches[o.id] || {}) })
    );
    setSelectedOrder(remaining[0] || null);
    setPaymentNote('');
    showToast('Order marked paid and moved to Awaiting Fulfillment.');
  };

  const savePaymentNote = async (order) => {
    if (!paymentNote.trim()) return;
    setSavingNote(true);
    patchOrder(order.id, { payment_notes: paymentNote });
    setSavingNote(false);
    setPaymentNote('');
  };

  const saveTracking = (order) => {
    if (!trackingNum.trim()) return;
    patchOrder(order.id, {
      tracking_number: trackingNum,
      fulfillment_status: 'shipped',
      status: 'shipped',
    });
    setTrackingNum('');
  };

  // ── Enrich order items with product variant data ─────────────
  const enrichOrderItems = async (orderItems) => {
    const enriched = [];
    for (const item of orderItems) {
      let sku = item.sku || '';
      let image_url = item.image_url || '';
      let brand = item.garment_brand || item.brand || '';
      let style_number = item.garment_style_number || item.style_number || '';
      let vendor_cost = item.vendor_cost || null;

      // Try to load product record for richer data
      if (item.product_id) {
        try {
          const product = await base44.entities.Product.get(item.product_id);
          if (product) {
            // Don't use vendor_source — it stores supplier name like "Garment Catalog", not the garment brand
            if (!style_number) style_number = product.supplier_sku || '';
            if (!vendor_cost && product.blank_garment_cost > 0) vendor_cost = product.blank_garment_cost;

            // Find matching variant by variant_id, sku, or color+size
            const variants = Array.isArray(product.available_colors) ? product.available_colors : [];
            const allVariants = Array.isArray(product.variants) ? product.variants : [];

            // Try variant_id match first
            let matchedVariant = item.variant_id
              ? allVariants.find(v => v.id === item.variant_id)
              : null;

            // Try sku match
            if (!matchedVariant && sku) {
              matchedVariant = allVariants.find(v => v.sku === sku);
            }

            // Try color+size match
            if (!matchedVariant && item.color && item.size) {
              const c = (item.color || '').toLowerCase();
              const s = (item.size || '').toLowerCase();
              matchedVariant = allVariants.find(v =>
                (v.color || '').toLowerCase() === c && (v.size || '').toLowerCase() === s
              );
            }

            if (matchedVariant) {
              if (!sku && matchedVariant.sku) sku = matchedVariant.sku;
              if (!image_url && matchedVariant.image_url) image_url = matchedVariant.image_url;
            }

            // Fallback: product main image
            if (!image_url && product.image_url) image_url = product.image_url;
            // Fallback: first mockup image
            if (!image_url && product.mockup_images?.length) image_url = product.mockup_images[0];
          }
        } catch (_) { /* product not found, continue with order item data */ }
      }

      // GarmentCatalog lookup — always try for brand since product.vendor_source is not the garment brand
      try {
        let garments = [];
        if (sku) {
          garments = await base44.entities.GarmentCatalog.filter({ sku });
        } else if (item.product_name) {
          garments = await base44.entities.GarmentCatalog.filter({ product_name: item.product_name });
        }
        const g = garments?.[0];
        if (g) {
          if (!sku && g.sku) sku = g.sku;
          if (!image_url && g.image_url) image_url = g.image_url;
          if (g.brand) brand = g.brand; // always prefer catalog brand over vendor_source
          if (!style_number && g.style_number) style_number = g.style_number;
          if (!vendor_cost && g.blank_cost > 0) vendor_cost = g.blank_cost;
        }
      } catch (_) { /* skip */ }

      // Last resort: parse brand from product name (e.g. "Gildan 2200" → "Gildan")
      if (!brand && item.product_name) {
        const firstWord = item.product_name.trim().split(/\s+/)[0];
        if (firstWord && firstWord.length > 2) brand = firstWord;
      }

      enriched.push({
        product_name: item.product_name || item.name || '',
        brand,
        style_number,
        sku,
        color: item.color || '',
        size: item.size || '',
        quantity: item.quantity || 1,
        image_url,
        customer_unit_price: item.price || 0,
        customer_line_total: (item.price || 0) * (item.quantity || 1),
        vendor_cost,
        notes: item.notes || '',
      });
    }
    return enriched;
  };

  // ── Create Vendor Order Draft ────────────────────────────────
  const createVendorOrderDraft = async (order) => {
    setCreatingDraft(true);
    try {
      const items = await enrichOrderItems(order.order_items || []);

      const hasSkuWarnings     = items.some(i => !i.sku);
      const hasImageWarnings   = items.some(i => !i.image_url);
      const hasMissingWarnings = items.some(i => !i.color || !i.size);
      const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);
      const orderNum = `#${order.id.slice(-6).toUpperCase()}`;
      const vendorOrderNumber = `VO-${Date.now().toString().slice(-8)}`;

      const draft = await base44.entities.VendorOrderDraft.create({
        vendor_order_number: vendorOrderNumber,
        customer_order_id: order.id,
        customer_order_number: orderNum,
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        order_date: order.created_date,
        vendor_status: 'draft',
        items,
        has_sku_warnings: hasSkuWarnings,
        has_image_warnings: hasImageWarnings,
        has_missing_warnings: hasMissingWarnings,
        total_quantity: totalQty,
        item_count: items.length,
        notes: '',
      });

      // Move customer order fulfillment status to processing
      patchOrder(order.id, { fulfillment_status: 'vendor_order_needed' });

      setDraftCreated({ draftId: draft.id, orderId: order.id });
      showToast('Vendor Order Draft created. No vendor order has been placed.');
    } finally {
      setCreatingDraft(false);
    }
  };

  // ── Filter predicates ────────────────────────────────────────
  function isAwaitingPayment(o) {
    const ps = o.payment_status;
    const bal = (o.total_amount || 0) - (o.amount_paid || 0);
    if (['paid', 'partially_paid', 'refunded', 'canceled', 'demo'].includes(ps)) return false;
    return ['awaiting_payment', 'unpaid', 'pending', 'pay_later'].includes(ps) ||
      (!ps && bal > 0);
  }

  function isAwaitingFulfillment(o) {
    const ps = o.payment_status;
    const fs = o.fulfillment_status || 'not_started';
    return ['paid', 'partially_paid'].includes(ps) &&
      ['not_started', 'vendor_order_needed', 'ordered_from_vendor', 'in_transit_to_me', 'ready_to_ship', 'awaiting_fulfillment'].includes(fs);
  }

  // ── Derived lists ────────────────────────────────────────────
  const awaitingPaymentOrders    = orders.filter(isAwaitingPayment);
  const awaitingFulfillmentOrders = orders.filter(isAwaitingFulfillment);

  // ── Tab switching: reset selection, auto-select first ────────
  const switchTab = (tab) => {
    setActiveTab(tab);
    setSelectedOrder(null);
    setPaymentNote('');
    setTrackingNum('');
    // Auto-select first item after state settles (next tick)
    if (tab === 'payment') {
      setTimeout(() => setSelectedOrder(awaitingPaymentOrders[0] || null), 0);
    } else if (tab === 'fulfillment') {
      setTimeout(() => setSelectedOrder(awaitingFulfillmentOrders[0] || null), 0);
    }
  };

  // ── Counts ───────────────────────────────────────────────────
  const newMsgCount        = messages.filter(m => m.status === 'new').length;
  const newQuoteCount      = quotes.filter(q => q.status === 'new').length;
  const awaitingPayCount   = awaitingPaymentOrders.length;
  const awaitingFulfCount  = awaitingFulfillmentOrders.length;

  // ── Shared selected-card style ───────────────────────────────
  const cardCls = (id, sel) =>
    `w-full text-left p-4 rounded-xl border transition-colors ${
      sel?.id === id ? 'bg-primary/5 border-primary/40 shadow-sm' : 'bg-white border-border hover:border-primary/20 hover:bg-muted/20'
    }`;

  return (
    <div className="min-h-screen bg-background">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-700 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />{toast}
        </div>
      )}

      {/* Header */}
      <div className="bg-primary text-primary-foreground py-8 px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          <Link to="/AdminDashboard" className="inline-flex items-center gap-1.5 text-xs text-primary-foreground/60 hover:text-primary-foreground mb-3 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />Back to Admin Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <Inbox className="w-7 h-7 text-accent" />
            <div>
              <h1 className="text-2xl font-extrabold">HC Apparel Inbox</h1>
              <p className="text-primary-foreground/70 text-sm">Messages, quotes, and order actions</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-8">

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard icon={<Mail className="w-5 h-5" />}          label="New Contact Messages" count={newMsgCount}       color="blue"   onClick={() => switchTab('messages')} />
          <SummaryCard icon={<MessageSquare className="w-5 h-5" />} label="New Quote Requests"   count={newQuoteCount}    color="purple" onClick={() => switchTab('quotes')} />
          <SummaryCard icon={<Clock className="w-5 h-5" />}         label="Awaiting Payment"     count={awaitingPayCount} color="orange" onClick={() => switchTab('payment')} />
          <SummaryCard icon={<Package className="w-5 h-5" />}       label="Awaiting Fulfillment" count={awaitingFulfCount} color="green" onClick={() => switchTab('fulfillment')} />
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-border">
          <TabBtn active={activeTab === 'messages'}    onClick={() => switchTab('messages')}    badge={newMsgCount}>
            <Mail className="w-4 h-4" />Contact Messages
          </TabBtn>
          <TabBtn active={activeTab === 'quotes'}      onClick={() => switchTab('quotes')}      badge={newQuoteCount}>
            <MessageSquare className="w-4 h-4" />Quote Requests
          </TabBtn>
          <TabBtn active={activeTab === 'payment'}     onClick={() => switchTab('payment')}     badge={awaitingPayCount}>
            <DollarSign className="w-4 h-4" />Awaiting Payment
          </TabBtn>
          <TabBtn active={activeTab === 'fulfillment'} onClick={() => switchTab('fulfillment')} badge={awaitingFulfCount}>
            <Truck className="w-4 h-4" />Awaiting Fulfillment
          </TabBtn>
        </div>

        {/* ── CONTACT MESSAGES TAB ─────────────────────────────── */}
        {activeTab === 'messages' && (
          <div className="grid lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2 space-y-2">
              {loadingMsgs ? <Spinner /> : messages.length === 0 ? (
                <Empty>No contact messages yet.</Empty>
              ) : messages.map(msg => (
                <button key={msg.id} onClick={() => setSelectedMsg(msg)} className={cardCls(msg.id, selectedMsg)}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm truncate">{msg.name}</p>
                    <Badge className={`text-xs shrink-0 ${MSG_STATUS_MAP[msg.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                      {MSG_STATUS_MAP[msg.status]?.label || msg.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{msg.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{msg.subject || '(no subject)'}</p>
                  <p className="text-xs text-muted-foreground mt-1">{fmt(msg.created_date)}</p>
                </button>
              ))}
            </div>
            <div className="lg:col-span-3">
              {selectedMsg ? (
                <div className="bg-white border border-border rounded-2xl p-6 shadow-sm space-y-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <h2 className="text-lg font-bold">{selectedMsg.name}</h2>
                      <a href={`mailto:${selectedMsg.email}`} className="text-sm text-primary hover:underline">{selectedMsg.email}</a>
                    </div>
                    <Badge className={MSG_STATUS_MAP[selectedMsg.status]?.color || 'bg-gray-100 text-gray-600'}>
                      {MSG_STATUS_MAP[selectedMsg.status]?.label || selectedMsg.status}
                    </Badge>
                  </div>
                  <Field label="Subject" value={selectedMsg.subject || '(no subject)'} />
                  <div>
                    <SectionLabel>Message</SectionLabel>
                    <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-xl p-4 leading-relaxed">{selectedMsg.message}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Submitted: {fmt(selectedMsg.created_date, true)}</p>
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    <Button size="sm" variant="outline" disabled={selectedMsg.status === 'reviewed'}
                      onClick={() => setMsgStatus(selectedMsg.id, 'reviewed')} className="gap-1.5">
                      <Eye className="w-4 h-4" />Mark Reviewed
                    </Button>
                    <Button size="sm" variant="outline" disabled={selectedMsg.status === 'replied'}
                      onClick={() => setMsgStatus(selectedMsg.id, 'replied')}
                      className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50">
                      <CheckCircle className="w-4 h-4" />Mark Replied
                    </Button>
                    <Button size="sm" variant="outline" disabled={selectedMsg.status === 'archived'}
                      onClick={() => setMsgStatus(selectedMsg.id, 'archived')}
                      className="gap-1.5 border-gray-300 text-gray-500 hover:bg-gray-50">
                      <Archive className="w-4 h-4" />Archive
                    </Button>
                    <a href={`mailto:${selectedMsg.email}?subject=Re: ${encodeURIComponent(selectedMsg.subject || '')}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/30 text-primary text-sm font-medium hover:bg-primary/5 transition-colors">
                      <Mail className="w-4 h-4" />Reply via Email
                    </a>
                  </div>
                </div>
              ) : <EmptyPanel icon={<Mail className="w-8 h-8 opacity-20" />}>Select a message to view details</EmptyPanel>}
            </div>
          </div>
        )}

        {/* ── QUOTE REQUESTS TAB ───────────────────────────────── */}
        {activeTab === 'quotes' && (
          <div className="grid lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2 space-y-2">
              {loadingQuotes ? <Spinner /> : quotes.length === 0 ? (
                <Empty>No quote requests yet.</Empty>
              ) : quotes.map(q => {
                const s = QUOTE_STATUS_MAP[q.status] || QUOTE_STATUS_MAP['new'];
                return (
                  <button key={q.id} onClick={() => setSelectedQ(q)} className={cardCls(q.id, selectedQ)}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-semibold text-sm truncate">{q.full_name}</p>
                      <Badge className={`text-xs shrink-0 ${s.color}`}>{s.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{q.email}</p>
                    {q.phone && <p className="text-xs text-muted-foreground">{q.phone}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{PRODUCT_LABELS[q.product_type] || q.product_type || '—'}</span>
                      {q.quantity && <span className="text-xs text-muted-foreground">· Qty: {q.quantity}</span>}
                    </div>
                    {q.date_needed && <p className="text-xs text-muted-foreground mt-0.5">Deadline: {q.date_needed}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">{fmt(q.created_date)}</p>
                  </button>
                );
              })}
            </div>
            <div className="lg:col-span-3">
              {selectedQ ? (
                <div className="bg-white border border-border rounded-2xl p-6 shadow-sm space-y-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <h2 className="text-lg font-bold">{selectedQ.full_name}</h2>
                      <a href={`mailto:${selectedQ.email}`} className="text-sm text-primary hover:underline">{selectedQ.email}</a>
                      {selectedQ.phone && <p className="text-sm text-muted-foreground">{selectedQ.phone}</p>}
                    </div>
                    <Badge className={(QUOTE_STATUS_MAP[selectedQ.status] || QUOTE_STATUS_MAP['new']).color}>
                      {(QUOTE_STATUS_MAP[selectedQ.status] || QUOTE_STATUS_MAP['new']).label}
                    </Badge>
                  </div>
                  <div>
                    <SectionLabel>Customer Info</SectionLabel>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Business / Brand" value={selectedQ.business_name} />
                      <Field label="Preferred Contact" value={CONTACT_LABELS[selectedQ.preferred_contact] || selectedQ.preferred_contact} />
                    </div>
                  </div>
                  <div>
                    <SectionLabel>Project Details</SectionLabel>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Project Type"             value={PRODUCT_LABELS[selectedQ.product_type] || selectedQ.product_type} />
                      <Field label="Garment Knowledge"        value={GARMENT_LABELS[selectedQ.garment_knowledge] || selectedQ.garment_knowledge} />
                      <Field label="Preferred Garment/Style"  value={selectedQ.preferred_garment_style} />
                      <Field label="Quantity"                 value={selectedQ.quantity} />
                      <Field label="Sizes Needed"             value={selectedQ.sizes_needed} />
                      <Field label="Garment Colors"           value={selectedQ.garment_colors} />
                      <Field label="Deadline"                 value={selectedQ.date_needed} />
                    </div>
                  </div>
                  <div>
                    <SectionLabel>Printing</SectionLabel>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Print Method"     value={PRINT_LABELS[selectedQ.print_method] || selectedQ.print_method} />
                      <Field label="Print Colors"     value={PRINT_COLOR_LABELS[selectedQ.print_colors] || selectedQ.print_colors} />
                      <Field label="Print Placements" value={Array.isArray(selectedQ.print_placement) ? selectedQ.print_placement.join(', ') : selectedQ.print_placement} />
                      <Field label="What to Print"    value={selectedQ.what_to_print} />
                      <Field label="Artwork Status"   value={ARTWORK_LABELS[selectedQ.artwork_status] || selectedQ.artwork_status} />
                      <Field label="Needs Design Help" value={selectedQ.needs_artwork_help ? 'Yes' : null} />
                    </div>
                    {selectedQ.artwork_link && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Artwork Link</p>
                        <a href={selectedQ.artwork_link} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline truncate block">{selectedQ.artwork_link}</a>
                      </div>
                    )}
                    {selectedQ.artwork_file_url && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Uploaded Artwork</p>
                        <a href={selectedQ.artwork_file_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-lg text-sm text-primary hover:bg-muted/70 transition-colors">
                          View File
                        </a>
                      </div>
                    )}
                  </div>
                  {selectedQ.project_notes && (
                    <div>
                      <SectionLabel>Project Notes</SectionLabel>
                      <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-xl p-3 leading-relaxed">{selectedQ.project_notes}</p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Submitted: {fmt(selectedQ.created_date, true)}</p>
                  <div className="pt-2 border-t border-border space-y-2">
                    <SectionLabel>Update Status</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { status: 'reviewing',           label: 'Mark Reviewing',      cls: 'border-yellow-300 text-yellow-700 hover:bg-yellow-50' },
                        { status: 'waiting_on_customer', label: 'Waiting on Customer', cls: 'border-orange-300 text-orange-700 hover:bg-orange-50' },
                        { status: 'quote_sent',          label: 'Quote Sent',          cls: 'border-purple-300 text-purple-700 hover:bg-purple-50' },
                        { status: 'approved',            label: 'Approved',            cls: 'border-green-300 text-green-700 hover:bg-green-50' },
                        { status: 'completed',           label: 'Completed',           cls: 'border-teal-300 text-teal-700 hover:bg-teal-50' },
                        { status: 'archived',            label: 'Archive',             cls: 'border-gray-300 text-gray-500 hover:bg-gray-50' },
                      ].map(({ status, label, cls }) => (
                        <Button key={status} size="sm" variant="outline"
                          disabled={selectedQ.status === status}
                          onClick={() => setQuoteStatus(selectedQ.id, status)}
                          className={`gap-1.5 ${cls}`}>
                          {label}
                        </Button>
                      ))}
                    </div>
                    <div className="pt-1 flex flex-wrap gap-2">
                      <Link to={`/AdminQuoteRequestDetail?id=${selectedQ.id}`}>
                        <Button size="sm" variant="default" className="gap-1.5">
                          <ChevronRight className="w-4 h-4" />Open Full Detail Page
                        </Button>
                      </Link>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
                        setTemplateVars({
                          customer_name: selectedQ.full_name || '',
                          customer_email: selectedQ.email || '',
                          project_type: PRODUCT_LABELS[selectedQ.product_type] || selectedQ.product_type || '—',
                          quantity: selectedQ.quantity ? String(selectedQ.quantity) : '—',
                          garment_style: selectedQ.preferred_garment_style || GARMENT_LABELS[selectedQ.garment_knowledge] || '—',
                          quote_total: '—',
                          quote_notes: selectedQ.project_notes || '—',
                        });
                        setActiveTemplate('quote_received');
                      }}>
                        <Mail className="w-4 h-4 text-blue-500" />Quote Received Msg
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
                        setTemplateVars({
                          customer_name: selectedQ.full_name || '',
                          customer_email: selectedQ.email || '',
                          project_type: PRODUCT_LABELS[selectedQ.product_type] || selectedQ.product_type || '—',
                          quantity: selectedQ.quantity ? String(selectedQ.quantity) : '—',
                          garment_style: selectedQ.preferred_garment_style || GARMENT_LABELS[selectedQ.garment_knowledge] || '—',
                          quote_total: selectedQ.customer_quote_price ? `$${Number(selectedQ.customer_quote_price).toFixed(2)}` : '—',
                          quote_notes: selectedQ.admin_notes || selectedQ.project_notes || '—',
                        });
                        setActiveTemplate('quote_sent');
                      }}>
                        <Mail className="w-4 h-4 text-purple-500" />Quote Follow-Up Msg
                      </Button>
                    </div>
                  </div>
                </div>
              ) : <EmptyPanel icon={<MessageSquare className="w-8 h-8 opacity-20" />}>Select a quote request to view details</EmptyPanel>}
            </div>
          </div>
        )}

        {/* ── AWAITING PAYMENT TAB ─────────────────────────────── */}
        {activeTab === 'payment' && (
          <div className="grid lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2 space-y-2">
              {loadingOrders ? <Spinner /> : awaitingPaymentOrders.length === 0 ? (
                <Empty>No orders awaiting payment.</Empty>
              ) : awaitingPaymentOrders.map(o => {
                const ps = PAY_STATUS_MAP[o.payment_status] || PAY_STATUS_MAP['awaiting_payment'];
                return (
                  <button key={o.id} onClick={() => { setSelectedOrder(o); setPaymentNote(''); }} className={cardCls(o.id, selectedOrder)}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-semibold text-sm">{orderNum(o)}</p>
                      <Badge className={`text-xs shrink-0 ${ps.color}`}>{ps.label}</Badge>
                    </div>
                    <p className="text-sm font-medium truncate">{o.customer_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{o.customer_email}</p>
                    <p className="text-xs text-muted-foreground mt-1">{fmt(o.created_date)}</p>
                    <p className="text-sm font-bold mt-1">{money(o.total_amount)}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{itemPreview(o)}</p>
                  </button>
                );
              })}
            </div>
            <div className="lg:col-span-3">
              {selectedOrder && activeTab === 'payment' && isAwaitingPayment(selectedOrder) ? (
                <OrderPaymentDetail
                  order={selectedOrder}
                  onMarkPaid={() => markOrderPaid(selectedOrder)}
                  paymentNote={paymentNote}
                  setPaymentNote={setPaymentNote}
                  onSaveNote={() => savePaymentNote(selectedOrder)}
                  savingNote={savingNote}
                />
              ) : <EmptyPanel icon={<DollarSign className="w-8 h-8 opacity-20" />}>
                {awaitingPaymentOrders.length === 0 ? 'All orders are paid — nothing awaiting payment.' : 'Select an order to view payment details'}
              </EmptyPanel>}
            </div>
          </div>
        )}

        {/* ── AWAITING FULFILLMENT TAB ─────────────────────────── */}
        {activeTab === 'fulfillment' && (
          <div className="grid lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2 space-y-2">
              {/* Filter chips */}
              <div className="flex flex-wrap gap-1.5 pb-1">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'vendor_order_needed', label: 'Awaiting' },
                  { key: 'ordered_from_vendor', label: 'Ordered' },
                  { key: 'ready_to_ship', label: 'Ready to Ship' },
                  { key: 'shipped', label: 'Shipped' },
                ].map(f => (
                  <button key={f.key} onClick={() => setFulfillFilter(f.key)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      fulfillFilter === f.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-white text-muted-foreground border-border hover:border-primary/40'
                    }`}>
                    {f.label}
                  </button>
                ))}
              </div>
              {loadingOrders ? <Spinner /> : awaitingFulfillmentOrders.length === 0 ? (
                <Empty>No orders awaiting fulfillment.</Empty>
              ) : awaitingFulfillmentOrders
                .filter(o => fulfillFilter === 'all' || (o.fulfillment_status || 'not_started') === fulfillFilter)
                .map(o => {
                const fs = FULFILL_STATUS_MAP[o.fulfillment_status || 'not_started'] || FULFILL_STATUS_MAP['not_started'];
                return (
                  <button key={o.id} onClick={() => { setSelectedOrder(o); setTrackingNum(''); }} className={cardCls(o.id, selectedOrder)}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-semibold text-sm">{orderNum(o)}</p>
                      <Badge className={`text-xs shrink-0 ${fs.color}`}>{fs.label}</Badge>
                    </div>
                    <p className="text-sm font-medium truncate">{o.customer_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{o.customer_email}</p>
                    <p className="text-xs text-muted-foreground mt-1">{fmt(o.created_date)}</p>
                    <p className="text-sm font-bold mt-1">{money(o.total_amount)}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{itemPreview(o)}</p>
                  </button>
                );
              })}
            </div>
            <div className="lg:col-span-3">
              {selectedOrder && activeTab === 'fulfillment' ? (
                <OrderFulfillDetail
                  order={selectedOrder}
                  onSetFulfillStatus={(status) => patchOrder(selectedOrder.id, { fulfillment_status: status })}
                  trackingNum={trackingNum}
                  setTrackingNum={setTrackingNum}
                  onSaveTracking={() => saveTracking(selectedOrder)}
                  onCreateDraft={() => createVendorOrderDraft(selectedOrder)}
                  creatingDraft={creatingDraft}
                  draftCreated={draftCreated?.orderId === selectedOrder.id ? draftCreated : null}
                />
              ) : <EmptyPanel icon={<Truck className="w-8 h-8 opacity-20" />}>Select an order to view fulfillment details</EmptyPanel>}
            </div>
          </div>
        )}

      </div>

      {activeTemplate && (
        <MessageTemplateModal
          templateKey={activeTemplate}
          vars={templateVars}
          onClose={() => setActiveTemplate(null)}
        />
      )}
    </div>
  );
}

// ── Order Payment Detail Panel ─────────────────────────────────
function OrderPaymentDetail({ order, onMarkPaid, paymentNote, setPaymentNote, onSaveNote, savingNote }) {
  const ps = PAY_STATUS_MAP[order.payment_status] || PAY_STATUS_MAP['awaiting_payment'];
  const fs = FULFILL_STATUS_MAP[order.fulfillment_status || 'not_started'] || FULFILL_STATUS_MAP['not_started'];
  const items = order.order_items || [];
  const isPaid = ['paid', 'partially_paid'].includes(order.payment_status);

  return (
    <div className="bg-white border border-border rounded-2xl p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Order {orderNum(order)}</h2>
          <p className="text-sm font-medium">{order.customer_name}</p>
          <a href={`mailto:${order.customer_email}`} className="text-sm text-primary hover:underline">{order.customer_email}</a>
          {order.customer_phone && <p className="text-sm text-muted-foreground">{order.customer_phone}</p>}
        </div>
        <div className="flex flex-col gap-1 items-end">
          <Badge className={ps.color}>{ps.label}</Badge>
          <Badge className={fs.color}>{fs.label}</Badge>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 bg-muted/30 rounded-xl p-4">
        <div>
          <p className="text-xs text-muted-foreground">Order Total</p>
          <p className="text-lg font-bold">{money(order.total_amount)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Amount Paid</p>
          <p className="text-lg font-bold text-green-700">{money(order.amount_paid || 0)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Balance Due</p>
          <p className="text-lg font-bold text-red-600">{money((order.total_amount || 0) - (order.amount_paid || 0))}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Submitted</p>
          <p className="text-sm font-medium">{fmt(order.created_date, true)}</p>
        </div>
      </div>

      {/* Line Items */}
      {items.length > 0 && (
        <div>
          <SectionLabel>Items</SectionLabel>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="flex gap-3 p-3 border border-border rounded-xl">
                {item.image_url && (
                  <img src={item.image_url} alt={item.product_name} className="w-14 h-14 rounded-lg object-cover shrink-0 bg-muted" />
                )}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="font-semibold text-sm">{item.product_name || item.name}</p>
                  {item.color && <p className="text-xs text-muted-foreground">Color: {item.color}</p>}
                  {item.size  && <p className="text-xs text-muted-foreground">Size: {item.size}</p>}
                  {item.sku   && <p className="text-xs text-muted-foreground font-mono">SKU: {item.sku}</p>}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">Qty: {item.quantity}</span>
                    <span className="text-xs text-muted-foreground">@ {money(item.price)}</span>
                    <span className="text-xs font-semibold">= {money((item.price || 0) * (item.quantity || 1))}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {order.payment_notes && (
        <div>
          <SectionLabel>Payment Notes</SectionLabel>
          <p className="text-sm bg-muted/30 rounded-xl p-3">{order.payment_notes}</p>
        </div>
      )}

      {/* Payment Note Input */}
      <div className="space-y-2">
        <SectionLabel>Add Payment Note</SectionLabel>
        <Textarea rows={2} placeholder="e.g. Payment received via Zelle on 6/26…"
          value={paymentNote} onChange={e => setPaymentNote(e.target.value)} className="resize-none text-sm" />
        <Button size="sm" variant="outline" onClick={onSaveNote} disabled={!paymentNote.trim() || savingNote}>
          {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Note'}
        </Button>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
        <Button size="sm" variant="default" disabled={isPaid} onClick={onMarkPaid}
          className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
          <CheckCircle className="w-4 h-4" />Mark Paid
        </Button>
        <Link to={`/AdminOrderDetail?id=${order.id}`}>
          <Button size="sm" variant="outline" className="gap-1.5">
            <ChevronRight className="w-4 h-4" />View Full Order
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ── Order Fulfillment Detail Panel ─────────────────────────────
function OrderFulfillDetail({ order, onSetFulfillStatus, trackingNum, setTrackingNum, onSaveTracking, onCreateDraft, creatingDraft, draftCreated }) {
  const fs = FULFILL_STATUS_MAP[order.fulfillment_status || 'not_started'] || FULFILL_STATUS_MAP['not_started'];
  const items = order.order_items || [];

  return (
    <div className="bg-white border border-border rounded-2xl p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Order {orderNum(order)}</h2>
          <p className="text-sm font-medium">{order.customer_name}</p>
          <a href={`mailto:${order.customer_email}`} className="text-sm text-primary hover:underline">{order.customer_email}</a>
          {order.customer_phone && <p className="text-sm text-muted-foreground">{order.customer_phone}</p>}
        </div>
        <Badge className={fs.color}>{fs.label}</Badge>
      </div>

      {/* Line Items */}
      {items.length > 0 && (
        <div>
          <SectionLabel>Items</SectionLabel>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="flex gap-3 p-3 border border-border rounded-xl">
                {item.image_url && (
                  <img src={item.image_url} alt={item.product_name} className="w-14 h-14 rounded-lg object-cover shrink-0 bg-muted" />
                )}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="font-semibold text-sm">{item.product_name || item.name}</p>
                  {item.color && <p className="text-xs text-muted-foreground">Color: {item.color}</p>}
                  {item.size  && <p className="text-xs text-muted-foreground">Size: {item.size}</p>}
                  {item.sku   && <p className="text-xs text-muted-foreground font-mono">SKU: {item.sku}</p>}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">Qty: {item.quantity}</span>
                    <span className="text-xs text-muted-foreground">@ {money(item.price)}</span>
                  </div>
                  {order.vendor_cost_estimate > 0 && i === 0 && (
                    <p className="text-xs text-muted-foreground">Vendor Cost Est: {money(order.vendor_cost_estimate)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {order.tracking_number && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-0.5">Tracking</p>
          <p className="text-sm font-mono text-teal-800">{order.tracking_number}</p>
        </div>
      )}

      {/* Add Tracking */}
      <div className="space-y-2">
        <SectionLabel>Add / Update Tracking Number</SectionLabel>
        <div className="flex gap-2">
          <Input placeholder="Tracking number…" value={trackingNum} onChange={e => setTrackingNum(e.target.value)} className="text-sm" />
          <Button size="sm" variant="outline" onClick={onSaveTracking} disabled={!trackingNum.trim()}>
            Save & Mark Shipped
          </Button>
        </div>
      </div>

      {/* Create Vendor Order Draft */}
      <div className="pt-2 border-t border-border space-y-3">
        <SectionLabel>Vendor Order Draft</SectionLabel>

        {draftCreated ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-green-800 font-semibold text-sm">
              <CheckCircle className="w-4 h-4 shrink-0" />
              Vendor Order Draft created. No vendor order has been placed.
            </div>
            <Link to={`/AdminVendorOrderDraftDetail?id=${draftCreated.draftId}`}>
              <Button size="sm" variant="outline" className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50">
                <ExternalLink className="w-3.5 h-3.5" />Open Vendor Order Draft
              </Button>
            </Link>
          </div>
        ) : (
          <Button size="sm" variant="default" onClick={onCreateDraft} disabled={creatingDraft}
            className="gap-1.5 bg-primary hover:bg-primary/90">
            {creatingDraft
              ? <><Loader2 className="w-4 h-4 animate-spin" />Creating Draft…</>
              : <><Package className="w-4 h-4" />Create Vendor Order Draft</>
            }
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Creates an internal draft only. Nothing is submitted to any vendor automatically.
        </p>
      </div>

      {/* Fulfillment Actions */}
      <div className="pt-2 border-t border-border space-y-2">
        <SectionLabel>Update Fulfillment Status</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {[
            { s: 'vendor_order_needed', label: 'Awaiting Fulfillment', cls: 'border-yellow-300 text-yellow-700 hover:bg-yellow-50' },
            { s: 'ordered_from_vendor', label: 'Ordered From Vendor',  cls: 'border-blue-300 text-blue-700 hover:bg-blue-50' },
            { s: 'in_transit_to_me',   label: 'In Transit to Me',     cls: 'border-purple-300 text-purple-700 hover:bg-purple-50' },
            { s: 'ready_to_ship',      label: 'Ready to Ship',        cls: 'border-teal-300 text-teal-700 hover:bg-teal-50' },
            { s: 'shipped',            label: 'Mark Shipped',         cls: 'border-indigo-300 text-indigo-700 hover:bg-indigo-50' },
            { s: 'delivered',          label: 'Mark Delivered',       cls: 'border-green-300 text-green-700 hover:bg-green-50' },
          ].map(({ s, label, cls }) => (
            <Button key={s} size="sm" variant="outline"
              disabled={order.fulfillment_status === s}
              onClick={() => onSetFulfillStatus(s)}
              className={cls}>
              {label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <Link to={`/AdminVendorOrders`}>
            <Button size="sm" variant="outline" className="gap-1.5">
              <Truck className="w-4 h-4" />View All Vendor Drafts
            </Button>
          </Link>
          <Link to={`/AdminOrderDetail?id=${order.id}`}>
            <Button size="sm" variant="outline" className="gap-1.5">
              <ChevronRight className="w-4 h-4" />View Full Order
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Reusable micro-components ──────────────────────────────────
function Spinner() {
  return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
}
function Empty({ children }) {
  return <div className="text-center py-10 text-muted-foreground text-sm">{children}</div>;
}
function EmptyPanel({ icon, children }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-sm bg-white border border-dashed border-border rounded-2xl gap-3">
      {icon}{children}
    </div>
  );
}

function SummaryCard({ icon, label, count, color, onClick }) {
  const colorMap = {
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    green:  'bg-green-50 border-green-200 text-green-700',
  };
  return (
    <button onClick={onClick}
      className={`rounded-2xl border p-4 flex items-center gap-3 w-full text-left hover:opacity-80 transition-opacity cursor-pointer ${colorMap[color]}`}>
      <div className="opacity-70">{icon}</div>
      <div>
        <p className="text-2xl font-extrabold">{count}</p>
        <p className="text-xs font-medium opacity-80 leading-tight">{label}</p>
      </div>
    </button>
  );
}

function TabBtn({ active, onClick, children, badge }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
        active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}>
      {children}
      {badge > 0 && (
        <span className="bg-blue-100 text-blue-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{badge}</span>
      )}
    </button>
  );
}