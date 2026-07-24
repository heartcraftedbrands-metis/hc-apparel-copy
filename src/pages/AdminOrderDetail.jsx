import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft, Save, DollarSign, Package, Truck, FileImage,
  ExternalLink, Link2, CheckCircle2, StickyNote, Upload,
  User, MapPin, Printer, Eye, AlertCircle, Loader2, ClipboardList, Plus, Calendar, BarChart3, Mail
} from 'lucide-react';
import MessageTemplateModal from '@/components/messages/MessageTemplateModal';
import { format } from 'date-fns';
import { toast } from 'sonner';
import MarginBadge from '@/components/profit/MarginBadge';
import CreateVendorOrderModal from '@/components/orders/CreateVendorOrderModal';
import OrderHistorySection from '@/components/orders/OrderHistorySection';
import CustomerNotificationsSection from '@/components/orders/CustomerNotificationsSection';
import ProductionPacket from '@/components/orders/ProductionPacket';
import ProductionWorkflowPanel from '@/components/orders/ProductionWorkflowPanel';
import SSVendorOrderTimeline from '@/components/orders/SSVendorOrderTimeline';
import { ssVendorOrderStageLabel } from '@/lib/ssVendorOrderWorkflow';

const ORDER_STATUSES = [
  { value: 'awaiting_payment', label: 'Awaiting Payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'awaiting_fulfillment', label: 'Awaiting Fulfillment' },
  { value: 'in_production', label: 'In Production' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'completed', label: 'Completed' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'refunded', label: 'Refunded' },
];

const PAYMENT_STATUSES = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'awaiting_payment', label: 'Awaiting Payment' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'pay_later', label: 'Pay Later' },
  { value: 'demo', label: 'Demo' },
];

const FULFILLMENT_STATUSES = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'vendor_order_needed', label: 'Vendor Order Needed' },
  { value: 'ordered_from_vendor', label: 'Ordered From Vendor' },
  { value: 'in_transit_to_me', label: 'In Transit to Me' },
  { value: 'ready_to_ship', label: 'Ready to Ship' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'issue_hold', label: 'Issue / Hold' },
  { value: 'completed', label: 'Completed' },
];

const STATUS_COLORS = {
  awaiting_payment: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  awaiting_fulfillment: 'bg-yellow-100 text-yellow-800',
  in_production: 'bg-orange-100 text-orange-800',
  shipped: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-200 text-green-900',
  canceled: 'bg-red-100 text-red-800',
  refunded: 'bg-gray-100 text-gray-600',
  // legacy
  new: 'bg-blue-100 text-blue-800',
};

const PAYMENT_COLORS = {
  unpaid: 'bg-red-100 text-red-700',
  partially_paid: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-green-100 text-green-800',
  refunded: 'bg-gray-100 text-gray-600',
  awaiting_payment: 'bg-blue-100 text-blue-700',
  pay_later: 'bg-cyan-100 text-cyan-700',
  demo: 'bg-purple-100 text-purple-700',
};

const FULFILLMENT_COLORS = {
  not_started: 'bg-gray-100 text-gray-600',
  vendor_order_needed: 'bg-yellow-100 text-yellow-800',
  ordered_from_vendor: 'bg-blue-100 text-blue-700',
  in_transit_to_me: 'bg-purple-100 text-purple-700',
  ready_to_ship: 'bg-teal-100 text-teal-700',
  shipped: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-green-100 text-green-800',
  issue_hold: 'bg-red-100 text-red-800',
  completed: 'bg-green-200 text-green-900',
};

function Section({ title, icon, children, adminOnly, className = '' }) {
  return (
    <div className={`rounded-2xl p-5 border ${adminOnly ? 'border-primary/20 bg-primary/[0.03]' : 'border-border bg-white'} ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className={adminOnly ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
        <p className="text-sm font-bold">{title}</p>
        {adminOnly && (
          <span className="ml-auto text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full shrink-0">Admin Only</span>
        )}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, mono }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-sm font-medium leading-snug ${mono ? 'font-mono' : ''}`}>{String(value)}</p>
    </div>
  );
}

