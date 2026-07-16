import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  X, CheckCircle2, Loader2, User, Shirt, FileImage, Truck,
  Calculator, MessageSquare, Package, Pencil, AlertTriangle,
  ExternalLink, ArrowRight, Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import MarginBadge from '@/components/profit/MarginBadge';
import VendorPricingMatcher from './VendorPricingMatcher';
import ConvertToOrderModal from '@/components/orders/ConvertToOrderModal';

export const ALL_STATUSES = [
  { value: 'new',              label: 'New',                    color: 'bg-blue-100 text-blue-700' },
  { value: 'reviewing',        label: 'Reviewing',              color: 'bg-yellow-100 text-yellow-700' },
  { value: 'need_more_info',   label: 'Need More Info',         color: 'bg-orange-100 text-orange-700' },
  { value: 'waiting_on_vendor',label: 'Waiting on Vendor Est.', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'quote_ready',      label: 'Quote Ready',            color: 'bg-teal-100 text-teal-700' },
  { value: 'sent',             label: 'Quote Sent',             color: 'bg-purple-100 text-purple-700' },
  { value: 'approved',         label: 'Approved',               color: 'bg-green-100 text-green-800' },
  { value: 'declined',         label: 'Declined',               color: 'bg-red-100 text-red-700' },
  { value: 'converted_to_order','label': 'Converted to Order',  color: 'bg-violet-100 text-violet-700' },
  { value: 'draft',            label: 'Draft',                  color: 'bg-gray-100 text-gray-600' },
];
export const STATUS_MAP = Object.fromEntries(ALL_STATUSES.map(s => [s.value, s]));

const CONTACT_LABELS = { email: 'Email', phone: 'Phone Call', text: 'Text' };
const BUDGET_LABELS = {
  under_100: 'Under $100', '100_250': '$100–$250', '250_500': '$250–$500',
  '500_1000': '$500–$1K', '1000_2500': '$1K–$2.5K', '2500_5000': '$2.5K–$5K', '5000_plus': '$5K+',
};
const QUICK_STATUSES = ['reviewing', 'need_more_info', 'waiting_on_vendor', 'quote_ready', 'sent', 'approved', 'declined'];

function calcProfit(f) {
  const qty = Number(f.quantity) || 1;
  const blankTotal = (Number(f.blank_garment_cost) || 0) * qty;
  const printTotal = (Number(f.print_cost) || 0) * qty;
  const setupFee = Number(f.setup_fee) || 0;
  const shipping = Number(f.shipping_cost) || 0;
  const otherFees = Number(f.other_fees) || 0;
  const vendorEst = Number(f.vendor_estimate) || 0;
  const totalCost = blankTotal + printTotal + setupFee + shipping + otherFees + vendorEst;
  const revenue = (Number(f.my_selling_price) || 0) * qty;
  const profit = revenue - totalCost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const profitPerItem = qty > 0 ? profit / qty : 0;
  return { blankTotal, printTotal, totalCost, revenue, profit, margin, profitPerItem, qty };
}

