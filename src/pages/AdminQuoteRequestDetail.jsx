import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft, User, Shirt, FileImage, Truck, Calculator, MessageSquare,
  CheckCircle2, Loader2, Upload, Package, AlertTriangle, X, ExternalLink,
  Mail, Copy,
} from 'lucide-react';
import MarginBadge from '@/components/profit/MarginBadge';
import { STATUSES as ALL_STATUSES, STATUS_MAP } from './AdminQuoteRequests';
import { PRODUCT_LABELS, CONTACT_LABELS } from './AdminQuoteRequests';
import ConvertToOrderModal from '@/components/orders/ConvertToOrderModal';
import MessageTemplateModal from '@/components/messages/MessageTemplateModal';
import { toast } from 'sonner';

const STATUSES = ALL_STATUSES;


const PRINT_LABELS = {
  dtf: 'DTF (Direct to Film)', screen_print: 'Screen Print',
  vinyl: 'Vinyl', embroidery: 'Embroidery', not_sure: 'Not Sure',
};

const ARTWORK_STATUS_LABELS = {
  print_ready: 'Has print-ready artwork',
  have_logo_need_help: 'Has logo, needs help',
  only_idea: 'Only has an idea',
  need_design_help: 'Needs design help',
};

const PRINT_COLORS_LABELS = {
  '1_color': '1 Color', '2_colors': '2 Colors', full_color: 'Full Color', not_sure: 'Not Sure',
};

const GARMENT_KNOWLEDGE_LABELS = {
  picked_from_shop: 'Picked from Shop',
  need_help_choosing: 'Needs Help Choosing',
  have_own_garment: 'Customer Has Own Garment',
};

const BUDGET_LABELS = {
  under_100: 'Under $100', '100_250': '$100 – $250', '250_500': '$250 – $500',
  '500_1000': '$500 – $1,000', '1000_2500': '$1,000 – $2,500',
  '2500_5000': '$2,500 – $5,000', '5000_plus': '$5,000+',
};

function calcProfit(d) {
  const cost = (Number(d.blank_garment_cost)||0) + (Number(d.print_cost)||0) +
    (Number(d.shipping_cost_vendor)||0) + (Number(d.setup_fee)||0) + (Number(d.other_fees)||0);
  const revenue = Number(d.customer_quote_price) || 0;
  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  return { cost, profit, margin };
}

