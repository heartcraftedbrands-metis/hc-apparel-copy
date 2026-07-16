import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, SlidersHorizontal } from 'lucide-react';
import { toast } from "sonner";

const PRINT_METHODS = [
  { value: 'dtf',           label: 'DTF' },
  { value: 'screen_print',  label: 'Screen Print' },
  { value: 'embroidery',    label: 'Embroidery' },
  { value: 'dtg',           label: 'DTG' },
  { value: 'sublimation',   label: 'Sublimation' },
  { value: 'vinyl',         label: 'Vinyl' },
  { value: 'heat_transfer', label: 'Heat Transfer' },
  { value: 'other',         label: 'Other' },
];

const PRODUCT_CATEGORIES = [
  'T-Shirts','Hoodies','Crewnecks','Long Sleeve','Hats','Polos','Jackets','Youth','Sportswear','Accessories','Other'
];

const EMPTY = {
  vendor_id: '', vendor_name: '', product_name: '', garment_brand: '', garment_style_number: '',
  product_category: '', blank_garment_cost: '', print_method: 'dtf', print_cost: '',
  setup_fee: '', shipping_cost: '', minimum_order_quantity: '', turnaround_time: '',
  size_upcharge_notes: '', color_upcharge_notes: '', notes: '', is_active: true,
};