// ── Panel Shell ────────────────────────────────────────────────────────────────
export default function QuoteDetailPanel({ quote: initialQuote, onClose, onUpdated, qc }) {
  const [q, setQ] = useState({ ...initialQuote });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);

  // Keep local state in sync when parent passes a fresh quote
  useEffect(() => { setQ({ ...initialQuote }); }, [initialQuote?.id]);

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const set = (key, val) => setQ(prev => ({ ...prev, [key]: val }));
  const calc = calcProfit(q);

  const handleApplyVendorPricing = (pricing) => {
    setQ(prev => ({
      ...prev,
      blank_garment_cost: pricing.blank_garment_cost ?? prev.blank_garment_cost,
      print_cost: pricing.print_cost ?? prev.print_cost,
      setup_fee: pricing.setup_fee ?? prev.setup_fee,
      shipping_cost: pricing.shipping_cost ?? prev.shipping_cost,
      vendor_estimate_total: pricing.vendor_estimate_total ?? prev.vendor_estimate_total,
      _turnaround: pricing._turnaround || prev._turnaround,
      _moq: pricing._moq || prev._moq,
    }));
  };

  const save = async (extraFields = {}) => {
    setSaving(true);
    const { profit, margin } = calcProfit(q);
    const payload = {
      status: q.status,
      assigned_vendor_id: q.assigned_vendor_id || '',
      assigned_vendor_name: q.assigned_vendor_name || '',
      blank_garment_cost: Number(q.blank_garment_cost) || 0,
      print_cost: Number(q.print_cost) || 0,
      setup_fee: Number(q.setup_fee) || 0,
      shipping_cost: Number(q.shipping_cost) || 0,
      other_fees: Number(q.other_fees) || 0,
      vendor_estimate: Number(q.vendor_estimate) || 0,
      my_selling_price: Number(q.my_selling_price) || 0,
      estimated_profit: profit,
      profit_margin_pct: margin,
      admin_notes: q.admin_notes || '',
      vendor_notes: q.vendor_notes || '',
      quote_response_message: q.quote_response_message || '',
      ...extraFields,
    };
    await base44.entities.Quote.update(q.id, payload);
    qc.invalidateQueries({ queryKey: ['quotes'] });
    const updated = { ...q, ...payload };
    setQ(updated);
    if (onUpdated) onUpdated(updated);
    setSaving(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
  };

  const quickStatus = async (status) => {
    setQ(prev => ({ ...prev, status }));
    await base44.entities.Quote.update(q.id, { status });
    qc.invalidateQueries({ queryKey: ['quotes'] });
    toast.success(`Marked: ${STATUS_MAP[status]?.label || status}`);
  };

  const sendResponse = async () => {
    setQ(prev => ({ ...prev, status: 'sent' }));
    await base44.entities.Quote.update(q.id, { status: 'sent', quote_response_message: q.quote_response_message || '' });
    qc.invalidateQueries({ queryKey: ['quotes'] });
    toast.success('Quote marked as Sent. Response message saved.');
  };

  const canConvert = ['approved', 'sent'].includes(q.status) && !q.converted_order_id;

  const s = STATUS_MAP[q.status] || STATUS_MAP['draft'];

  return (
    // Full-screen overlay slide-in panel
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 cursor-pointer" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-4xl bg-background flex flex-col shadow-2xl overflow-hidden">
        {/* Sticky Header */}
        <div className="bg-primary text-primary-foreground px-6 py-4 flex-shrink-0">
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-extrabold truncate">{q.customer_name}</h2>
                <Badge className={`text-xs shrink-0 ${s.color}`}>{s.label}</Badge>
              </div>
              <p className="text-primary-foreground/70 text-sm mt-0.5 truncate">
                {q.customer_email}
                {q.customer_phone ? ` · ${q.customer_phone}` : ''}
                {q.created_date ? ` · Submitted ${format(new Date(q.created_date), 'MMM d, yyyy')}` : ''}
              </p>
            </div>
            <button onClick={onClose}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-primary-foreground/15 hover:bg-primary-foreground/30 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick action buttons */}
          <div className="flex flex-wrap gap-2 mt-3">
            <Button size="sm" onClick={() => save()} disabled={saving}
              className="bg-accent text-accent-foreground hover:bg-accent/90 gap-1.5 h-8">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {savedMsg ? '✓ Saved!' : 'Save Changes'}
            </Button>
            {QUICK_STATUSES.filter(sv => sv !== q.status).map(sv => (
              <Button key={sv} size="sm" onClick={() => quickStatus(sv)}
                className="bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25 border-0 text-xs h-8">
                {STATUS_MAP[sv]?.label}
              </Button>
            ))}
            {canConvert && (
              <Button size="sm" onClick={() => setShowConvertModal(true)}
                className="bg-green-500 hover:bg-green-600 text-white gap-1.5 h-8">
                <Package className="w-3.5 h-3.5" />Convert to Order
              </Button>
            )}
          </div>

          {q.converted_order_id && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <div className="bg-green-900/30 border border-green-400/30 rounded-lg px-3 py-1.5 text-xs text-green-200 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" />Converted — Order #{q.converted_order_id.slice(-6).toUpperCase()}
              </div>
              <a href={`/AdminOrderDetail?order_id=${q.converted_order_id}`}
                className="flex items-center gap-1.5 text-xs text-green-200 hover:text-white underline underline-offset-2">
                <ArrowRight className="w-3 h-3" />View Customer Order
              </a>
            </div>
          )}
        </div>

        {/* Convert to Order Modal */}
        {showConvertModal && (
          <ConvertToOrderModal
            quote={{ ...q, _entityType: 'QuoteRequest' }}
            onClose={() => setShowConvertModal(false)}
            onConverted={(order) => {
              setShowConvertModal(false);
              setQ(prev => ({ ...prev, status: 'converted_to_order', converted_order_id: order.id }));
              qc.invalidateQueries({ queryKey: ['quotes'] });
              if (onUpdated) onUpdated({ ...q, status: 'converted_to_order', converted_order_id: order.id });
              toast.success('Order created! Check Admin Orders.');
            }}
          />
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            <div className="grid lg:grid-cols-2 gap-6">
              {/* ── Left: customer info ── */}
              <div className="space-y-5">

                <PanelSection title="Customer Information" icon={<User className="w-4 h-4" />}>
                  <InfoGrid items={[
                    ['Full Name', q.customer_name],
                    ['Email', q.customer_email],
                    ['Phone', q.customer_phone],
                    ['Business / Brand', q.business_name],
                    ['Preferred Contact', CONTACT_LABELS[q.preferred_contact] || q.preferred_contact],
                    ['Date Submitted', q.created_date ? format(new Date(q.created_date), 'MMM d, yyyy h:mm a') : '—'],
                  ]} />
                </PanelSection>

                <PanelSection title="Project Details" icon={<Shirt className="w-4 h-4" />}>
                  {q.description && (
                    <div className="bg-muted/30 rounded-lg p-3 mb-3 text-sm text-foreground leading-relaxed">{q.description}</div>
                  )}
                  <InfoGrid items={[
                    ['Product / Garment', q.product_type || q.garment_type],
                    ['Quantity', q.quantity],
                    ['Sizes', q.sizes || q.sizes_needed],
                    ['Colors', q.colors || q.garment_colors],
                    ['Print Method', q.print_method],
                    ['Print Placement', Array.isArray(q.print_placement) ? q.print_placement.join(', ') : q.print_placement],
                    ['# Print Locations', q.print_locations || q.num_print_locations],
                    ['Date Needed By', q.date_needed],
                    ['Budget Range', BUDGET_LABELS[q.budget_range] || q.budget_range],
                  ]} />
                  {(q.project_notes || q.what_to_print) && (
                    <div className="bg-muted/30 rounded-lg p-3 mt-3 text-sm whitespace-pre-wrap leading-relaxed">
                      {q.what_to_print ? <><strong className="text-xs uppercase tracking-wide text-muted-foreground block mb-1">What to Print</strong>{q.what_to_print}</> : null}
                      {q.project_notes ? <><strong className="text-xs uppercase tracking-wide text-muted-foreground block mb-1 mt-2">Project Notes</strong>{q.project_notes}</> : null}
                    </div>
                  )}
                </PanelSection>

                {/* Files */}
                <PanelSection title="Artwork & Files" icon={<FileImage className="w-4 h-4" />}>
                  <div className="flex flex-wrap gap-2">
                    {(q.file_url || q.artwork_file_url) && (
                      <a href={q.file_url || q.artwork_file_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-sm text-primary font-medium hover:bg-primary/10">
                        <FileImage className="w-3.5 h-3.5" />View Artwork
                      </a>
                    )}
                    {q.mockup_file_url && (
                      <a href={q.mockup_file_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-sm text-primary font-medium hover:bg-primary/10">
                        <FileImage className="w-3.5 h-3.5" />Customer Mockup
                      </a>
                    )}
                    {q.artwork_link && (
                      <a href={q.artwork_link} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 bg-muted rounded-lg text-sm font-medium hover:bg-muted/70">
                        <ExternalLink className="w-3.5 h-3.5" />Artwork Link
                      </a>
                    )}
                    {!q.file_url && !q.artwork_file_url && !q.mockup_file_url && !q.artwork_link && (
                      <p className="text-sm text-muted-foreground">No artwork files submitted.</p>
                    )}
                  </div>
                  {q.needs_artwork_help && (
                    <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />Customer requested artwork help
                    </div>
                  )}
                </PanelSection>

                {/* Shipping */}
                <PanelSection title="Shipping & Pickup" icon={<Truck className="w-4 h-4" />}>
                  {q.local_pickup ? (
                    <div className="text-sm text-green-700 font-medium bg-green-50 rounded-lg px-3 py-2 inline-block">✓ Local Pickup Requested</div>
                  ) : (
                    <InfoGrid items={[
                      ['Street', q.shipping_street],
                      ['City', q.shipping_city],
                      ['State', q.shipping_state],
                      ['ZIP', q.shipping_zip],
                    ]} />
                  )}
                  {q.delivery_notes && (
                    <div className="bg-muted/30 rounded-lg p-3 mt-3 text-sm">{q.delivery_notes}</div>
                  )}
                  {!q.local_pickup && !q.shipping_street && !q.delivery_notes && (
                    <p className="text-sm text-muted-foreground">No shipping info provided.</p>
                  )}
                </PanelSection>
              </div>

              {/* ── Right: admin tools ── */}
              <div className="space-y-5">

                <PanelSection title="Quote Management" icon={<MessageSquare className="w-4 h-4" />} adminOnly>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs font-semibold">Status</Label>
                      <Select value={q.status || 'draft'} onValueChange={v => set('status', v)}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ALL_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Assign Vendor</Label>
                      <Select value={q.assigned_vendor_id || ''} onValueChange={v => {
                        const vendor = vendors.find(vn => vn.id === v);
                        set('assigned_vendor_id', v);
                        set('assigned_vendor_name', vendor?.name || '');
                      }}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Select vendor…" /></SelectTrigger>
                        <SelectContent>
                          {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </PanelSection>

                {/* Vendor Pricing Matcher — shown when vendor is assigned */}
                {q.assigned_vendor_id && (
                  <PanelSection title="Vendor Pricing Match" icon={<Tag className="w-4 h-4" />} adminOnly>
                    <VendorPricingMatcher
                      quote={q}
                      vendorId={q.assigned_vendor_id}
                      vendorName={q.assigned_vendor_name}
                      onApplyPricing={handleApplyVendorPricing}
                    />
                  </PanelSection>
                )}

                <PanelSection title="Profit Calculator" icon={<Calculator className="w-4 h-4" />} adminOnly>
                  <div className="space-y-2.5">
                    {/* Per-item cost inputs */}
                    <p className="text-xs text-muted-foreground font-medium">Cost inputs are <strong>per item</strong> except Setup Fee, Shipping, and Other Fees (flat).</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { k: 'blank_garment_cost', label: 'Blank Garment ($/ea)' },
                        { k: 'print_cost', label: 'Print Cost ($/ea)' },
                        { k: 'setup_fee', label: 'Setup Fee ($)' },
                        { k: 'shipping_cost', label: 'Shipping ($)' },
                        { k: 'other_fees', label: 'Other Fees ($)' },
                        { k: 'vendor_estimate', label: 'Additional Vendor Est. ($)' },
                      ].map(({ k, label }) => (
                        <div key={k}>
                          <Label className="text-xs text-muted-foreground">{label}</Label>
                          <Input type="number" step="0.01" min="0"
                            value={q[k] || ''}
                            onChange={e => set(k, parseFloat(e.target.value) || 0)}
                            className="mt-0.5 h-7 text-sm text-right" />
                        </div>
                      ))}
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Customer Sell Price ($/ea) *</Label>
                      <Input type="number" step="0.01" min="0"
                        value={q.my_selling_price || ''}
                        onChange={e => set('my_selling_price', parseFloat(e.target.value) || 0)}
                        className="mt-1 h-9 border-primary/40 font-semibold text-right" />
                    </div>

                    {/* Live calculations */}
                    {(calc.totalCost > 0 || calc.revenue > 0) && (
                      <div className="bg-muted/30 rounded-xl p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Qty</span>
                            <span className="font-medium">{calc.qty}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Blank Cost</span>
                            <span className="font-medium text-red-600">${calc.blankTotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Print Cost</span>
                            <span className="font-medium text-red-600">${calc.printTotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Vendor Cost</span>
                            <span className="font-bold text-red-700">${calc.totalCost.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Customer Revenue</span>
                            <span className="font-medium">${calc.revenue.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Profit / Item</span>
                            <span className={`font-medium ${calc.profitPerItem >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              ${calc.profitPerItem.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <div className="border-t pt-2 grid grid-cols-2 gap-2 text-center">
                          <div>
                            <p className="text-xs text-muted-foreground">Est. Profit</p>
                            <p className={`font-bold text-base ${calc.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              ${calc.profit.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Margin</p>
                            <p className="font-bold text-base">{calc.margin.toFixed(1)}%</p>
                          </div>
                        </div>
                        <div className="flex justify-center pt-1">
                          <MarginBadge margin={calc.margin} size="sm" />
                        </div>
                      </div>
                    )}

                    {/* Turnaround / MOQ from vendor pricing (display only) */}
                    {(q._turnaround || q._moq) && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800 space-y-0.5">
                        {q._moq && <div>Min Order Qty: <strong>{q._moq}</strong></div>}
                        {q._turnaround && <div>Turnaround: <strong>{q._turnaround}</strong></div>}
                      </div>
                    )}
                  </div>
                </PanelSection>

                <PanelSection title="Admin Notes" icon={<Pencil className="w-4 h-4" />} adminOnly>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Internal Notes</Label>
                      <Textarea rows={3} value={q.admin_notes || ''} onChange={e => set('admin_notes', e.target.value)}
                        placeholder="Internal notes — never visible to customer…" className="mt-1 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Vendor Notes</Label>
                      <Textarea rows={2} value={q.vendor_notes || ''} onChange={e => set('vendor_notes', e.target.value)}
                        placeholder="Notes for vendor coordination…" className="mt-1 text-sm" />
                    </div>
                  </div>
                </PanelSection>

                <PanelSection title="Customer Response Draft" icon={<MessageSquare className="w-4 h-4" />} adminOnly>
                  <p className="text-xs text-muted-foreground mb-2">
                    Draft your customer-facing quote message. Include greeting, project summary, price, turnaround, what's included, next steps, and approval instructions.
                  </p>
                  <Textarea rows={8} value={q.quote_response_message || ''}
                    onChange={e => set('quote_response_message', e.target.value)}
                    placeholder={[
                      `Hi ${q.customer_name || '[Customer Name]'},`,
                      '',
                      'Thank you for your quote request! Here is your personalized quote:',
                      '',
                      `Project: ${q.product_type || q.garment_type || '[Garment Type]'}`,
                      `Quantity: ${q.quantity || '[qty]'}`,
                      `Quote Price: $${q.my_selling_price || '[price]'}`,
                      '',
                      'Estimated Turnaround: [X business days]',
                      '',
                      "What's included:",
                      '• Blank garments',
                      '• Custom printing',
                      '• [Other inclusions]',
                      '',
                      'Next Steps:',
                      'To approve this quote, reply "APPROVED" to this message.',
                      '',
                      'Best,',
                      'HC Apparel Team',
                    ].join('\n')}
                    className="text-sm mt-1 font-mono" />
                  <Button onClick={sendResponse} className="w-full mt-3 gap-2 bg-primary hover:bg-primary/90 h-9">
                    <ArrowRight className="w-4 h-4" />Save Response &amp; Mark as Quote Sent
                  </Button>
                </PanelSection>

                <Button onClick={() => save()} disabled={saving} className="w-full bg-primary hover:bg-primary/90 gap-2 h-11">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {savedMsg ? '✓ All Changes Saved!' : 'Save All Changes'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelSection({ title, icon, children, adminOnly = false }) {
  return (
    <div className={`rounded-2xl p-4 border ${adminOnly ? 'border-primary/20 bg-primary/[0.025]' : 'border-border bg-white'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={adminOnly ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
        <p className="text-sm font-bold">{title}</p>
        {adminOnly && (
          <span className="ml-auto text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full shrink-0">
            Admin Only
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function InfoGrid({ items }) {
  const visible = items.filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'undefined');
  if (!visible.length) return <p className="text-sm text-muted-foreground">No information provided.</p>;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      {visible.map(([label, value]) => (
        <div key={label}>
          <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
          <p className="text-sm font-medium leading-snug">{String(value)}</p>
        </div>
      ))}
    </div>
  );
}