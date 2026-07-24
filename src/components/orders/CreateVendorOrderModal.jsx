import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Truck, X, Plus, Trash2, FileImage, ExternalLink,
  Copy, Upload, Star, Phone, Mail, Clock, Tag, Package,
} from 'lucide-react';
import { toast } from 'sonner';
import MarginBadge from '@/components/profit/MarginBadge';

// ── Constants ────────────────────────────────────────────────────────────────

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent_to_vendor', label: 'Sent to Vendor' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'in_production', label: 'In Production' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'issue_hold', label: 'Issue / Hold' },
  { value: 'canceled', label: 'Canceled' },
];

const VENDOR_TYPE_OPTIONS = [
  { value: 'apparel_blank_supplier', label: 'Apparel Blank Supplier' },
  { value: 'dtf_printer', label: 'DTF Printer' },
  { value: 'screen_printer', label: 'Screen Printer' },
  { value: 'embroidery', label: 'Embroidery' },
  { value: 'dtg_printer', label: 'DTG Printer' },
  { value: 'dtf_supplier', label: 'DTF Supplier' },
  { value: 'sublimation', label: 'Sublimation' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'shipping', label: 'Shipping' },
  { value: 'other', label: 'Other' },
];
const VENDOR_TYPE_LABELS = Object.fromEntries(VENDOR_TYPE_OPTIONS.map(o => [o.value, o.label]));

const PRINT_METHOD_OPTIONS = [
  { value: 'dtf', label: 'DTF (Direct to Film)' },
  { value: 'dtg', label: 'DTG (Direct to Garment)' },
  { value: 'screen_print', label: 'Screen Print' },
  { value: 'embroidery', label: 'Embroidery' },
  { value: 'sublimation', label: 'Sublimation' },
  { value: 'vinyl', label: 'Vinyl' },
  { value: 'heat_transfer', label: 'Heat Transfer' },
  { value: 'other', label: 'Other' },
];
const PRINT_METHOD_LABELS = Object.fromEntries(PRINT_METHOD_OPTIONS.map(o => [o.value, o.label]));

const PRODUCT_CATEGORIES = [
  'T-Shirts', 'Hoodies', 'Sweatshirts', 'Hats', 'Kids Apparel',
  'Apparel Blanks', 'Long Sleeve Shirts', 'Crewnecks', 'Polo Shirts',
  'Jackets', 'Sportswear', 'Accessories', 'Other',
];

const EMPTY_ITEM = {
  product_name: '', garment_size: '', garment_color: '',
  quantity: 1, print_details: '', vendor_cost_per_unit: 0, customer_price_per_unit: 0,
};

const EMPTY_VENDOR_FORM = {
  name: '', vendor_type: 'dtf_printer', contact_person: '', email: '',
  phone: '', website: '', turnaround_time: '', notes: '', is_active: true,
};

const EMPTY_PRICING_FORM = {
  product_name: '', product_category: 'T-Shirts', garment_brand: '',
  garment_style_number: '', print_method: 'dtf',
  blank_garment_cost: '', print_cost: '', setup_fee: '',
  shipping_cost: '', minimum_order_quantity: '', turnaround_time: '', notes: '', is_active: true,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function label(value, map) {
  if (!value) return '';
  return map[value] || value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function buildItemsFromOrder(order, products = []) {
  if (order?.order_items?.length) {
    return order.order_items.map(i => {
      // Find the product data for this item
      const product = products.find(p => p.id === i.product_id);
      return {
        product_name: i.product_name || '',
        garment_size: i.size || '',
        garment_color: i.color || '',
        sku: i.sku || '',
        quantity: Number(i.quantity) || 1,
        print_details: [
          i.print_method ? label(i.print_method, PRINT_METHOD_LABELS) : '',
          Array.isArray(i.print_placement) ? i.print_placement.join(', ') : (i.print_placement || ''),
        ].filter(Boolean).join(' — '),
        vendor_cost_per_unit: 0,
        customer_price_per_unit: Number(i.price) || 0,
        // Store product meta for later use
        _product_id: i.product_id,
        _product_data: product,
      };
    });
  }
  if (order?.garment_type || order?.quantity) {
    return [{
      product_name: order.garment_type || '',
      garment_size: order.sizes_needed || '',
      garment_color: order.garment_colors || '',
      quantity: Number(order.quantity) || 1,
      print_details: [
        order.print_method ? label(order.print_method, PRINT_METHOD_LABELS) : '',
        Array.isArray(order.print_placement) ? order.print_placement.join(', ') : (order.print_placement || ''),
      ].filter(Boolean).join(' — '),
      vendor_cost_per_unit: 0,
      customer_price_per_unit: Number(order.total_amount) || 0,
    }];
  }
  return [{ ...EMPTY_ITEM }];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, icon, children }) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
      <span className="text-primary">{icon}</span>
      <p className="text-sm font-bold flex-1">{title}</p>
      {children}
    </div>
  );
}

function AdminBadge() {
  return <span className="ml-auto text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full shrink-0">Admin Only</span>;
}

// ── Inline Create Vendor Form ─────────────────────────────────────────────────

