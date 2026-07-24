import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// QuoteDetailPanel renders as a full-screen slide-in panel (not a Dialog)
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Plus, Pencil, Eye, Calculator } from 'lucide-react';
import { toast } from "sonner";
import { format } from "date-fns";
import MarginBadge from '@/components/profit/MarginBadge';
import QuoteDetailPanel, { ALL_STATUSES, STATUS_MAP } from '@/components/quotes/QuoteDetailPanel';

const STATUSES = ALL_STATUSES;
const PRINT_METHODS = ['DTF','Screen Print','Embroidery','DTG','Sublimation','Vinyl','Heat Transfer','Other'];

const EMPTY = {
  customer_name: '', customer_email: '', customer_phone: '', product_type: '', garment_type: '',
  quantity: '', sizes: '', colors: '', print_method: '', print_locations: '1', description: '',
  vendor_estimate: '', my_selling_price: '', blank_garment_cost: '', print_cost: '', setup_fee: '',
  shipping_cost: '', other_fees: '', status: 'draft', admin_notes: '', vendor_notes: '',
  quote_response_message: '', file_url: '',
};

function calcProfit(f) {
  const cost =
    (Number(f.blank_garment_cost) || 0) + (Number(f.print_cost) || 0) +
    (Number(f.setup_fee) || 0) + (Number(f.shipping_cost) || 0) +
    (Number(f.other_fees) || 0) + (Number(f.vendor_estimate) || 0);
  const revenue = Number(f.my_selling_price) || 0;
  const qty = Number(f.quantity) || 1;
  const profit = (revenue * qty) - (cost * qty);
  const margin = (revenue * qty) > 0 ? (profit / (revenue * qty)) * 100 : 0;
  return { cost: cost * qty, profit, margin };
}