export default function AdminQuoteRequestDetail() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  const [form, setForm] = useState(null);
  const [uploadingMockup, setUploadingMockup] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState(null);

  const { data: request, isLoading } = useQuery({
    queryKey: ['quote_request', id],
    queryFn: () => base44.entities.QuoteRequest.list('-created_date').then(list => list.find(r => r.id === id)),
    enabled: !!id,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  useEffect(() => {
    if (request && !form) setForm({ ...request });
  }, [request]);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.QuoteRequest.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quote_requests'] });
      qc.invalidateQueries({ queryKey: ['quote_request', id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const canConvert = form && ['approved', 'quote_sent'].includes(form.status) && !form.converted_order_id;

  const handleMockupUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingMockup(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(f => ({ ...f, admin_mockup_url: file_url }));
    } finally {
      setUploadingMockup(false);
    }
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const saveChanges = () => {
    if (!form) return;
    const { cost, profit, margin } = calcProfit(form);
    updateMutation.mutate({
      status: form.status,
      assigned_vendor_id: form.assigned_vendor_id,
      assigned_vendor_name: form.assigned_vendor_name,
      blank_garment_cost: form.blank_garment_cost,
      print_cost: form.print_cost,
      shipping_cost_vendor: form.shipping_cost_vendor,
      setup_fee: form.setup_fee,
      other_fees: form.other_fees,
      vendor_estimate_total: cost,
      customer_quote_price: form.customer_quote_price,
      estimated_profit: profit,
      profit_margin_pct: margin,
      admin_notes: form.admin_notes,
      admin_mockup_url: form.admin_mockup_url,
      quote_response_sent: form.quote_response_sent,
    });
  };

  const quickStatus = (status) => {
    setForm(f => ({ ...f, status }));
    const { cost, profit, margin } = calcProfit(form || {});
    updateMutation.mutate({ status, estimated_profit: profit, profit_margin_pct: margin, vendor_estimate_total: cost });
  };

  if (!id) return <div className="p-8 text-center text-muted-foreground">No quote request selected.</div>;
  if (isLoading || !form) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  const { cost, profit, margin } = calcProfit(form);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-5 px-4 md:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <Link to="/AdminQuoteRequests">
              <Button variant="ghost" size="sm" className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 gap-1.5 -ml-2">
                <ArrowLeft className="w-4 h-4" />Back to Quote Requests
              </Button>
            </Link>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-extrabold">{form.full_name}</h1>
              <p className="text-primary-foreground/70 text-sm mt-0.5">
                {form.email} · {form.phone || 'No phone'} · Submitted {form.created_date ? new Date(form.created_date).toLocaleDateString() : '—'}
              </p>
            </div>
            <Badge className={`text-sm px-3 py-1 mt-1 ${STATUS_MAP[form.status]?.color || 'bg-gray-100 text-gray-700'}`}>
              {STATUS_MAP[form.status]?.label || form.status}
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 space-y-6">

        {/* Quick Action Buttons */}
        <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Quick Actions</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={saveChanges} disabled={updateMutation.isPending}
              className="bg-primary hover:bg-primary/90 gap-2">
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {saved ? 'Saved!' : 'Save Changes'}
            </Button>
            {form.status !== 'waiting_on_customer' && (
              <Button size="sm" variant="outline" onClick={() => quickStatus('waiting_on_customer')} className="gap-2">
                <AlertTriangle className="w-4 h-4" />Waiting on Customer
              </Button>
            )}
            {form.status !== 'approved' && (
              <Button size="sm" variant="outline" onClick={() => quickStatus('approved')} className="gap-2 border-green-300 text-green-700 hover:bg-green-50">
                <CheckCircle2 className="w-4 h-4" />Mark Approved
              </Button>
            )}
            {form.status !== 'declined' && (
              <Button size="sm" variant="outline" onClick={() => quickStatus('declined')} className="gap-2 border-red-300 text-red-700 hover:bg-red-50">
                <X className="w-4 h-4" />Mark Declined
              </Button>
            )}
            {form.status !== 'quote_sent' && (
              <Button size="sm" variant="outline" onClick={() => quickStatus('quote_sent')} className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50">
                <MessageSquare className="w-4 h-4" />Mark Quote Sent
              </Button>
            )}
            {canConvert && (
              <Button size="sm" disabled title="Convert to Order — coming soon"
                className="bg-gray-200 text-gray-400 cursor-not-allowed gap-2" onClick={() => {}}>
                <Package className="w-4 h-4" />Convert to Order (Coming Soon)
              </Button>
            )}
            {form.converted_order_id && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-sm text-green-700 font-medium">
                  <CheckCircle2 className="w-4 h-4" />Converted — Order #{form.converted_order_id.slice(-6).toUpperCase()}
                </div>
                <a href={`/AdminOrderDetail?order_id=${form.converted_order_id}`}
                  className="flex items-center gap-1 text-sm text-primary hover:underline font-medium">
                  View Customer Order →
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left column: customer info + project info + files */}
          <div className="lg:col-span-2 space-y-6">

            {/* Customer Info */}
            <Section title="Customer Information" icon={<User className="w-4 h-4" />}>
              <InfoGrid items={[
                ['Full Name', form.full_name],
                ['Email', form.email],
                ['Phone', form.phone],
                ['Business / Brand', form.business_name],
                ['Preferred Contact', CONTACT_LABELS[form.preferred_contact] || form.preferred_contact],
                ['Submitted', form.created_date ? new Date(form.created_date).toLocaleString() : '—'],
              ]} />
            </Section>

            {/* Project Details */}
            <Section title="Project Details" icon={<Shirt className="w-4 h-4" />}>
              {form.what_to_print && (
                <div className="bg-muted/30 rounded-xl p-3 mb-3">
                  <p className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-wide">What to Print</p>
                  <p className="text-sm">{form.what_to_print}</p>
                </div>
              )}
              <InfoGrid items={[
                ['Product Type', PRODUCT_LABELS[form.product_type] || form.product_type],
                ['Garment Knowledge', GARMENT_KNOWLEDGE_LABELS[form.garment_knowledge] || form.garment_knowledge],
                ['Preferred Garment/Style', form.preferred_garment_style],
                ['Quantity', form.quantity],
                ['Sizes Needed', form.sizes_needed],
                ['Colors Needed', form.garment_colors],
                ['Print Placement', (form.print_placement || []).join(', ')],
                ['Print Colors', PRINT_COLORS_LABELS[form.print_colors] || form.print_colors],
                ['Print Method', PRINT_LABELS[form.print_method] || form.print_method],
                ['Artwork Status', ARTWORK_STATUS_LABELS[form.artwork_status] || form.artwork_status],
                ['Date Needed By', form.date_needed],
              ]} />
              {form.project_notes && (
                <div className="bg-muted/30 rounded-xl p-3 mt-3">
                  <p className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-wide">Project Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{form.project_notes}</p>
                </div>
              )}
            </Section>

            {/* Artwork & Files */}
            <Section title="Artwork & Files" icon={<FileImage className="w-4 h-4" />}>
              <div className="flex flex-wrap gap-3 mb-3">
                {form.artwork_file_url && (
                  <a href={form.artwork_file_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-sm text-primary font-medium hover:bg-primary/10">
                    <FileImage className="w-4 h-4" />View Artwork
                  </a>
                )}
                {form.mockup_file_url && (
                  <a href={form.mockup_file_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-sm text-primary font-medium hover:bg-primary/10">
                    <FileImage className="w-4 h-4" />Customer Mockup
                  </a>
                )}
                {form.artwork_link && (
                  <a href={form.artwork_link} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-sm font-medium hover:bg-muted/70">
                    <ExternalLink className="w-4 h-4" />Artwork Link
                  </a>
                )}
              </div>
              {form.needs_artwork_help && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm font-medium text-yellow-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />Customer requested artwork preparation help
                </div>
              )}
              {!form.artwork_file_url && !form.mockup_file_url && !form.artwork_link && (
                <p className="text-sm text-muted-foreground">No artwork files submitted.</p>
              )}
            </Section>

            {/* Shipping */}
            <Section title="Shipping & Pickup" icon={<Truck className="w-4 h-4" />}>
              {form.local_pickup ? (
                <div className="text-sm text-green-700 font-medium bg-green-50 rounded-lg px-3 py-2 inline-block">
                  ✓ Local Pickup Requested
                </div>
              ) : (
                <InfoGrid items={[
                  ['Street', form.shipping_street],
                  ['City', form.shipping_city],
                  ['State', form.shipping_state],
                  ['ZIP', form.shipping_zip],
                ]} />
              )}
              {form.delivery_notes && (
                <div className="bg-muted/30 rounded-xl p-3 mt-3 text-sm">{form.delivery_notes}</div>
              )}
            </Section>
          </div>

          {/* Right column: admin tools */}
          <div className="space-y-6">

            {/* Status & Vendor */}
            <Section title="Quote Management" icon={<MessageSquare className="w-4 h-4" />} adminOnly>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Status</Label>
                  <Select value={form.status} onValueChange={v => set('status', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Assign Vendor</Label>
                  <Select value={form.assigned_vendor_id || ''} onValueChange={v => {
                    const vendor = vendors.find(vn => vn.id === v);
                    set('assigned_vendor_id', v);
                    set('assigned_vendor_name', vendor?.name || '');
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                    <SelectContent>
                      {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {form.assigned_vendor_name && (
                    <p className="text-xs text-muted-foreground">Assigned: {form.assigned_vendor_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 bg-muted/30 rounded-xl p-3">
                  <input type="checkbox" id="qr-sent" checked={form.quote_response_sent || false}
                    onChange={e => set('quote_response_sent', e.target.checked)}
                    className="w-4 h-4 accent-primary" />
                  <label htmlFor="qr-sent" className="text-xs font-medium cursor-pointer">Quote response sent to customer</label>
                </div>
              </div>
            </Section>

            {/* Profit Calculator */}
            <Section title="Profit Calculator" icon={<Calculator className="w-4 h-4" />} adminOnly>
              <div className="space-y-2.5">
                {[
                  { key: 'blank_garment_cost', label: 'Blank Garment Cost ($)' },
                  { key: 'print_cost', label: 'Print Cost ($)' },
                  { key: 'setup_fee', label: 'Setup Fee ($)' },
                  { key: 'shipping_cost_vendor', label: 'Shipping Estimate ($)' },
                  { key: 'other_fees', label: 'Other Fees ($)' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">{label}</Label>
                    <Input type="number" step="0.01" min="0"
                      value={form[key] || ''}
                      onChange={e => set(key, parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm w-28 text-right" />
                  </div>
                ))}
                <div className="border-t border-border pt-2">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className="text-xs font-bold">Total Vendor Cost</p>
                    <p className="text-sm font-bold text-red-600">${cost.toFixed(2)}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Customer Quote Price ($)</Label>
                  <Input type="number" step="0.01" min="0"
                    value={form.customer_quote_price || ''}
                    onChange={e => set('customer_quote_price', parseFloat(e.target.value) || 0)}
                    className="h-9 text-sm font-semibold border-primary/30" />
                </div>
                <div className="bg-white rounded-xl border border-border p-3 mt-1">
                  <div className="grid grid-cols-2 gap-2 text-center mb-2">
                    <div className="bg-muted/30 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">Est. Profit</p>
                      <p className={`font-bold text-sm ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>${profit.toFixed(2)}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">Margin</p>
                      <p className={`font-bold text-sm ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>{margin.toFixed(1)}%</p>
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <MarginBadge margin={margin} size="sm" />
                  </div>
                </div>
              </div>
            </Section>

            {/* Internal Notes */}
            <Section title="Internal Notes" icon={<MessageSquare className="w-4 h-4" />} adminOnly>
              <Textarea
                value={form.admin_notes || ''}
                onChange={e => set('admin_notes', e.target.value)}
                placeholder="Internal notes — customers will never see this…"
                rows={4}
                className="text-sm"
              />
            </Section>

            {/* Admin Mockup */}
            <Section title="Admin Mockup" icon={<FileImage className="w-4 h-4" />} adminOnly>
              <label className="flex items-center gap-2 border-2 border-dashed border-border rounded-xl p-3 cursor-pointer hover:border-primary transition-colors">
                <Upload className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-muted-foreground">
                  {uploadingMockup ? 'Uploading…' : form.admin_mockup_url ? '✓ Mockup uploaded' : 'Upload admin mockup'}
                </span>
                <input type="file" className="hidden" accept=".png,.jpg,.jpeg,.pdf" onChange={handleMockupUpload} />
              </label>
              {form.admin_mockup_url && (
                <a href={form.admin_mockup_url} target="_blank" rel="noreferrer"
                  className="mt-2 flex items-center gap-2 text-xs text-primary hover:underline">
                  <ExternalLink className="w-3 h-3" />View uploaded mockup
                </a>
              )}
            </Section>

            {/* Quote Message Templates */}
            <Section title="Quote Message Templates" icon={<Mail className="w-4 h-4" />} adminOnly>
              <div className="space-y-2">
                <Button size="sm" variant="outline" className="w-full justify-start gap-2" onClick={() => {
                  setActiveTemplate('quote_received');
                }}>
                  <Mail className="w-4 h-4 text-blue-500" />
                  <span>Generate Quote Received Message</span>
                </Button>
                <Button size="sm" variant="outline" className="w-full justify-start gap-2" onClick={() => {
                  setActiveTemplate('quote_sent');
                }}>
                  <Mail className="w-4 h-4 text-purple-500" />
                  <span>Generate Quote Follow-Up Message</span>
                </Button>
                <Button size="sm" variant="outline" className="w-full justify-start gap-2" onClick={() => {
                  navigator.clipboard.writeText(form.email || '');
                  toast.success('Email copied: ' + form.email);
                }}>
                  <Copy className="w-4 h-4" />
                  <span>Copy Customer Email</span>
                </Button>
              </div>
            </Section>

            {/* Navigation buttons */}
            <div className="space-y-2">
              <Link to="/AdminQuoteRequests">
                <Button size="sm" variant="outline" className="w-full gap-2">
                  <ArrowLeft className="w-4 h-4" />Back to Quote Requests
                </Button>
              </Link>
              <Link to="/AdminInbox">
                <Button size="sm" variant="outline" className="w-full gap-2">
                  <ArrowLeft className="w-4 h-4" />Back to Inbox
                </Button>
              </Link>
              <Link to="/AdminDashboard">
                <Button size="sm" variant="outline" className="w-full gap-2">
                  <ArrowLeft className="w-4 h-4" />Back to Admin Dashboard
                </Button>
              </Link>
            </div>

            {/* Save */}
            <Button onClick={saveChanges} disabled={updateMutation.isPending} className="w-full bg-primary hover:bg-primary/90 gap-2 h-11">
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {saved ? '✓ Changes Saved!' : 'Save All Changes'}
            </Button>
          </div>
        </div>
      </div>

      {showConvertModal && form && (
        <ConvertToOrderModal
          quote={{ ...form, _entityType: 'QuoteRequest' }}
          onClose={() => setShowConvertModal(false)}
          onConverted={(order) => {
            setShowConvertModal(false);
            setForm(f => ({ ...f, status: 'converted_to_order', converted_order_id: order.id }));
            qc.invalidateQueries({ queryKey: ['quote_requests'] });
            qc.invalidateQueries({ queryKey: ['quote_request', id] });
          }}
        />
      )}

      {activeTemplate && form && (
        <MessageTemplateModal
          templateKey={activeTemplate}
          vars={{
            customer_name: form.full_name || '',
            customer_email: form.email || '',
            project_type: PRODUCT_LABELS[form.product_type] || form.product_type || '—',
            quantity: form.quantity ? String(form.quantity) : '—',
            garment_style: form.preferred_garment_style || GARMENT_KNOWLEDGE_LABELS[form.garment_knowledge] || '—',
            sizes_needed: form.sizes_needed || '—',
            colors_needed: form.garment_colors || '—',
            print_method: PRINT_LABELS[form.print_method] || form.print_method || '—',
            artwork_status: ARTWORK_STATUS_LABELS[form.artwork_status] || form.artwork_status || '—',
            deadline: form.date_needed || '—',
            quote_total: form.customer_quote_price ? `$${Number(form.customer_quote_price).toFixed(2)}` : '—',
            quote_notes: form.admin_notes || form.project_notes || '',
          }}
          onClose={() => setActiveTemplate(null)}
        />
      )}
    </div>
  );
}

function Section({ title, icon, children, adminOnly = false }) {
  return (
    <div className={`bg-white border rounded-2xl p-4 shadow-sm ${adminOnly ? 'border-primary/20 bg-primary/[0.02]' : 'border-border'}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`${adminOnly ? 'text-primary' : 'text-muted-foreground'}`}>{icon}</div>
        <p className="text-sm font-bold text-foreground">{title}</p>
        {adminOnly && <span className="ml-auto text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">Admin Only</span>}
      </div>
      {children}
    </div>
  );
}

function InfoGrid({ items }) {
  const visible = items.filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (visible.length === 0) return <p className="text-sm text-muted-foreground">No information provided.</p>;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
      {visible.map(([label, value]) => (
        <div key={label}>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-medium">{String(value)}</p>
        </div>
      ))}
    </div>
  );
}