function CreateVendorInline({ onCreated, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY_VENDOR_FORM });
  const [saving, setSaving] = useState(false);
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Vendor name is required'); return; }
    setSaving(true);
    try {
      const created = await base44.entities.Vendor.create({
        name: form.name.trim(),
        vendor_type: form.vendor_type || 'other',
        contact_person: form.contact_person,
        email: form.email,
        phone: form.phone,
        website: form.website,
        turnaround_time: form.turnaround_time,
        notes: form.notes,
        is_active: true,
      });
      toast.success('Vendor created!');
      onCreated(created);
    } catch (err) {
      toast.error('Failed to create vendor: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 border border-primary/25 rounded-xl p-4 bg-primary/[0.03] space-y-3">
      <p className="text-xs font-bold text-primary uppercase tracking-wide">New Vendor</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs text-muted-foreground">Vendor Name *</Label>
          <Input value={form.name} onChange={f('name')} placeholder="Print Shop Name" className="mt-0.5 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Vendor Type</Label>
          <Select value={form.vendor_type} onValueChange={v => setForm(p => ({ ...p, vendor_type: v }))}>
            <SelectTrigger className="mt-0.5 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VENDOR_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Contact Person</Label>
          <Input value={form.contact_person} onChange={f('contact_person')} placeholder="John Smith" className="mt-0.5 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Email</Label>
          <Input type="email" value={form.email} onChange={f('email')} placeholder="vendor@email.com" className="mt-0.5 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Phone</Label>
          <Input value={form.phone} onChange={f('phone')} placeholder="555-000-0000" className="mt-0.5 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Website</Label>
          <Input value={form.website} onChange={f('website')} placeholder="https://..." className="mt-0.5 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Avg Turnaround Time</Label>
          <Input value={form.turnaround_time} onChange={f('turnaround_time')} placeholder="5 business days" className="mt-0.5 h-8 text-xs" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Textarea rows={2} value={form.notes} onChange={f('notes')} placeholder="Any notes about this vendor…" className="mt-0.5 text-xs" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={onCancel}>Cancel</Button>
        <Button type="button" size="sm" className="flex-1 bg-primary gap-1.5 h-8 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Save Vendor
        </Button>
      </div>
    </div>
  );
}

// ── Inline Create Pricing Form ────────────────────────────────────────────────