export default function AdminVendorPricing() {
  const qc = useQueryClient();
  const location = useLocation();
  const prefilledVendorId = new URLSearchParams(location.search).get('vendor_id') || '';

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...EMPTY, vendor_id: prefilledVendorId });
  const [search, setSearch] = useState('');
  const [filterVendor, setFilterVendor] = useState(prefilledVendorId || 'all');
  const [filterMethod, setFilterMethod] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showInactive, setShowInactive] = useState(false);
  const [sortBy, setSortBy] = useState('none');

  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: () => base44.entities.Vendor.filter({ is_active: true }) });
  const { data: pricing = [], isLoading } = useQuery({ queryKey: ['vendor-pricing'], queryFn: () => base44.entities.VendorPricing.list('-created_date') });

  const upsert = useMutation({
    mutationFn: (data) => editing
      ? base44.entities.VendorPricing.update(editing.id, data)
      : base44.entities.VendorPricing.create(data),
    onSuccess: () => { qc.invalidateQueries(['vendor-pricing']); toast.success('Saved'); setOpen(false); setEditing(null); },
  });

  const del = useMutation({
    mutationFn: (id) => base44.entities.VendorPricing.delete(id),
    onSuccess: () => { qc.invalidateQueries(['vendor-pricing']); toast.success('Deleted'); },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.VendorPricing.update(id, { is_active }),
    onSuccess: () => { qc.invalidateQueries(['vendor-pricing']); },
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY, vendor_id: filterVendor !== 'all' ? filterVendor : '', vendor_name: filterVendor !== 'all' ? (vendors.find(v => v.id === filterVendor)?.name || '') : '' });
    setOpen(true);
  };
  const openEdit = (row) => { setEditing(row); setForm({ ...EMPTY, ...row }); setOpen(true); };
  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e && e.target ? e.target.value : e }));

  const totalCost = (row) => (Number(row.blank_garment_cost)||0) + (Number(row.print_cost)||0) + (Number(row.setup_fee)||0) + (Number(row.shipping_cost)||0);

  let filtered = pricing.filter(row => {
    if (!showInactive && !row.is_active) return false;
    if (filterVendor !== 'all' && row.vendor_id !== filterVendor) return false;
    if (filterMethod !== 'all' && row.print_method !== filterMethod) return false;
    if (filterCategory !== 'all' && row.product_category !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return row.vendor_name?.toLowerCase().includes(q) || row.product_name?.toLowerCase().includes(q) || row.garment_brand?.toLowerCase().includes(q);
    }
    return true;
  });

  if (sortBy === 'lowest_cost') filtered = [...filtered].sort((a, b) => totalCost(a) - totalCost(b));
  else if (sortBy === 'fastest') filtered = [...filtered].sort((a, b) => (a.turnaround_time || '').localeCompare(b.turnaround_time || ''));

  const handleSubmit = (e) => {
    e.preventDefault();
    upsert.mutate({
      ...form,
      blank_garment_cost: Number(form.blank_garment_cost) || 0,
      print_cost: Number(form.print_cost) || 0,
      setup_fee: Number(form.setup_fee) || 0,
      shipping_cost: Number(form.shipping_cost) || 0,
      minimum_order_quantity: Number(form.minimum_order_quantity) || 0,
    });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-primary text-primary-foreground py-6 px-4">
        <div className="container mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Vendor Pricing</h1>
            <p className="text-primary-foreground/70 text-sm">Cost sheets per vendor, product, and print method</p>
          </div>
          <Button onClick={openNew} className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
            <Plus className="w-4 h-4" /> Add Pricing
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Filters */}
        <div className="bg-white rounded-2xl border shadow-sm p-4 mb-6 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="all">All Vendors</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="all">All Methods</option>
            {PRINT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="all">All Categories</option>
            {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="none">Sort: Default</option>
            <option value="lowest_cost">Lowest Total Cost</option>
            <option value="fastest">Fastest Turnaround</option>
          </select>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
            Show Inactive
          </label>
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-xl h-40 animate-pulse" />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground mb-4">{pricing.length === 0 ? 'No pricing records yet' : 'No records match your filters'}</p>
            {pricing.length === 0 && <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />Add First Pricing Record</Button>}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b sticky top-0">
                  <tr>
                    {['Vendor','Product','Brand/Style','Category','Method','Blank','Print','Setup','Ship','Total','MOQ','Turnaround','Active',''].map(h => (
                      <th key={h} className="text-left px-3 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(row => (
                    <tr key={row.id} className={`hover:bg-muted/10 ${!row.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap">{row.vendor_name}</td>
                      <td className="px-3 py-2.5">{row.product_name || '—'}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{[row.garment_brand, row.garment_style_number].filter(Boolean).join(' / ') || '—'}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{row.product_category || '—'}</td>
                      <td className="px-3 py-2.5 capitalize whitespace-nowrap">{row.print_method?.replace(/_/g,' ')}</td>
                      <td className="px-3 py-2.5">${Number(row.blank_garment_cost||0).toFixed(2)}</td>
                      <td className="px-3 py-2.5">${Number(row.print_cost||0).toFixed(2)}</td>
                      <td className="px-3 py-2.5">${Number(row.setup_fee||0).toFixed(2)}</td>
                      <td className="px-3 py-2.5">${Number(row.shipping_cost||0).toFixed(2)}</td>
                      <td className="px-3 py-2.5 font-bold text-primary">${totalCost(row).toFixed(2)}</td>
                      <td className="px-3 py-2.5">{row.minimum_order_quantity || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{row.turnaround_time || '—'}</td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => toggleActive.mutate({ id: row.id, is_active: !row.is_active })}
                          className={`w-8 h-4 rounded-full transition-colors ${row.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
                          <div className={`w-3 h-3 bg-white rounded-full mx-auto transition-transform ${row.is_active ? 'translate-x-2' : '-translate-x-2'}`} />
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(row)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:bg-red-50" onClick={() => del.mutate(row.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Pricing Record' : 'Add Vendor Pricing'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-sm font-medium">Vendor *</label>
                <Select value={form.vendor_id} onValueChange={v => {
                  const vnd = vendors.find(x => x.id === v);
                  setForm(p => ({ ...p, vendor_id: v, vendor_name: vnd?.name || v }));
                }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>{vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Product Name</label>
                <Input value={form.product_name} onChange={f('product_name')} placeholder="e.g. Unisex T-Shirt" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Product Category</label>
                <Select value={form.product_category} onValueChange={f('product_category')}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{PRODUCT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Garment Brand</label>
                <Input value={form.garment_brand} onChange={f('garment_brand')} placeholder="Gildan, Next Level..." className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Style Number</label>
                <Input value={form.garment_style_number} onChange={f('garment_style_number')} placeholder="G500, 3600..." className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Print Method</label>
                <Select value={form.print_method} onValueChange={f('print_method')}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{PRINT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Min. Order Qty</label>
                <Input type="number" value={form.minimum_order_quantity} onChange={f('minimum_order_quantity')} placeholder="12" className="mt-1" />
              </div>
            </div>

            {/* Costs */}
            <div>
              <p className="text-sm font-bold mb-2">Costs</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[['blank_garment_cost','Blank Cost ($)'],['print_cost','Print Cost ($)'],['setup_fee','Setup Fee ($)'],['shipping_cost','Shipping ($)']].map(([k, label]) => (
                  <div key={k}>
                    <label className="text-xs text-muted-foreground">{label}</label>
                    <Input type="number" step="0.01" value={form[k]} onChange={f(k)} placeholder="0.00" className="mt-1" />
                  </div>
                ))}
              </div>
              {/* Live total */}
              <div className="mt-3 bg-primary/5 rounded-xl px-4 py-2.5 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Estimated Total Cost</span>
                <span className="font-bold text-primary">
                  ${((Number(form.blank_garment_cost)||0)+(Number(form.print_cost)||0)+(Number(form.setup_fee)||0)+(Number(form.shipping_cost)||0)).toFixed(2)}
                </span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Turnaround Time</label>
              <Input value={form.turnaround_time} onChange={f('turnaround_time')} placeholder="5–7 business days" className="mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Size Upcharge Notes</label>
                <Input value={form.size_upcharge_notes} onChange={f('size_upcharge_notes')} placeholder="e.g. +$2 for 2XL+" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Color Upcharge Notes</label>
                <Input value={form.color_upcharge_notes} onChange={f('color_upcharge_notes')} placeholder="e.g. +$1 for dark colors" className="mt-1" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Notes</label>
              <textarea rows={2} value={form.notes} onChange={f('notes')} placeholder="Any additional pricing notes..." className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm mt-1 resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="pricing_active" checked={form.is_active} onChange={e => setForm(p => ({...p, is_active: e.target.checked}))} className="rounded" />
              <label htmlFor="pricing_active" className="text-sm font-medium cursor-pointer">Active pricing record</label>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">Cancel</Button>
              <Button type="submit" disabled={upsert.isPending} className="flex-1">{upsert.isPending ? 'Saving...' : 'Save Pricing'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}