export default function AdminQuotes() {
  const qc = useQueryClient();
  const [detailQuote, setDetailQuote] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: () => base44.entities.Quote.list('-created_date'),
  });

  const upsertMutation = useMutation({
    mutationFn: (data) => editing
      ? base44.entities.Quote.update(editing.id, data)
      : base44.entities.Quote.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      toast.success(editing ? 'Quote updated' : 'Quote created');
      setFormOpen(false);
      setEditing(null);
    },
  });

  const n = (k) => (e) => setForm(p => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const liveCalc = calcProfit(form);

  const handleSubmit = (e) => {
    e.preventDefault();
    upsertMutation.mutate({
      ...form,
      quantity: Number(form.quantity) || 0,
      print_locations: Number(form.print_locations) || 1,
      vendor_estimate: Number(form.vendor_estimate) || 0,
      my_selling_price: Number(form.my_selling_price) || 0,
      estimated_price: Number(form.my_selling_price) || 0,
      blank_garment_cost: Number(form.blank_garment_cost) || 0,
      print_cost: Number(form.print_cost) || 0,
      setup_fee: Number(form.setup_fee) || 0,
      shipping_cost: Number(form.shipping_cost) || 0,
      other_fees: Number(form.other_fees) || 0,
      estimated_profit: liveCalc.profit,
      profit_margin_pct: liveCalc.margin,
    });
  };

  const openNew = () => { setEditing(null); setForm(EMPTY); setFormOpen(true); };
  const openEdit = (q) => {
    setEditing(q);
    setForm({ ...EMPTY, ...q, vendor_estimate: q.vendor_estimate || '', my_selling_price: q.my_selling_price || q.estimated_price || '' });
    setFormOpen(true);
  };

  const filtered = quotes.filter(q => {
    const matchStatus = statusFilter === 'all' || q.status === statusFilter;
    const matchSearch = !search || [q.customer_name, q.customer_email, q.product_type, q.garment_type]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));
    return matchStatus && matchSearch;
  });

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-6 px-4">
        <div className="container mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">Quote Requests</h1>
            <p className="text-primary-foreground/70 text-sm">Manage customer quote requests, pricing estimates, vendors, and quote approvals.</p>
          </div>
          <Button onClick={openNew} className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
            <Plus className="w-4 h-4" /> New Quote
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Filter bar */}
        <div className="bg-white rounded-2xl border shadow-sm p-4 mb-6 flex flex-wrap gap-2 items-center">
          <div className="flex flex-wrap gap-2 flex-1">
            {['all', ...STATUSES.map(s => s.value)].map(sv => {
              const s = sv === 'all' ? null : STATUS_MAP[sv];
              const count = sv === 'all' ? quotes.length : quotes.filter(q => q.status === sv).length;
              return (
                <button key={sv} onClick={() => setStatusFilter(sv)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    statusFilter === sv ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}>
                  {sv === 'all' ? 'All' : s?.label}
                  <span className="ml-1.5 text-xs opacity-70">({count})</span>
                </button>
              );
            })}
          </div>
          <Input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="w-44 h-8 text-sm" />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="animate-pulse h-40 bg-white rounded-xl" />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">{quotes.length === 0 ? 'No quotes yet' : 'No quotes match filter'}</p>
            {quotes.length === 0 && <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />Create First Quote</Button>}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    {['Customer', 'Contact', 'Product', 'Qty', 'Vendor Est.', 'Sell Price', 'Profit', 'Margin', 'Status', 'Submitted', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(q => {
                    const { cost, profit, margin } = calcProfit(q);
                    const sell = (Number(q.my_selling_price || q.estimated_price || 0)) * (Number(q.quantity) || 1);
                    const s = STATUS_MAP[q.status] || STATUS_MAP['draft'];
                    return (
                      <tr key={q.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold">{q.customer_name}</div>
                          <div className="text-xs text-muted-foreground">{q.customer_email}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {q.customer_phone && <div>{q.customer_phone}</div>}
                          {q.preferred_contact && <div className="capitalize">{q.preferred_contact}</div>}
                        </td>
                        <td className="px-4 py-3 text-sm">{q.product_type || q.garment_type || '—'}</td>
                        <td className="px-4 py-3 font-medium">{q.quantity || '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{cost > 0 ? `$${cost.toFixed(2)}` : '—'}</td>
                        <td className="px-4 py-3 font-medium">{sell > 0 ? `$${sell.toFixed(2)}` : '—'}</td>
                        <td className="px-4 py-3 font-semibold text-green-700">{profit > 0 ? `$${profit.toFixed(2)}` : '—'}</td>
                        <td className="px-4 py-3">{margin > 0 ? <MarginBadge margin={margin} size="sm" /> : '—'}</td>
                        <td className="px-4 py-3">
                          <Badge className={`text-xs ${s.color}`}>{s.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {q.created_date ? format(new Date(q.created_date), 'MMM d, yy') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setDetailQuote(q)}>
                              <Eye className="w-3.5 h-3.5" />View Details
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={() => openEdit(q)}>
                              <Pencil className="w-3.5 h-3.5" />Edit
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {detailQuote && (
        <QuoteDetailPanel
          quote={detailQuote}
          onClose={() => setDetailQuote(null)}
          onUpdated={(q) => { setDetailQuote(q); qc.invalidateQueries({ queryKey: ['quotes'] }); }}
          qc={qc}
        />
      )}

      {/* New / Edit Form Dialog */}
      <Dialog open={formOpen} onOpenChange={v => { setFormOpen(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Quote' : 'New Quote'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Customer Name *</Label>
                <Input required value={form.customer_name} onChange={n('customer_name')} placeholder="Customer name" className="mt-1" />
              </div>
              <div>
                <Label>Email *</Label>
                <Input required type="text" value={form.customer_email} onChange={n('customer_email')} placeholder="email at example.com" className="mt-1" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.customer_phone} onChange={n('customer_phone')} placeholder="+1 555 0000" className="mt-1" />
              </div>
              <div>
                <Label>Product / Garment Type</Label>
                <Input value={form.product_type || form.garment_type}
                  onChange={e => setForm(p => ({ ...p, product_type: e.target.value, garment_type: e.target.value }))}
                  placeholder="e.g. Unisex T-Shirt" className="mt-1" />
              </div>
              <div>
                <Label>Quantity</Label>
                <Input type="number" value={form.quantity} onChange={n('quantity')} placeholder="e.g. 24" className="mt-1" />
              </div>
              <div>
                <Label>Sizes</Label>
                <Input value={form.sizes} onChange={n('sizes')} placeholder="e.g. S(4), M(8), L(8)" className="mt-1" />
              </div>
              <div>
                <Label>Colors</Label>
                <Input value={form.colors} onChange={n('colors')} placeholder="e.g. Black, White" className="mt-1" />
              </div>
              <div>
                <Label>Print Method</Label>
                <Select value={form.print_method} onValueChange={n('print_method')}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{PRINT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Print Locations</Label>
                <Input type="number" value={form.print_locations} onChange={n('print_locations')} placeholder="1" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>Description / Notes</Label>
                <Textarea rows={2} value={form.description} onChange={n('description')} placeholder="Quote details, artwork notes…" className="mt-1" />
              </div>
            </div>

            {/* Pricing */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3">
              <p className="text-sm font-bold flex items-center gap-2"><Calculator className="w-4 h-4 text-primary" />Pricing (Admin Only)</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { k: 'blank_garment_cost', label: 'Blank Garment Cost ($)' },
                  { k: 'print_cost', label: 'Print Cost ($)' },
                  { k: 'setup_fee', label: 'Setup Fee ($)' },
                  { k: 'shipping_cost', label: 'Shipping ($)' },
                  { k: 'other_fees', label: 'Other Fees ($)' },
                  { k: 'vendor_estimate', label: 'Additional Vendor Est. ($)' },
                ].map(({ k, label }) => (
                  <div key={k}>
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input type="number" step="0.01" value={form[k]} onChange={n(k)} className="mt-1 h-8" placeholder="0.00" />
                  </div>
                ))}
              </div>
              <div>
                <Label className="text-xs font-semibold">Customer Sell Price ($)</Label>
                <Input type="number" step="0.01" value={form.my_selling_price} onChange={n('my_selling_price')} className="mt-1 border-primary/30" placeholder="0.00" />
              </div>
              {(liveCalc.cost > 0 || liveCalc.profit !== 0) && (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center bg-white rounded-xl p-3">
                    <div><div className="text-xs text-muted-foreground">Total Cost</div><div className="font-bold text-red-600">${liveCalc.cost.toFixed(2)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Est. Profit</div><div className={`font-bold ${liveCalc.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>${liveCalc.profit.toFixed(2)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Margin</div><div className="font-bold">{liveCalc.margin.toFixed(1)}%</div></div>
                  </div>
                  <MarginBadge margin={liveCalc.margin} />
                </>
              )}
            </div>

            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={n('status')}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.filter(s => s.value !== 'converted_to_order').map(s =>
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Admin Notes (Internal)</Label>
              <Textarea rows={2} value={form.admin_notes} onChange={n('admin_notes')} placeholder="Internal notes…" className="mt-1" />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="flex-1">Cancel</Button>
              <Button type="submit" disabled={upsertMutation.isPending} className="flex-1">
                {upsertMutation.isPending ? 'Saving…' : editing ? 'Update Quote' : 'Create Quote'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}