export default function AdminOrderDetail() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('order_id');

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [shipNoTracking, setShipNoTracking] = useState(false);
  const [savingShipment, setSavingShipment] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState(null);

  const handleRepairGarmentItems = async () => {
    if (!form?.order_items?.length) return;
    setRepairing(true);
    try {
      // Load all products referenced by order items
      const productIds = [...new Set(form.order_items.map(i => i.product_id).filter(Boolean))];
      const products = await Promise.all(
        productIds.map(id => base44.entities.Product.get(id).catch(() => null))
      );
      const productMap = Object.fromEntries(products.filter(Boolean).map(p => [p.id, p]));

      // Also load GarmentCatalog for SKU + image fallback
      const garmentRows = await base44.entities.GarmentCatalog.list('-created_date', 2000);

      const updatedItems = form.order_items.map(item => {
        const product = productMap[item.product_id];
        if (!product) return item;

        let sku = item.sku;
        let imageUrl = item.image_url;

        // Try to find SKU and image from product variants
        if (product.available_colors && !sku) {
          // look for matching variant via garment catalog
          const garmentMatch = garmentRows.find(g => {
            const colorMatch = g.color?.toLowerCase() === item.color?.toLowerCase();
            const sizeMatch = g.size?.toLowerCase() === item.size?.toLowerCase();
            const nameMatch = g.product_name && product.name && g.product_name.toLowerCase().includes(product.name.split(' ')[0]?.toLowerCase());
            return colorMatch && sizeMatch && nameMatch;
          });
          if (garmentMatch) {
            sku = sku || garmentMatch.sku;
            imageUrl = imageUrl || garmentMatch.image_url;
          }
        }

        // Also try matching directly on product supplier_sku if no garment match
        if (!sku && product.supplier_sku) sku = product.supplier_sku;

        // Try product main image if still no image
        if (!imageUrl && product.image_url) imageUrl = product.image_url;

        return { ...item, sku: sku || item.sku, image_url: imageUrl || item.image_url };
      });

      await base44.entities.Order.update(form.id, { order_items: updatedItems });
      setForm(p => ({ ...p, order_items: updatedItems }));
      toast.success('Garment item data repaired successfully');
    } catch (err) {
      toast.error('Repair failed: ' + err.message);
    } finally {
      setRepairing(false);
    }
  };

  const { data: order, isLoading, refetch: refetchOrder } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => base44.entities.Order.filter({ id: orderId }).then(r => r[0]),
    enabled: !!orderId,
  });

  const { data: quoteRequest } = useQuery({
    queryKey: ['quote-request-for-order', form?.quote_request_id],
    queryFn: () => base44.entities.QuoteRequest.filter({ id: form.quote_request_id }).then(r => r[0]),
    enabled: !!form?.quote_request_id,
  });

  // Fetch ALL vendor orders linked to this customer order
  const { data: linkedVendorOrders = [] } = useQuery({
    queryKey: ['vendor-orders-for-order', orderId],
    queryFn: () => base44.entities.VendorOrder.filter({ customer_order_id: orderId }),
    enabled: !!orderId,
  });

  // Fetch linked vendor order DRAFTS
  const { data: linkedVendorDrafts = [] } = useQuery({
    queryKey: ['vendor-drafts-for-order', orderId],
    queryFn: () => base44.entities.VendorOrderDraft.filter({ customer_order_id: orderId }),
    enabled: !!orderId,
  });

  // Fetch Product data for order items (to get vendor_source, blank_garment_cost, supplier_sku, etc.)
  const { data: orderItemProducts = [] } = useQuery({
    queryKey: ['order-item-products', form?.order_items],
    queryFn: async () => {
      if (!form?.order_items?.length) return [];
      const productIds = [...new Set(form.order_items.map(i => i.product_id).filter(Boolean))];
      if (!productIds.length) return [];
      const products = await Promise.all(
        productIds.map(id => base44.entities.Product.get(id).catch(() => null))
      );
      return products.filter(Boolean);
    },
    enabled: !!form?.order_items?.length,
  });

  useEffect(() => {
    if (order && !form) setForm({ ...order });
  }, [order]);

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e?.target ? e.target.value : e }));

  const handleMarkShipped = async () => {
    if (!form.tracking_number?.trim() && !shipNoTracking) {
      toast.error('Enter a tracking number or confirm you are shipping without tracking.');
      return;
    }
    setSavingShipment(true);
    const update = {
      fulfillment_status: 'shipped',
      status: 'shipped',
      shipped_date: form.shipped_date || new Date().toISOString().split('T')[0],
    };
    await base44.entities.Order.update(form.id, update);
    setForm(p => ({ ...p, ...update }));
    qc.invalidateQueries({ queryKey: ['admin-orders'] });
    toast.success('Order marked as Shipped');
    setSavingShipment(false);
  };

  const handleMarkDelivered = async () => {
    const update = { fulfillment_status: 'delivered', status: 'completed' };
    await base44.entities.Order.update(form.id, update);
    setForm(p => ({ ...p, ...update }));
    qc.invalidateQueries({ queryKey: ['admin-orders'] });
    toast.success('Order marked as Delivered');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await base44.entities.Order.update(form.id, form);
      setForm(updated);
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      toast.success('Order saved');
    } catch (err) {
      toast.error('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async () => {
    const update = { status: 'paid', payment_status: 'paid', amount_paid: form.total_amount };
    await base44.entities.Order.update(form.id, update);
    setForm(p => ({ ...p, ...update }));
    qc.invalidateQueries({ queryKey: ['admin-orders'] });
    toast.success('Marked as Paid');
  };

  const handleMarkAwaiting = async () => {
    const update = { status: 'awaiting_fulfillment', fulfillment_status: 'vendor_order_needed' };
    await base44.entities.Order.update(form.id, update);
    setForm(p => ({ ...p, ...update }));
    qc.invalidateQueries({ queryKey: ['admin-orders'] });
    toast.success('Marked as Awaiting Fulfillment');
  };

  const handlePaymentStatusChange = async (newStatus) => {
    let update = { payment_status: newStatus };
    if (newStatus === 'paid') {
      update.amount_paid = form.total_amount;
      update.payment_date = new Date().toISOString().split('T')[0];
    }
    try {
      await base44.entities.Order.update(form.id, update);
      setForm(p => ({ ...p, ...update }));
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      toast.success(`Payment status changed to ${newStatus.replace(/_/g, ' ')}`);
    } catch (err) {
      toast.error('Update failed: ' + err.message);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    const timestamp = format(new Date(), 'MMM d, yyyy h:mm a');
    const existing = form.internal_notes || '';
    const newNotes = existing
      ? `${existing}\n\n[${timestamp}]\n${noteText.trim()}`
      : `[${timestamp}]\n${noteText.trim()}`;
    await base44.entities.Order.update(form.id, { internal_notes: newNotes });
    setForm(p => ({ ...p, internal_notes: newNotes }));
    setNoteText('');
    setShowNoteInput(false);
    toast.success('Note added');
  };

  const handleUploadProductionFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.Order.update(form.id, { production_file_url: file_url });
      setForm(p => ({ ...p, production_file_url: file_url }));
      toast.success('Production file uploaded');
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploadingFile(false);
    }
  };

  if (!orderId) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">No order selected.</p>
    </div>
  );

  if (isLoading || !form) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  const revenue = Number(form.total_amount) || 0;
  const amountPaid = Number(form.amount_paid) || 0;
  const balanceDue = revenue - amountPaid;
  const vendorCost = Number(form.vendor_cost_estimate) || 0;
  const profit = revenue - vendorCost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  const primaryVendorOrder = linkedVendorOrders[0] || null;

  const orderNum = form ? `#${form.id.slice(-8).toUpperCase()}` : '';
  const orderTotal = form ? `$${Number(form.total_amount || 0).toFixed(2)}` : '';
  const templateVars = {
    customer_name: form?.customer_name || '',
    customer_email: form?.customer_email || '',
    order_number: orderNum,
    order_total: orderTotal,
    shipping_carrier: form?.tracking_carrier || '—',
    tracking_number: form?.tracking_number || '—',
    tracking_url: form?.tracking_url || '—',
  };

  // Map vendor order status → fulfillment status label override
  const VENDOR_STATUS_TO_FULFILLMENT = {
    draft: 'Vendor Order Created',
    sent_to_vendor: 'Sent to Vendor',
    accepted: 'Sent to Vendor',
    in_production: 'In Production',
    shipped: 'Shipped',
    delivered: 'Delivered',
  };
  const vendorDerivedFulfillment = primaryVendorOrder
    ? VENDOR_STATUS_TO_FULFILLMENT[primaryVendorOrder.status] || null
    : null;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sticky header */}
      <div className="bg-primary text-primary-foreground sticky top-0 z-30 shadow-md">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-start gap-4 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => navigate('/AdminDashboard')}
              className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 gap-1.5 -ml-2 shrink-0">
              <ArrowLeft className="w-4 h-4" />Admin Dashboard
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/AdminOrders')}
              className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 gap-1.5 shrink-0">
              <ArrowLeft className="w-4 h-4" />Orders
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-extrabold">Order #{form.id.slice(-8).toUpperCase()}</h1>
                <Badge className={`text-xs ${STATUS_COLORS[form.status] || 'bg-gray-100 text-gray-600'}`}>
                  {ORDER_STATUSES.find(s => s.value === form.status)?.label || form.status?.replace(/_/g, ' ')}
                </Badge>
                {form.payment_status && (
                  <Badge className={`text-xs ${PAYMENT_COLORS[form.payment_status] || ''}`}>
                    {PAYMENT_STATUSES.find(s => s.value === form.payment_status)?.label || form.payment_status}
                  </Badge>
                )}
                {vendorDerivedFulfillment ? (
                  <Badge className="text-xs bg-blue-100 text-blue-800">{vendorDerivedFulfillment}</Badge>
                ) : form.fulfillment_status && form.fulfillment_status !== 'not_started' ? (
                  <Badge className={`text-xs ${FULFILLMENT_COLORS[form.fulfillment_status] || ''}`}>
                    {FULFILLMENT_STATUSES.find(s => s.value === form.fulfillment_status)?.label || form.fulfillment_status}
                  </Badge>
                ) : null}
              </div>
              <p className="text-primary-foreground/70 text-sm mt-0.5">
                {form.customer_name} · {form.customer_email}
                {form.created_date ? ` · ${format(new Date(form.created_date), 'MMM d, yyyy')}` : ''}
              </p>
            </div>
            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 ml-auto items-center">
              <Button size="sm" variant="ghost"
                className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 gap-1.5"
                onClick={() => setShowNoteInput(v => !v)}>
                <StickyNote className="w-4 h-4" />Note
              </Button>
              <label className={`flex items-center gap-1.5 cursor-pointer text-xs font-medium px-3 py-1.5 rounded-md bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground transition-colors ${uploadingFile ? 'opacity-60 pointer-events-none' : ''}`}>
                {uploadingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {uploadingFile ? 'Uploading…' : 'Upload File'}
                <input type="file" className="hidden" onChange={handleUploadProductionFile} />
              </label>
              <Button size="sm"
                className="bg-yellow-500 hover:bg-yellow-600 text-white gap-1.5"
                onClick={handleMarkAwaiting}>
                <Package className="w-4 h-4" />Awaiting Fulfillment
              </Button>
              <Button size="sm"
                className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                onClick={handleMarkPaid}>
                <DollarSign className="w-4 h-4" />Mark Paid
              </Button>
              <Button size="sm" variant="outline"
                className="gap-1.5"
                onClick={() => window.open(`/TrackOrder?order=${form.id.slice(-8).toUpperCase()}&email=${encodeURIComponent(form.customer_email)}`, '_blank')}>
                <Eye className="w-4 h-4" />Open Customer Tracking View
              </Button>
              <Button size="sm"
                className="bg-accent text-accent-foreground hover:bg-accent/90 gap-1.5"
                onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </Button>
            </div>
          </div>

          {/* Linked refs */}
          <div className="flex flex-wrap gap-2 mt-2">
            {form.quote_request_id && (
              <a href={`/AdminQuoteRequestDetail?id=${form.quote_request_id}`}
                className="flex items-center gap-1.5 bg-primary-foreground/10 hover:bg-primary-foreground/20 border border-primary-foreground/20 rounded-lg px-3 py-1 text-xs text-primary-foreground transition-colors">
                <Link2 className="w-3 h-3" />View Linked Quote Request →
              </a>
            )}
            {linkedVendorOrders.length > 0 && (
              <a href={`/AdminVendorOrders?vendor_order_id=${linkedVendorOrders[0].id}`}
                className="flex items-center gap-1.5 bg-green-900/30 hover:bg-green-900/40 border border-green-400/30 rounded-lg px-3 py-1 text-xs text-green-200 transition-colors">
                <Truck className="w-3 h-3" />View Vendor Order #{linkedVendorOrders[0].id.slice(-6).toUpperCase()} →
              </a>
            )}
            <Button size="sm"
              className="bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground gap-1.5 h-7 text-xs"
              onClick={() => setShowVendorModal(true)}>
              <Plus className="w-3.5 h-3.5" />{linkedVendorOrders.length > 0 ? 'Create Another Vendor Order' : 'Create Vendor Order'}
            </Button>
          </div>
        </div>
      </div>

      {/* Internal note input */}
      {showNoteInput && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
          <div className="container mx-auto flex gap-3 items-start">
            <Textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Add an internal note…"
              rows={2}
              className="flex-1 text-sm bg-white"
            />
            <div className="flex flex-col gap-2">
              <Button size="sm" onClick={handleAddNote} className="bg-amber-600 hover:bg-amber-700 text-white">Add Note</Button>
              <Button size="sm" variant="outline" onClick={() => setShowNoteInput(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-6">

          {/* ── Left column (2/3) ── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Customer Information */}
            <Section title="Customer Information" icon={<User className="w-4 h-4" />}>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Full Name</Label>
                  <Input value={form.customer_name || ''} onChange={set('customer_name')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input value={form.customer_email || ''} onChange={set('customer_email')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Phone Number</Label>
                  <Input value={form.customer_phone || ''} onChange={set('customer_phone')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Business / Brand Name</Label>
                  <Input value={form.business_name || ''} onChange={set('business_name')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Preferred Contact</Label>
                  <Select value={form.preferred_contact || 'email'} onValueChange={set('preferred_contact')}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="phone">Phone</SelectItem>
                      <SelectItem value="text">Text</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Section>

            {/* Shipping Address */}
            <Section title="Shipping Address" icon={<MapPin className="w-4 h-4" />}>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Street Address</Label>
                  <Input value={form.shipping_address?.street || ''} onChange={e => setForm(p => ({ ...p, shipping_address: { ...p.shipping_address, street: e.target.value } }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">City</Label>
                  <Input value={form.shipping_address?.city || ''} onChange={e => setForm(p => ({ ...p, shipping_address: { ...p.shipping_address, city: e.target.value } }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">State</Label>
                  <Input value={form.shipping_address?.state || ''} onChange={e => setForm(p => ({ ...p, shipping_address: { ...p.shipping_address, state: e.target.value } }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">ZIP Code</Label>
                  <Input value={form.shipping_address?.zip || ''} onChange={e => setForm(p => ({ ...p, shipping_address: { ...p.shipping_address, zip: e.target.value } }))} className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Delivery Notes</Label>
                  <Textarea value={form.delivery_notes || ''} onChange={set('delivery_notes')} rows={2} className="mt-1 text-sm" />
                </div>
              </div>
            </Section>

            {/* Order Items (from cart/checkout) */}
            {form.order_items && form.order_items.length > 0 && (
              <Section title="Order Items" icon={<Package className="w-4 h-4" />}>
                {/* Repair button */}
                <div className="mb-4 flex items-center justify-between gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="text-xs text-amber-800">
                    <strong>Garment fulfillment data:</strong> Click repair to sync SKU and images from your Garment Catalog.
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100"
                    onClick={handleRepairGarmentItems}
                    disabled={repairing}
                  >
                    {repairing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                    Repair Garment Order Item Data
                  </Button>
                </div>

                <div className="space-y-4">
                  {form.order_items.map((item, idx) => (
                    <div key={idx} className="border rounded-lg p-4 bg-gray-50">
                      <div className="grid md:grid-cols-4 gap-4">
                        {/* Product Image — always render, show placeholder if missing */}
                        <div className="md:col-span-1">
                          {item.image_url || item.file_url ? (
                            <img
                              src={item.image_url || item.file_url}
                              alt={item.product_name}
                              className="w-full h-32 object-cover rounded-lg bg-white border"
                              onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                            />
                          ) : null}
                          <div
                            className="bg-white border rounded-lg h-32 flex-col items-center justify-center gap-1"
                            style={{ display: (item.image_url || item.file_url) ? 'none' : 'flex' }}
                          >
                            <Package className="w-6 h-6 text-muted-foreground/40" />
                            <p className="text-xs text-muted-foreground text-center">No image</p>
                            <p className="text-xs text-amber-600 text-center px-1">Run Repair →</p>
                          </div>
                        </div>

                        {/* Item Details */}
                        <div className="md:col-span-3 space-y-3">
                          <div>
                            <p className="font-semibold text-sm">{item.product_name}</p>
                            {item.product_type && <p className="text-xs text-muted-foreground capitalize">{item.product_type.replace(/_/g, ' ')}</p>}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            {item.color && (
                              <div>
                                <p className="text-xs text-muted-foreground">Color</p>
                                <p className="font-medium">{item.color}</p>
                              </div>
                            )}
                            {item.size && (
                              <div>
                                <p className="text-xs text-muted-foreground">Size</p>
                                <p className="font-medium">{item.size}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-xs text-muted-foreground">Quantity</p>
                              <p className="font-medium">{item.quantity}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Unit Price</p>
                              <p className="font-medium">${Number(item.price || 0).toFixed(2)}</p>
                            </div>
                          </div>

                          {/* SKU — prominent display */}
                          {item.sku ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">SKU:</span>
                              <span className="font-mono text-sm font-bold bg-slate-100 border border-slate-200 rounded px-2 py-0.5">{item.sku}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                              SKU missing — vendor fulfillment may fail.
                            </div>
                          )}

                          {/* Image warning */}
                          {!item.image_url && !item.file_url && (
                            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
                              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                              Image missing — check variant image mapping.
                            </div>
                          )}

                          <div className="flex justify-between items-center pt-2 border-t">
                            <p className="text-xs text-muted-foreground">Line Total</p>
                            <p className="font-bold text-sm">${(Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2)}</p>
                          </div>

                          {item.print_method && (
                            <div className="text-xs">
                              <p className="text-muted-foreground">Print Method: <span className="font-medium">{item.print_method}</span></p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Order Details */}
            <Section title="Order Details" icon={<Printer className="w-4 h-4" />}>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Product / Garment Type</Label>
                  <Input value={form.garment_type || ''} onChange={set('garment_type')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Quantity</Label>
                  <Input type="number" value={form.quantity || ''} onChange={set('quantity')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Sizes Needed</Label>
                  <Input value={form.sizes_needed || ''} onChange={set('sizes_needed')} placeholder="e.g. S(2), M(5), L(3)" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Garment Colors</Label>
                  <Input value={form.garment_colors || ''} onChange={set('garment_colors')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Print Method</Label>
                  <Input value={form.print_method || ''} onChange={set('print_method')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Print Placement</Label>
                  <Input value={Array.isArray(form.print_placement) ? form.print_placement.join(', ') : (form.print_placement || '')} onChange={e => setForm(p => ({ ...p, print_placement: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} placeholder="Front, Back, Left Sleeve…" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground"># of Print Locations</Label>
                  <Input type="number" value={form.num_print_locations || 1} onChange={set('num_print_locations')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Date Needed By</Label>
                  <Input type="date" value={form.date_needed || ''} onChange={set('date_needed')} className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">What to Print</Label>
                  <Textarea value={form.what_to_print || ''} onChange={set('what_to_print')} rows={2} className="mt-1 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Project Notes</Label>
                  <Textarea value={form.project_notes || ''} onChange={set('project_notes')} rows={2} className="mt-1 text-sm" />
                </div>
                <div className="sm:col-span-2 flex items-center gap-3 mt-1">
                  <input type="checkbox" id="needs_artwork"
                    checked={!!form.needs_artwork_help}
                    onChange={e => setForm(p => ({ ...p, needs_artwork_help: e.target.checked }))}
                    className="w-4 h-4 rounded border-input" />
                  <Label htmlFor="needs_artwork" className="text-sm cursor-pointer">Customer needs artwork help</Label>
                </div>
              </div>

              {/* Artwork & Files */}
              <div className="border-t mt-4 pt-4 grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Artwork File URL</Label>
                  <Input value={form.artwork_file_url || ''} onChange={set('artwork_file_url')} className="mt-1" />
                  {form.artwork_file_url && (
                    <a href={form.artwork_file_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                      <FileImage className="w-3 h-3" />View Artwork
                    </a>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Mockup File URL</Label>
                  <Input value={form.mockup_file_url || ''} onChange={set('mockup_file_url')} className="mt-1" />
                  {form.mockup_file_url && (
                    <a href={form.mockup_file_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                      <FileImage className="w-3 h-3" />View Mockup
                    </a>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Artwork / Drive Link</Label>
                  <Input value={form.artwork_link || ''} onChange={set('artwork_link')} placeholder="Google Drive, Dropbox…" className="mt-1" />
                  {form.artwork_link && (
                    <a href={form.artwork_link} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                      <ExternalLink className="w-3 h-3" />Open Link
                    </a>
                  )}
                </div>
                {form.production_file_url && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Production File</Label>
                    <a href={form.production_file_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline mt-1">
                      <FileImage className="w-4 h-4" />View Production File
                    </a>
                  </div>
                )}
              </div>
            </Section>

            {/* Customer Shipment */}
            <Section title="Customer Shipment" icon={<Truck className="w-4 h-4" />} adminOnly>
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Shipping Carrier</Label>
                    <Input value={form.tracking_carrier || ''} onChange={set('tracking_carrier')} placeholder="UPS, FedEx, USPS…" className="mt-1 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Tracking Number</Label>
                    <Input value={form.tracking_number || ''} onChange={set('tracking_number')} placeholder="e.g. 1Z999AA1…" className="mt-1 text-sm font-mono" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs text-muted-foreground">Tracking URL</Label>
                    <Input value={form.tracking_url || ''} onChange={set('tracking_url')} placeholder="https://…" className="mt-1 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Shipped Date</Label>
                    <Input type="date" value={form.shipped_date || ''} onChange={set('shipped_date')} className="mt-1 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Delivery Estimate</Label>
                    <Input value={form.delivery_estimate || ''} onChange={set('delivery_estimate')} placeholder="e.g. June 30, 2026" className="mt-1 text-sm" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs text-muted-foreground">Fulfillment Notes</Label>
                    <Textarea value={form.fulfillment_notes || ''} onChange={set('fulfillment_notes')} rows={2} placeholder="Notes about shipment to customer…" className="mt-1 text-sm" />
                  </div>
                </div>

                {/* No-tracking confirmation */}
                {!form.tracking_number && (
                  <div className="flex items-center gap-2 text-sm">
                    <input type="checkbox" id="ship_no_tracking" checked={shipNoTracking}
                      onChange={e => setShipNoTracking(e.target.checked)} className="w-4 h-4 rounded" />
                    <label htmlFor="ship_no_tracking" className="text-muted-foreground cursor-pointer">
                      I am marking this order shipped without tracking.
                    </label>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={handleSave} className="gap-1.5">
                    Save Customer Tracking
                  </Button>
                  <Button size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                    onClick={handleMarkShipped} disabled={savingShipment}>
                    <Truck className="w-4 h-4" />Mark Shipped
                  </Button>
                  <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleMarkDelivered}>
                    <CheckCircle2 className="w-4 h-4" />Mark Delivered
                  </Button>
                </div>

                {/* Vendor draft tracking info */}
                {linkedVendorDrafts.length > 0 && linkedVendorDrafts[0].tracking_number && (
                  <div className="bg-muted/30 border border-border rounded-xl p-3 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vendor Tracking (from vendor to me)</p>
                    <p className="text-xs font-mono">{linkedVendorDrafts[0].tracking_number}</p>
                    {linkedVendorDrafts[0].tracking_carrier && <p className="text-xs text-muted-foreground">Carrier: {linkedVendorDrafts[0].tracking_carrier}</p>}
                    {linkedVendorDrafts[0].tracking_url && (
                      <a href={linkedVendorDrafts[0].tracking_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Track Vendor Shipment →</a>
                    )}
                    <a href={`/AdminVendorOrderDraft?id=${linkedVendorDrafts[0].id}`} className="block text-xs text-primary hover:underline mt-1">
                      View Vendor Draft: {linkedVendorDrafts[0].vendor_order_number} →
                    </a>
                  </div>
                )}
              </div>
            </Section>

            <ProductionWorkflowPanel
              order={form}
              vendorDraft={linkedVendorDrafts[0] || null}
              vendorOrder={linkedVendorOrders[0] || null}
              onUpdated={async () => {
                const result = await refetchOrder();
                if (result.data) setForm(result.data);
                qc.invalidateQueries({ queryKey: ['vendor-drafts-for-order', orderId] });
                qc.invalidateQueries({ queryKey: ['vendor-orders-for-order', orderId] });
                qc.invalidateQueries({ queryKey: ['customer-notifications', orderId] });
              }}
            />

            <ProductionPacket
              order={form}
              vendorDraft={linkedVendorDrafts[0] || null}
              vendorOrder={linkedVendorOrders[0] || null}
            />

            {/* Order History (admin only) */}
            <OrderHistorySection orderId={form.id} orderNumber={form.id.slice(-8).toUpperCase()} />

            {/* Customer Notifications (admin only) */}
            <CustomerNotificationsSection orderId={form.id} order={form} />

            {/* Internal Notes (admin only) */}
            <Section title="Internal Notes" icon={<StickyNote className="w-4 h-4" />} adminOnly>
              {form.internal_notes ? (
                <pre className="text-sm text-foreground whitespace-pre-wrap font-sans bg-muted/30 rounded-xl p-3">
                  {form.internal_notes}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">No internal notes yet. Use the "Note" button to add one.</p>
              )}
            </Section>
          </div>

          {/* ── Right column (1/3) ── */}
          <div className="space-y-6">

            {/* Status Controls */}
            <Section title="Order Status" icon={<ClipboardList className="w-4 h-4" />} adminOnly>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Order Status</Label>
                  <Select value={form.status || 'awaiting_payment'} onValueChange={set('status')}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ORDER_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Payment Status</Label>
                  <Select value={form.payment_status || 'unpaid'} onValueChange={set('payment_status')}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Fulfillment Status</Label>
                  <Select value={form.fulfillment_status || 'not_started'} onValueChange={set('fulfillment_status')}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FULFILLMENT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Section>

            {/* Payment Management (admin only) */}
             <Section title="Payment" icon={<DollarSign className="w-4 h-4" />} adminOnly>
               {form.stripe_session_id && (
                 <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                   <p className="text-xs font-semibold text-green-800 mb-2">Stripe Payment</p>
                   <div className="space-y-1 text-xs text-green-700">
                     {form.stripe_session_id && (
                       <div className="font-mono break-all">Session: {form.stripe_session_id.substring(0, 20)}...</div>
                     )}
                     {form.stripe_payment_intent_id && (
                       <div className="font-mono break-all">Intent: {form.stripe_payment_intent_id.substring(0, 20)}...</div>
                     )}
                   </div>
                 </div>
               )}
               <div className="space-y-3 mb-4">
                 <div>
                   <Label className="text-xs text-muted-foreground">Payment Status</Label>
                   <Select value={form.payment_status || 'unpaid'} onValueChange={handlePaymentStatusChange}>
                     <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                     <SelectContent>
                       {PAYMENT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                     </SelectContent>
                   </Select>
                 </div>
                 <div>
                   <Label className="text-xs text-muted-foreground">Payment Method</Label>
                   <Input value={form.payment_method || ''} onChange={set('payment_method')} placeholder="e.g., bank transfer, credit card, Stripe" className="mt-1" />
                 </div>
                 <div>
                   <Label className="text-xs text-muted-foreground">Payment Date</Label>
                   <Input type="date" value={form.payment_date || ''} onChange={set('payment_date')} className="mt-1" />
                 </div>
               </div>

              {/* Quick payment action buttons */}
              <div className="flex gap-2 mb-4 flex-wrap">
                <Button size="sm" variant="outline" className="gap-2 flex-1 min-w-[120px]" onClick={() => handlePaymentStatusChange('awaiting_payment')}>
                  <DollarSign className="w-3.5 h-3.5" />Awaiting
                </Button>
                <Button size="sm" className="gap-2 flex-1 min-w-[120px] bg-green-600 hover:bg-green-700" onClick={() => handlePaymentStatusChange('paid')}>
                  <DollarSign className="w-3.5 h-3.5" />Mark Paid
                </Button>
                <Button size="sm" variant="outline" className="gap-2 flex-1 min-w-[120px]" onClick={() => handlePaymentStatusChange('partially_paid')}>
                  <DollarSign className="w-3.5 h-3.5" />Partial
                </Button>
                <Button size="sm" variant="outline" className="gap-2 flex-1 min-w-[120px]" onClick={() => handlePaymentStatusChange('refunded')}>
                  <DollarSign className="w-3.5 h-3.5" />Refund
                </Button>
              </div>

              {/* Payment notes */}
              <div>
                <Label className="text-xs text-muted-foreground">Payment Notes</Label>
                <Textarea value={form.payment_notes || ''} onChange={set('payment_notes')} placeholder="Notes about payment..." rows={2} className="mt-1 text-sm" />
              </div>
            </Section>

            {/* Pricing Summary (admin only) */}
            <Section title="Pricing Summary" icon={<BarChart3 className="w-4 h-4" />} adminOnly>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Customer Sell Price (Total)</Label>
                  <Input type="number" step="0.01" value={form.total_amount || ''} onChange={set('total_amount')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Amount Paid</Label>
                  <Input type="number" step="0.01" value={form.amount_paid || ''} onChange={set('amount_paid')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Vendor Cost Estimate</Label>
                  <Input type="number" step="0.01" value={form.vendor_cost_estimate || ''} onChange={set('vendor_cost_estimate')} className="mt-1" />
                </div>

                {/* Live summary */}
                <div className="bg-muted/40 rounded-xl p-3 space-y-2 mt-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Customer Price</span>
                    <span className="font-semibold">${revenue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount Paid</span>
                    <span className="font-semibold text-green-700">${amountPaid.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t pt-2">
                    <span className="text-muted-foreground font-medium">Balance Due</span>
                    <span className={`font-bold ${balanceDue > 0 ? 'text-red-600' : 'text-green-700'}`}>${balanceDue.toFixed(2)}</span>
                  </div>
                  {vendorCost > 0 && (
                    <>
                      <div className="flex justify-between text-sm border-t pt-2">
                        <span className="text-muted-foreground">Vendor Cost</span>
                        <span className="font-semibold text-red-600">${vendorCost.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Est. Profit</span>
                        <span className={`font-bold ${profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>${profit.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Margin</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{margin.toFixed(1)}%</span>
                          <MarginBadge margin={margin} size="sm" />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </Section>

            {/* Linked Quote Request (admin only) */}
            {quoteRequest && (
              <Section title="Linked Quote Request" icon={<Link2 className="w-4 h-4" />} adminOnly>
                <div className="space-y-2 text-sm">
                  <Field label="Quote Ref" value={`#${quoteRequest.id.slice(-6).toUpperCase()}`} />
                  <Field label="Customer" value={quoteRequest.full_name} />
                  <Field label="Product Type" value={quoteRequest.product_type?.replace(/_/g, ' ')} />
                  <Field label="Print Method" value={quoteRequest.print_method?.replace(/_/g, ' ')} />
                  <Field label="Quantity" value={quoteRequest.quantity} />
                  {quoteRequest.what_to_print && (
                    <div className="bg-muted/30 rounded-lg p-2 text-xs text-muted-foreground mt-1">{quoteRequest.what_to_print}</div>
                  )}
                </div>
                <a href={`/AdminQuoteRequestDetail?id=${quoteRequest.id}`}
                  className="flex items-center gap-1 text-xs text-primary hover:underline mt-3 font-medium">
                  <Eye className="w-3 h-3" />View Full Quote Request →
                </a>
              </Section>
            )}

            {linkedVendorDrafts.length > 0 && (
              <Section title="S&S Vendor Order Workflow" icon={<ClipboardList className="w-4 h-4" />} adminOnly>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <p className="text-sm font-semibold">
                      {ssVendorOrderStageLabel(linkedVendorDrafts[0].workflow_status)}
                    </p>
                    <p className="text-xs text-muted-foreground">Do Not Submit Live Order Yet</p>
                  </div>
                  <a href={`/AdminVendorOrderDraft?id=${linkedVendorDrafts[0].id}`}>
                    <Button size="sm" variant="outline">Open safe draft</Button>
                  </a>
                </div>
                <SSVendorOrderTimeline
                  currentStatus={linkedVendorDrafts[0].workflow_status}
                  draftId={linkedVendorDrafts[0].id}
                  quoteRequestId={linkedVendorDrafts[0].quote_request_id}
                />
              </Section>
            )}

            {/* Linked Vendor Orders (admin only) */}
            <Section title="Linked Vendor Orders" icon={<Truck className="w-4 h-4" />} adminOnly>
              {linkedVendorOrders.length === 0 ? (
                <div className="text-center py-4">
                  <Truck className="w-8 h-8 text-primary/20 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">No vendor order has been created for this customer order yet.</p>
                  <Button size="sm" className="gap-2 w-full" onClick={() => setShowVendorModal(true)}>
                    <Truck className="w-4 h-4" />Create Vendor Order
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {linkedVendorOrders.map((vo) => {
                    const voQty = (vo.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0) || 1;
                    const voCost = (Number(vo.blank_garment_cost) || 0) * voQty
                      + (Number(vo.print_cost) || 0) * voQty
                      + (Number(vo.setup_fee) || 0)
                      + (Number(vo.shipping_cost) || 0)
                      + (Number(vo.other_fees) || 0);
                    const voSell = Number(vo.customer_sell_price) || 0;
                    const voProfit = voSell > 0 ? voSell - voCost : null;
                    const voMargin = voSell > 0 ? (voProfit / voSell) * 100 : null;
                    const statusLabel = VENDOR_STATUS_TO_FULFILLMENT[vo.status] || vo.status?.replace(/_/g, ' ');
                    return (
                      <div key={vo.id} className="border rounded-xl p-3 bg-white space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono text-muted-foreground">#{vo.id.slice(-6).toUpperCase()}</span>
                          <Badge className="text-xs bg-green-100 text-green-800">Vendor Order Created</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Vendor</p>
                            <p className="font-medium">{vo.vendor_name || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Status</p>
                            <p className="font-medium capitalize">{statusLabel || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Vendor Cost</p>
                            <p className="font-medium text-red-600">${voCost.toFixed(2)}</p>
                          </div>
                          {voProfit !== null && (
                            <div>
                              <p className="text-xs text-muted-foreground">Est. Profit</p>
                              <p className={`font-medium ${voProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>${voProfit.toFixed(2)}</p>
                            </div>
                          )}
                          {voMargin !== null && (
                            <div className="col-span-2 flex items-center gap-2">
                              <p className="text-xs text-muted-foreground">Margin</p>
                              <MarginBadge margin={voMargin} size="sm" />
                            </div>
                          )}
                          {vo.tracking_number && (
                            <div className="col-span-2">
                              <p className="text-xs text-muted-foreground">Tracking #</p>
                              <p className="font-mono text-xs font-medium">{vo.tracking_number}</p>
                            </div>
                          )}
                          {vo.created_date && (
                            <div className="col-span-2 flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              Created {format(new Date(vo.created_date), 'MMM d, yyyy')}
                            </div>
                          )}
                        </div>
                        <a href={`/AdminVendorOrderDetail?id=${vo.id}`}
                          className="flex items-center gap-1 text-xs text-primary hover:underline font-medium mt-1">
                          <Eye className="w-3 h-3" />View Vendor Order →
                        </a>
                      </div>
                    );
                  })}
                  <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => setShowVendorModal(true)}>
                    <Plus className="w-4 h-4" />Create Another Vendor Order
                  </Button>
                </div>
              )}
            </Section>

            {/* Generate Messages */}
            <div className="rounded-2xl p-4 border bg-white space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Generate Messages</p>
              <Button size="sm" variant="outline" className="w-full gap-2 justify-start text-xs" onClick={() => setActiveTemplate('order_received')}>
                <Mail className="w-4 h-4 text-blue-500" />Payment Instructions
              </Button>
              <Button size="sm" variant="outline" className="w-full gap-2 justify-start text-xs" onClick={() => setActiveTemplate('payment_received')}>
                <Mail className="w-4 h-4 text-green-500" />Payment Received
              </Button>
              <Button size="sm" variant="outline" className="w-full gap-2 justify-start text-xs" onClick={() => setActiveTemplate('ordered_from_vendor')}>
                <Mail className="w-4 h-4 text-indigo-500" />Ordered From Vendor
              </Button>
              <Button size="sm" variant="outline" className="w-full gap-2 justify-start text-xs" onClick={() => setActiveTemplate('shipped')}>
                <Mail className="w-4 h-4 text-purple-500" />Order Shipped
              </Button>
            </div>

            {/* Quick action summary */}
            <div className="rounded-2xl p-4 border bg-white space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</p>
              <Button size="sm" variant="outline" className="w-full gap-2 justify-start" onClick={handleMarkPaid}>
                <DollarSign className="w-4 h-4 text-green-600" />Mark Paid
              </Button>
              <Button size="sm" variant="outline" className="w-full gap-2 justify-start" onClick={handleMarkAwaiting}>
                <Package className="w-4 h-4 text-yellow-600" />Awaiting Fulfillment
              </Button>
              <Button size="sm" variant="outline" className="w-full gap-2 justify-start" onClick={() => setShowVendorModal(true)}>
                <Truck className="w-4 h-4 text-primary" />{linkedVendorOrders.length > 0 ? 'Create Another Vendor Order' : 'Create Vendor Order'}
              </Button>
              {form.quote_request_id && (
                <a href={`/AdminQuoteRequestDetail?id=${form.quote_request_id}`}>
                  <Button size="sm" variant="outline" className="w-full gap-2 justify-start">
                    <Link2 className="w-4 h-4 text-primary" />View Linked Quote
                  </Button>
                </a>
              )}
              <Button size="sm" variant="outline" className="w-full gap-2 justify-start" onClick={() => setShowNoteInput(v => !v)}>
                <StickyNote className="w-4 h-4 text-amber-600" />Add Internal Note
              </Button>
              <label className="flex items-center gap-2 justify-start cursor-pointer w-full text-sm font-medium border rounded-md px-3 py-1.5 hover:bg-muted/50 transition-colors">
                <Upload className="w-4 h-4 text-blue-600" />Upload Production File
                <input type="file" className="hidden" onChange={handleUploadProductionFile} />
              </label>
            </div>
          </div>
        </div>
      </div>

      {activeTemplate && (
        <MessageTemplateModal
          templateKey={activeTemplate}
          vars={templateVars}
          onClose={() => setActiveTemplate(null)}
        />
      )}

      {showVendorModal && (
        <CreateVendorOrderModal
          order={form}
          quoteRequest={quoteRequest}
          orderItemProducts={orderItemProducts}
          onClose={() => setShowVendorModal(false)}
          onCreated={(vo) => {
            setShowVendorModal(false);
            setForm(p => ({
              ...p,
              vendor_order_id: vo.id,
              fulfillment_status: 'sent_to_vendor',
              assigned_vendor_id: vo.vendor_id,
              assigned_vendor_name: vo.vendor_name,
              vendor_cost_estimate: vo.blank_garment_cost + vo.print_cost + vo.setup_fee + vo.shipping_cost + vo.other_fees,
              estimated_profit: vo.estimated_profit,
              profit_margin_pct: vo.profit_margin_pct,
            }));
            qc.invalidateQueries({ queryKey: ['admin-orders'] });
            qc.invalidateQueries({ queryKey: ['order', orderId] });
            qc.invalidateQueries({ queryKey: ['vendor-orders-for-order', orderId] });
          }}
        />
      )}
    </div>
  );
}