function CreatePricingInline({ vendorId, vendorName, onCreated, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY_PRICING_FORM });
  const [saving, setSaving] = useState(false);
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.product_name.trim()) { toast.error('Product name is required'); return; }
    setSaving(true);
    try {
      const created = await base44.entities.VendorPricing.create({
        vendor_id: vendorId,
        vendor_name: vendorName,
        product_name: form.product_name.trim(),
        product_category: form.product_category,
        garment_brand: form.garment_brand,
        garment_style_number: form.garment_style_number,
        print_method: form.print_method,
        blank_garment_cost: parseFloat(form.blank_garment_cost) || 0,
        print_cost: parseFloat(form.print_cost) || 0,
        setup_fee: parseFloat(form.setup_fee) || 0,
        shipping_cost: parseFloat(form.shipping_cost) || 0,
        minimum_order_quantity: form.minimum_order_quantity ? Number(form.minimum_order_quantity) : undefined,
        turnaround_time: form.turnaround_time,
        notes: form.notes,
        is_active: true,
      });
      toast.success('Pricing record created!');
      onCreated(created);
    } catch (err) {
      toast.error('Failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 border border-primary/25 rounded-xl p-4 bg-primary/[0.03] space-y-3">
      <p className="text-xs font-bold text-primary uppercase tracking-wide">New Pricing Record</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs text-muted-foreground">Product Name *</Label>
          <Input value={form.product_name} onChange={f('product_name')} placeholder="Basic T-Shirt DTF Print" className="mt-0.5 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Product Category</Label>
          <Select value={form.product_category} onValueChange={v => setForm(p => ({ ...p, product_category: v }))}>
            <SelectTrigger className="mt-0.5 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRODUCT_CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Garment Brand</Label>
          <Input value={form.garment_brand} onChange={f('garment_brand')} placeholder="Gildan" className="mt-0.5 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Style Number</Label>
          <Input value={form.garment_style_number} onChange={f('garment_style_number')} placeholder="5000" className="mt-0.5 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Print Method</Label>
          <Select value={form.print_method} onValueChange={v => setForm(p => ({ ...p, print_method: v }))}>
            <SelectTrigger className="mt-0.5 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRINT_METHOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Blank Garment ($/ea)</Label>
          <Input type="number" step="0.01" min="0" value={form.blank_garment_cost} onChange={f('blank_garment_cost')} className="mt-0.5 h-8 text-xs text-right" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Print Cost ($/ea)</Label>
          <Input type="number" step="0.01" min="0" value={form.print_cost} onChange={f('print_cost')} className="mt-0.5 h-8 text-xs text-right" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Setup Fee ($)</Label>
          <Input type="number" step="0.01" min="0" value={form.setup_fee} onChange={f('setup_fee')} className="mt-0.5 h-8 text-xs text-right" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Shipping Estimate ($)</Label>
          <Input type="number" step="0.01" min="0" value={form.shipping_cost} onChange={f('shipping_cost')} className="mt-0.5 h-8 text-xs text-right" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Min Order Qty</Label>
          <Input type="number" min="1" value={form.minimum_order_quantity} onChange={f('minimum_order_quantity')} className="mt-0.5 h-8 text-xs text-right" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Turnaround Time</Label>
          <Input value={form.turnaround_time} onChange={f('turnaround_time')} placeholder="5 business days" className="mt-0.5 h-8 text-xs" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Textarea rows={2} value={form.notes} onChange={f('notes')} placeholder="Any pricing notes…" className="mt-0.5 text-xs" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={onCancel}>Cancel</Button>
        <Button type="button" size="sm" className="flex-1 bg-primary gap-1.5 h-8 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Save & Auto-Fill
        </Button>
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function CreateVendorOrderModal({ order, quoteRequest, orderItemProducts = [], onClose, onCreated }) {
  const qc = useQueryClient();

  // Load ALL vendors (not filtered by is_active — show all so nothing gets hidden)
  const { data: vendors = [], refetch: refetchVendors } = useQuery({
    queryKey: ['all-vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const [saving, setSaving] = useState(false);
  const [uploadingArtwork, setUploadingArtwork] = useState(false);
  const [showCreateVendor, setShowCreateVendor] = useState(false);
  const [showCreatePricing, setShowCreatePricing] = useState(false);

  const [selectedVendorId, setSelectedVendorId] = useState(
    order?.assigned_vendor_id || quoteRequest?.assigned_vendor_id || ''
  );
  const [selectedPricingId, setSelectedPricingId] = useState('');
  const [appliedPricingRecord, setAppliedPricingRecord] = useState(null);

  const [form, setForm] = useState(() => {
    const addr = order?.shipping_address;
    const shippingStr = addr
      ? [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ')
      : '';
    
    // Try to extract vendor info from first order item's product
    let vendorFromProduct = '';
    let brandFromProduct = '';
    let styleFromProduct = '';
    let blankCostFromProduct = 0;
    if (order?.order_items?.length && orderItemProducts.length) {
      const firstItem = order.order_items[0];
      const product = orderItemProducts.find(p => p.id === firstItem.product_id);
      if (product) {
        vendorFromProduct = product.vendor_source || '';
        brandFromProduct = product.supplier_sku?.split('-')?.[0] || ''; // Try to extract brand from SKU
        styleFromProduct = product.supplier_sku || '';
        blankCostFromProduct = product.blank_garment_cost || 0;
      }
    }
    
    return {
      status: 'draft',
      vendor_id: order?.assigned_vendor_id || quoteRequest?.assigned_vendor_id || '',
      vendor_name: order?.assigned_vendor_name || quoteRequest?.assigned_vendor_name || vendorFromProduct || '',
      customer_order_id: order?.id || '',
      quote_request_id: quoteRequest?.id || order?.quote_request_id || '',
      items: buildItemsFromOrder(order, orderItemProducts),
      blank_garment_cost: parseFloat(quoteRequest?.blank_garment_cost) || blankCostFromProduct || 0,
      print_cost: parseFloat(quoteRequest?.print_cost) || 0,
      setup_fee: parseFloat(quoteRequest?.setup_fee) || 0,
      shipping_cost: parseFloat(quoteRequest?.shipping_cost_vendor || quoteRequest?.shipping_cost) || 0,
      other_fees: parseFloat(quoteRequest?.other_fees) || 0,
      customer_paid_total: parseFloat(order?.total_amount || quoteRequest?.customer_quote_price) || 0,
      print_instructions: quoteRequest?.what_to_print || order?.what_to_print || '',
      placement_notes: Array.isArray(order?.print_placement)
        ? order.print_placement.join(', ')
        : (order?.print_placement || ''),
      color_notes: order?.garment_colors || quoteRequest?.garment_colors || '',
      vendor_notes: '',
      internal_notes: [
        quoteRequest?.project_notes ? `Project notes: ${quoteRequest.project_notes}` : '',
        quoteRequest?.needs_artwork_help ? '⚠ Customer needs artwork help' : '',
      ].filter(Boolean).join('\n'),
      production_notes: '',
      shipping_customer_name: order?.customer_name || quoteRequest?.full_name || '',
      shipping_address: shippingStr,
      delivery_notes: order?.delivery_notes || quoteRequest?.delivery_notes || '',
      date_needed: order?.date_needed || quoteRequest?.date_needed || '',
      vendor_shipping_method: '',
      tracking_number: '',
      artwork_file_url: quoteRequest?.artwork_file_url || order?.artwork_file_url || order?.order_items?.[0]?.artwork_file_url || '',
      artwork_link: quoteRequest?.artwork_link || order?.artwork_link || order?.order_items?.[0]?.artwork_link || '',
      admin_mockup_url: quoteRequest?.admin_mockup_url || order?.order_items?.[0]?.admin_mockup_url || '',
      production_file_url: order?.production_file_url || '',
      turnaround_time: '',
      minimum_order_quantity: '',
      garment_brand: brandFromProduct || '',
      garment_style_number: styleFromProduct || '',
      vendor_pricing_id: '',
    };
  });

  const selectedVendorData = vendors.find(v => v.id === selectedVendorId);

  // Load ALL pricing records — same query key as AdminVendorPricing page
  const { data: allPricingRecords = [], refetch: refetchPricing } = useQuery({
    queryKey: ['vendor-pricing'],
    queryFn: () => base44.entities.VendorPricing.list('-created_date'),
    staleTime: 0,
  });

  // Show ALL active records — no vendor/category/method filtering
  const isActive = (p) => {
    const a = p.is_active;
    return a === undefined || a === null || a === true || a === 'true' || a === 'Active' || a === 'active';
  };
  const pricingOptions = allPricingRecords.filter(isActive);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const setField = (k) => (e) => setForm(p => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const setNum = (k) => (e) => setForm(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }));
  const updateItem = (idx, k, v) =>
    setForm(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, [k]: v } : it) }));
  const addItem = () => setForm(p => ({ ...p, items: [...p.items, { ...EMPTY_ITEM }] }));
  const removeItem = (idx) => setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));

  const handleVendorChange = (vendorId) => {
    const vnd = vendors.find(x => x.id === vendorId);
    setSelectedVendorId(vendorId);
    setSelectedPricingId('');
    setAppliedPricingRecord(null);
    setShowCreatePricing(false);
    setForm(p => ({ ...p, vendor_id: vendorId, vendor_name: vnd?.name || '' }));
  };

  const applyPricingRecord = (pricing) => {
    if (!pricing) return;
    const blankCost = parseFloat(pricing.blank_garment_cost ?? 0) || 0;
    const printCost = parseFloat(pricing.print_cost ?? 0) || 0;
    const setupFee = parseFloat(pricing.setup_fee ?? 0) || 0;
    const shippingCost = parseFloat(pricing.shipping_cost ?? 0) || 0;

    // Also set vendor if the pricing record has a vendor_id
    if (pricing.vendor_id) {
      setSelectedVendorId(pricing.vendor_id);
    }

    setSelectedPricingId(pricing.id);
    setAppliedPricingRecord(pricing);
    setForm(p => ({
      ...p,
      vendor_id: pricing.vendor_id || p.vendor_id,
      vendor_name: pricing.vendor_name || p.vendor_name,
      blank_garment_cost: blankCost,
      print_cost: printCost,
      setup_fee: setupFee,
      shipping_cost: shippingCost,
      turnaround_time: pricing.turnaround_time || p.turnaround_time,
      minimum_order_quantity: pricing.minimum_order_quantity != null ? String(pricing.minimum_order_quantity) : p.minimum_order_quantity,
      garment_brand: pricing.garment_brand || p.garment_brand || '',
      garment_style_number: pricing.garment_style_number || p.garment_style_number || '',
      vendor_pricing_id: pricing.id,
    }));

    toast.success(`Auto-filled from: ${pricing.vendor_name} — ${pricing.product_name}`);
  };

  const handleSelectPricing = (pricingId) => {
    const pricing = allPricingRecords.find(p => p.id === pricingId);
    applyPricingRecord(pricing);
  };

  const handleVendorCreated = async (newVendor) => {
    setShowCreateVendor(false);
    await refetchVendors();
    handleVendorChange(newVendor.id);
    toast.success(`Vendor "${newVendor.name}" added and selected!`);
  };

  const handlePricingCreated = async (newPricing) => {
    setShowCreatePricing(false);
    await refetchPricing();
    applyPricingRecord(newPricing);
  };

  const handleUploadArtwork = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingArtwork(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(p => ({ ...p, artwork_file_url: file_url }));
      toast.success('Artwork uploaded');
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploadingArtwork(false);
    }
  };

  const copyToClipboard = (text) => navigator.clipboard.writeText(text).then(() => toast.success('Copied!'));

  // ── Live calculations ─────────────────────────────────────────────────────

  const totalQty = form.items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  const qty = totalQty || 1;
  const blankTotal = (parseFloat(form.blank_garment_cost) || 0) * qty;
  const printTotal = (parseFloat(form.print_cost) || 0) * qty;
  const flatSetup = parseFloat(form.setup_fee) || 0;
  const flatShipping = parseFloat(form.shipping_cost) || 0;
  const flatOther = parseFloat(form.other_fees) || 0;
  const totalVendorCost = blankTotal + printTotal + flatSetup + flatShipping + flatOther;
  const revenue = parseFloat(form.customer_paid_total) || 0;
  const profit = revenue - totalVendorCost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const profitPerItem = totalQty > 0 ? profit / totalQty : 0;

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.vendor_id) { toast.error('Please select a vendor'); return; }
    setSaving(true);
    try {
      const vo = await base44.entities.VendorOrder.create({
       vendor_id: form.vendor_id,
       vendor_name: form.vendor_name,
       customer_order_id: form.customer_order_id,
       quote_request_id: form.quote_request_id,
       status: form.status,
       items: form.items,
       artwork_file_url: form.artwork_file_url,
       artwork_link: form.artwork_link,
       admin_mockup_url: form.admin_mockup_url,
       vendor_pricing_id: form.vendor_pricing_id || '',
       garment_brand: form.garment_brand || '',
       garment_style_number: form.garment_style_number || '',
       blank_garment_cost: parseFloat(form.blank_garment_cost) || 0,
       print_cost: parseFloat(form.print_cost) || 0,
       setup_fee: parseFloat(form.setup_fee) || 0,
       shipping_cost: parseFloat(form.shipping_cost) || 0,
       other_fees: parseFloat(form.other_fees) || 0,
       customer_sell_price: parseFloat(form.customer_paid_total) || 0,
       estimated_profit: profit,
       profit_margin_pct: margin,
        production_notes: [
          form.print_instructions ? `Print Instructions: ${form.print_instructions}` : '',
          form.placement_notes ? `Placement: ${form.placement_notes}` : '',
          form.color_notes ? `Colors: ${form.color_notes}` : '',
          form.vendor_notes ? `Vendor Notes: ${form.vendor_notes}` : '',
          form.production_notes || '',
        ].filter(Boolean).join('\n\n'),
        shipping_notes: [
          form.shipping_customer_name ? `Ship To: ${form.shipping_customer_name}` : '',
          form.shipping_address || '',
          form.delivery_notes ? `Delivery Notes: ${form.delivery_notes}` : '',
          form.vendor_shipping_method ? `Shipping Method: ${form.vendor_shipping_method}` : '',
          form.date_needed ? `Date Needed: ${form.date_needed}` : '',
        ].filter(Boolean).join('\n'),
        tracking_number: form.tracking_number,
      });

      if (order?.id) {
        await base44.entities.Order.update(order.id, {
          vendor_order_id: vo.id,
          fulfillment_status: 'sent_to_vendor',
          assigned_vendor_id: form.vendor_id,
          assigned_vendor_name: form.vendor_name,
          vendor_cost_estimate: totalVendorCost,
          estimated_profit: profit,
          profit_margin_pct: margin,
        });
      }
      toast.success('Vendor order created!');
      onCreated(vo);
    } catch (err) {
      toast.error('Failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-5xl max-h-[96vh] flex flex-col">

        {/* Sticky Header */}
        <div className="bg-primary text-primary-foreground px-6 py-4 rounded-t-2xl flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Truck className="w-5 h-5" />
            <div>
              <h2 className="font-extrabold text-lg">Create Vendor Order</h2>
              <p className="text-primary-foreground/70 text-xs">
                {order ? `Linked to Customer Order #${order.id.slice(-8).toUpperCase()}` : 'New vendor fulfillment order'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-primary-foreground/15 hover:bg-primary-foreground/30 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-8">

            {/* ── Status ── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Vendor Order Status</Label>
                <Select value={form.status} onValueChange={setField('status')}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Step 1: Select Pricing Record ── */}
            <div>
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
                <span className="text-primary"><Tag className="w-4 h-4" /></span>
                <p className="text-sm font-bold flex-1">Step 1 — Select a Pricing Record</p>
                <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">Auto-fills vendor + costs</span>
                <Button type="button" size="sm" variant="outline" className="gap-1 text-xs h-7 ml-2"
                  onClick={() => { setShowCreatePricing(v => !v); setShowCreateVendor(false); }}>
                  <Plus className="w-3 h-3" />{showCreatePricing ? 'Cancel' : 'Add Pricing Record'}
                </Button>
              </div>

              {pricingOptions.length === 0 ? (
                <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  No active pricing records found. Go to <strong>Admin → Vendor Pricing</strong> to add one, or use "Add Pricing Record" above.
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {pricingOptions.map(p => {
                    const isApplied = selectedPricingId === p.id;
                    return (
                      <div
                        key={p.id}
                        className={`rounded-xl border-2 p-4 transition-all ${
                          isApplied
                            ? 'border-primary bg-primary/[0.04] shadow-md'
                            : 'border-border bg-white hover:border-primary/40 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <p className="font-semibold text-sm leading-tight">{p.product_name || 'Pricing Record'}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{p.vendor_name || '—'}</p>
                          </div>
                          {isApplied && (
                            <span className="shrink-0 text-xs bg-primary text-primary-foreground font-semibold px-2 py-0.5 rounded-full">✓ Applied</span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground mb-3">
                          {(p.garment_brand || p.garment_style_number) && (
                            <div><span className="font-medium text-foreground">{[p.garment_brand, p.garment_style_number ? `#${p.garment_style_number}` : ''].filter(Boolean).join(' ')}</span></div>
                          )}
                          {p.print_method && (
                            <div>Method: <span className="font-medium text-foreground">{label(p.print_method, PRINT_METHOD_LABELS)}</span></div>
                          )}
                          {p.blank_garment_cost > 0 && (
                            <div>Blank: <span className="font-medium text-foreground">${parseFloat(p.blank_garment_cost).toFixed(2)}/ea</span></div>
                          )}
                          {p.print_cost > 0 && (
                            <div>Print: <span className="font-medium text-foreground">${parseFloat(p.print_cost).toFixed(2)}/ea</span></div>
                          )}
                          {p.setup_fee > 0 && (
                            <div>Setup: <span className="font-medium text-foreground">${parseFloat(p.setup_fee).toFixed(2)}</span></div>
                          )}
                          {p.shipping_cost > 0 && (
                            <div>Shipping: <span className="font-medium text-foreground">${parseFloat(p.shipping_cost).toFixed(2)}</span></div>
                          )}
                          {p.turnaround_time && (
                            <div className="col-span-2">Turnaround: <span className="font-medium text-foreground">{p.turnaround_time}</span></div>
                          )}
                          {p.minimum_order_quantity && (
                            <div>Min Qty: <span className="font-medium text-foreground">{p.minimum_order_quantity}</span></div>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className={`w-full h-8 text-xs font-semibold gap-1.5 ${isApplied ? 'bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
                          onClick={() => applyPricingRecord(p)}
                        >
                          {isApplied ? '✓ This Pricing Applied' : 'Use This Pricing'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {showCreatePricing && (
                <CreatePricingInline
                  vendorId={selectedVendorId}
                  vendorName={selectedVendorData?.name || form.vendor_name || ''}
                  onCreated={handlePricingCreated}
                  onCancel={() => setShowCreatePricing(false)}
                />
              )}
            </div>

            {/* ── Step 2: Vendor (auto-filled from pricing, or manual) ── */}
            <div>
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
                <span className="text-primary"><Truck className="w-4 h-4" /></span>
                <p className="text-sm font-bold flex-1">Step 2 — Vendor</p>
                <span className="text-xs text-muted-foreground">Auto-set from pricing record, or select manually</span>
              </div>

              {/* If pricing set a vendor name but it can't be matched to a dropdown record, show read-only */}
              {form.vendor_name && !vendors.find(v => v.id === form.vendor_id) ? (
                <div className="mb-3 flex items-center gap-3 bg-muted/30 border border-border rounded-xl px-4 py-3">
                  <Truck className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Vendor (from pricing record)</p>
                    <p className="font-semibold text-sm">{form.vendor_name}</p>
                  </div>
                  <Badge className="ml-auto bg-green-100 text-green-700 text-xs">Set from Pricing</Badge>
                </div>
              ) : null}

              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs font-semibold">Vendor</Label>
                  <Button type="button" size="sm" variant="outline" className="gap-1 text-xs h-7"
                    onClick={() => { setShowCreateVendor(v => !v); setShowCreatePricing(false); }}>
                    <Plus className="w-3 h-3" />{showCreateVendor ? 'Cancel' : 'Create Vendor'}
                  </Button>
                </div>
                <Select value={form.vendor_id} onValueChange={handleVendorChange}>
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue placeholder="Select or confirm vendor…" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}{v.vendor_type ? ` — ${label(v.vendor_type, VENDOR_TYPE_LABELS)}` : ''}
                        {!v.is_active ? ' (Inactive)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {showCreateVendor && (
                  <CreateVendorInline
                    onCreated={handleVendorCreated}
                    onCancel={() => setShowCreateVendor(false)}
                  />
                )}
              </div>

              {/* Vendor Info Card */}
              {selectedVendorData && (
                <div className="bg-muted/30 border border-border rounded-xl p-4 grid sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Vendor</p>
                    <p className="font-semibold">{selectedVendorData.name}</p>
                    {selectedVendorData.vendor_type && (
                      <p className="text-xs text-muted-foreground mt-0.5">{label(selectedVendorData.vendor_type, VENDOR_TYPE_LABELS)}</p>
                    )}
                  </div>
                  {selectedVendorData.email && (
                    <div className="flex items-start gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="text-xs font-medium">{selectedVendorData.email}</p>
                      </div>
                    </div>
                  )}
                  {selectedVendorData.phone && (
                    <div className="flex items-start gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="text-xs font-medium">{selectedVendorData.phone}</p>
                      </div>
                    </div>
                  )}
                  {selectedVendorData.turnaround_time && (
                    <div className="flex items-start gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Avg Turnaround</p>
                        <p className="text-xs font-medium">{selectedVendorData.turnaround_time}</p>
                      </div>
                    </div>
                  )}
                  {selectedVendorData.quality_rating && (
                    <div className="flex items-start gap-1.5">
                      <Star className="w-3.5 h-3.5 text-yellow-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Quality</p>
                        <p className="text-xs font-medium">{selectedVendorData.quality_rating}/5</p>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge className={selectedVendorData.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                      {selectedVendorData.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
              )}
            </div>

            {/* ── Artwork & Production Files ── */}
            <div>
              <SectionHeader title="Artwork & Production Files" icon={<FileImage className="w-4 h-4" />} />

              {!form.artwork_file_url && !form.artwork_link && !form.admin_mockup_url ? (
                <p className="text-sm text-muted-foreground mb-3 italic">No artwork uploaded.</p>
              ) : (
                <div className="flex flex-wrap gap-2 mb-3">
                  {form.artwork_file_url && (
                    <>
                      <a href={form.artwork_file_url} target="_blank" rel="noreferrer">
                        <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs">
                          <FileImage className="w-3.5 h-3.5" />View Artwork
                        </Button>
                      </a>
                      <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => copyToClipboard(form.artwork_file_url)}>
                        <Copy className="w-3.5 h-3.5" />Copy Link
                      </Button>
                    </>
                  )}
                  {form.artwork_link && (
                    <a href={form.artwork_link} target="_blank" rel="noreferrer">
                      <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs">
                        <ExternalLink className="w-3.5 h-3.5" />Drive Link
                      </Button>
                    </a>
                  )}
                  {form.admin_mockup_url && (
                    <a href={form.admin_mockup_url} target="_blank" rel="noreferrer">
                      <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs">
                        <FileImage className="w-3.5 h-3.5" />View Mockup
                      </Button>
                    </a>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <label className={`flex items-center gap-1.5 cursor-pointer text-xs font-medium px-3 py-1.5 rounded-md border border-input hover:bg-muted/50 transition-colors ${uploadingArtwork ? 'opacity-60 pointer-events-none' : ''}`}>
                  {uploadingArtwork ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Upload Production File
                  <input type="file" className="hidden" onChange={handleUploadArtwork} />
                </label>
                <Input value={form.artwork_link} onChange={setField('artwork_link')} placeholder="Add mockup / drive link…" className="h-8 text-xs flex-1 min-w-[200px]" />
              </div>
            </div>

            {/* ── Selected Products Summary (from checkout) ── */}
            {order?.order_items?.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-2 mb-3">
                  <Package className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-900">Products from Customer Order</p>
                    <p className="text-xs text-blue-700 mt-0.5">Order #{order.id.slice(-8).toUpperCase()} — {order.customer_name}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {order.order_items.map((item, idx) => (
                    <div key={idx} className="text-xs bg-white rounded-lg p-3 border border-blue-100">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="font-semibold text-foreground">{item.product_name}</span>
                        <span className="font-bold text-blue-700">${(Number(item.price) * Number(item.quantity)).toFixed(2)}</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-muted-foreground">
                        {item.size && <span>Size: <strong className="text-foreground">{item.size}</strong></span>}
                        {item.color && <span>Color: <strong className="text-foreground">{item.color}</strong></span>}
                        <span>Qty: <strong className="text-foreground">{item.quantity}</strong></span>
                        <span>Unit: <strong className="text-foreground">${Number(item.price).toFixed(2)}</strong></span>
                        {item.sku && <span className="col-span-2 font-mono">SKU: <strong className="text-foreground">{item.sku}</strong></span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Order Items ── */}
            <div>
              <SectionHeader title="Order Items" icon={<Tag className="w-4 h-4" />}>
                <Button type="button" size="sm" variant="outline" onClick={addItem} className="gap-1.5 h-7 text-xs">
                  <Plus className="w-3 h-3" />Add Item
                </Button>
              </SectionHeader>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {['Product', 'Size', 'Color', 'SKU', 'Qty', 'Print Details', 'Vendor $/unit', 'Customer $/unit', ''].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {form.items.map((item, idx) => (
                      <tr key={idx} className="bg-white hover:bg-muted/20">
                        <td className="px-2 py-2">
                          <Input value={item.product_name} onChange={e => updateItem(idx, 'product_name', e.target.value)} placeholder="T-Shirt…" className="h-8 text-xs min-w-[120px]" />
                        </td>
                        <td className="px-2 py-2">
                          <Input value={item.garment_size} onChange={e => updateItem(idx, 'garment_size', e.target.value)} placeholder="S/M/L" className="h-8 text-xs w-20" />
                        </td>
                        <td className="px-2 py-2">
                          <Input value={item.garment_color} onChange={e => updateItem(idx, 'garment_color', e.target.value)} placeholder="Black" className="h-8 text-xs w-20" />
                        </td>
                        <td className="px-2 py-2">
                          <Input value={item.sku || ''} onChange={e => updateItem(idx, 'sku', e.target.value)} placeholder="SKU" className="h-8 text-xs w-24 font-mono" />
                        </td>
                        <td className="px-2 py-2">
                          <Input type="number" min="1" value={item.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} className="h-8 text-xs w-16 text-right" />
                        </td>
                        <td className="px-2 py-2">
                          <Input value={item.print_details} onChange={e => updateItem(idx, 'print_details', e.target.value)} placeholder="DTF — Front" className="h-8 text-xs min-w-[140px]" />
                        </td>
                        <td className="px-2 py-2">
                          <Input type="number" step="0.01" min="0" value={item.vendor_cost_per_unit} onChange={e => updateItem(idx, 'vendor_cost_per_unit', Number(e.target.value))} className="h-8 text-xs w-20 text-right" />
                        </td>
                        <td className="px-2 py-2">
                          <Input type="number" step="0.01" min="0" value={item.customer_price_per_unit} onChange={e => updateItem(idx, 'customer_price_per_unit', Number(e.target.value))} className="h-8 text-xs w-20 text-right" />
                        </td>
                        <td className="px-2 py-2">
                          {form.items.length > 1 && (
                            <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 p-1 rounded">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Production Notes ── */}
            <div>
              <SectionHeader title="Production Notes" icon={<FileImage className="w-4 h-4" />} />
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Print Instructions</Label>
                  <Textarea rows={2} value={form.print_instructions} onChange={setField('print_instructions')} placeholder="What to print, design notes…" className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Placement Notes</Label>
                  <Textarea rows={2} value={form.placement_notes} onChange={setField('placement_notes')} placeholder="Front, back, left sleeve…" className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Color Notes</Label>
                  <Textarea rows={2} value={form.color_notes} onChange={setField('color_notes')} placeholder="Garment colors, ink colors…" className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Vendor Notes</Label>
                  <Textarea rows={2} value={form.vendor_notes} onChange={setField('vendor_notes')} placeholder="Notes to send to vendor…" className="mt-1 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Internal Notes (Admin Only)</Label>
                  <Textarea rows={2} value={form.internal_notes} onChange={setField('internal_notes')} placeholder="Internal notes — not shared with vendor…" className="mt-1 text-sm" />
                </div>
              </div>
            </div>

            {/* ── Shipping ── */}
            <div>
              <SectionHeader title="Shipping" icon={<Truck className="w-4 h-4" />} />
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Customer Shipping Name</Label>
                  <Input value={form.shipping_customer_name} onChange={setField('shipping_customer_name')} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Requested Due Date</Label>
                  <Input type="date" value={form.date_needed || ''} onChange={setField('date_needed')} className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Shipping Address</Label>
                  <Input value={form.shipping_address} onChange={setField('shipping_address')} placeholder="Street, City, State ZIP" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Delivery Notes</Label>
                  <Textarea rows={2} value={form.delivery_notes} onChange={setField('delivery_notes')} className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Vendor Shipping Method</Label>
                  <Input value={form.vendor_shipping_method} onChange={setField('vendor_shipping_method')} placeholder="UPS Ground, FedEx…" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Tracking Number</Label>
                  <Input value={form.tracking_number} onChange={setField('tracking_number')} placeholder="Optional" className="mt-1" />
                </div>
              </div>
            </div>

            {/* ── Vendor Cost Breakdown (Admin Only) ── */}
            <div className="border border-primary/20 rounded-xl p-5 bg-primary/[0.025]">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-primary/15">
                <span className="text-primary"><Tag className="w-4 h-4" /></span>
                <p className="text-sm font-bold">Vendor Cost Breakdown</p>
                <AdminBadge />
              </div>

              <p className="text-xs text-muted-foreground mb-3">
                Blank garment and print costs are <strong>per item</strong> — multiplied by total qty. Setup, shipping, and other fees are flat totals.
              </p>

              <div className="grid sm:grid-cols-3 gap-3 mb-4">
                {[
                  { k: 'blank_garment_cost', lbl: 'Blank Garment ($/ea)' },
                  { k: 'print_cost', lbl: 'Print Cost ($/ea)' },
                  { k: 'setup_fee', lbl: 'Setup Fee (flat $)' },
                  { k: 'shipping_cost', lbl: 'Shipping Estimate (flat $)' },
                  { k: 'other_fees', lbl: 'Other Fees (flat $)' },
                  { k: 'customer_paid_total', lbl: 'Customer Sell Price (total $)' },
                ].map(({ k, lbl }) => (
                  <div key={k}>
                    <Label className="text-xs text-muted-foreground">{lbl}</Label>
                    <Input type="number" step="0.01" min="0"
                      value={form[k] === 0 ? '0' : (form[k] || '')}
                      onChange={setNum(k)}
                      className="mt-1 text-right" />
                  </div>
                ))}
              </div>

              {(form.garment_brand || form.turnaround_time || form.minimum_order_quantity) && (
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-3 bg-muted/30 rounded-lg px-3 py-2">
                  {form.garment_brand && <span>Brand: <strong className="text-foreground">{form.garment_brand}</strong></span>}
                  {form.garment_style_number && <span>Style: <strong className="text-foreground">#{form.garment_style_number}</strong></span>}
                  {form.turnaround_time && <span><Clock className="w-3 h-3 inline mr-1" />Turnaround: <strong className="text-foreground">{form.turnaround_time}</strong></span>}
                  {form.minimum_order_quantity && <span>Min Qty: <strong className="text-foreground">{form.minimum_order_quantity}</strong></span>}
                </div>
              )}

              {/* Live quantity-aware profit summary */}
              <div className="bg-white rounded-xl border border-border p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted-foreground mb-3 border-b pb-3">
                  <div className="flex justify-between">
                    <span>{totalQty} × blank:</span>
                    <strong className="text-red-600">${blankTotal.toFixed(2)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>{totalQty} × print:</span>
                    <strong className="text-red-600">${printTotal.toFixed(2)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Setup + Ship + Other:</span>
                    <strong className="text-red-600">${(flatSetup + flatShipping + flatOther).toFixed(2)}</strong>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center mb-3">
                  <div className="bg-red-50 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Total Cost</p>
                    <p className="font-bold text-red-600">${totalVendorCost.toFixed(2)}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Revenue</p>
                    <p className="font-bold text-green-700">${revenue.toFixed(2)}</p>
                  </div>
                  <div className={`rounded-lg p-2 ${profit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                    <p className="text-xs text-muted-foreground">Est. Profit</p>
                    <p className={`font-bold ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>${profit.toFixed(2)}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Profit / Item</p>
                    <p className={`font-bold ${profitPerItem >= 0 ? 'text-green-700' : 'text-red-600'}`}>${profitPerItem.toFixed(2)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-sm font-semibold">Margin: {margin.toFixed(1)}%</span>
                  <MarginBadge margin={margin} size="sm" />
                </div>
              </div>
            </div>

          </div>
        </form>

        {/* Sticky Footer */}
        <div className="shrink-0 border-t border-border bg-background px-6 py-4 flex gap-3 rounded-b-2xl">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 bg-primary gap-2 font-semibold" disabled={saving} onClick={handleSubmit}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
            Create Vendor Order
          </Button>
        </div>
      </div>
    </div>
  );
}