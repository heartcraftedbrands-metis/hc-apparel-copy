import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star } from 'lucide-react';
import { VENDOR_TYPES, EMPTY_VENDOR } from '@/pages/AdminVendors';

const PRINT_METHODS = ['DTF','Screen Print','Embroidery','DTG','Sublimation','Vinyl','Heat Transfer','Other'];
const GARMENT_TYPES = ['T-Shirts','Hoodies','Crewnecks','Hats','Polos','Long Sleeve','Jackets','Youth','Sportswear','Accessories'];

function StarPicker({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n === value ? 0 : n)}>
          <Star className={`w-5 h-5 transition-colors ${n <= value ? 'fill-accent text-accent' : 'text-muted-foreground/30 hover:text-accent'}`} />
        </button>
      ))}
    </div>
  );
}

function TagInput({ values = [], onChange, suggestions = [] }) {
  const [input, setInput] = useState('');
  const add = (val) => {
    const v = val.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput('');
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((v, i) => (
          <span key={i} className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-full">
            {v}
            <button type="button" onClick={() => onChange(values.filter((_, idx) => idx !== i))} className="hover:text-red-500">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(input); } }} placeholder="Type and press Enter..." className="text-sm" />
        <Button type="button" variant="outline" size="sm" onClick={() => add(input)}>Add</Button>
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {suggestions.filter(s => !values.includes(s)).map(s => (
            <button key={s} type="button" onClick={() => onChange([...values, s])} className="text-xs px-2 py-0.5 bg-muted hover:bg-muted/80 rounded-full border border-border">+ {s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const SECTIONS = ['info', 'production', 'pricing'];
const SECTION_LABELS = { info: 'Vendor Info', production: 'Production Details', pricing: 'Pricing & Terms' };

export default function VendorFormDialog({ open, onOpenChange, editing, onSubmit, isPending }) {
  const [form, setForm] = useState(EMPTY_VENDOR);
  const [section, setSection] = useState('info');

  useEffect(() => {
    if (editing) setForm({ ...EMPTY_VENDOR, ...editing });
    else setForm(EMPTY_VENDOR);
    setSection('info');
  }, [editing, open]);

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e && e.target ? e.target.value : e }));
  const fb = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.checked }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...form,
      minimum_order_quantity: Number(form.minimum_order_quantity) || 0,
      default_setup_fee: Number(form.default_setup_fee) || 0,
      default_shipping_estimate: Number(form.default_shipping_estimate) || 0,
      quality_rating: Number(form.quality_rating) || 0,
      reliability_rating: Number(form.reliability_rating) || 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit: ${editing.name}` : 'Add New Vendor'}</DialogTitle>
        </DialogHeader>

        {/* Section tabs */}
        <div className="flex border-b mb-4">
          {SECTIONS.map(s => (
            <button key={s} type="button" onClick={() => setSection(s)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${section === s ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {SECTION_LABELS[s]}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* VENDOR INFO */}
          {section === 'info' && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Vendor Name *</label>
                <Input required value={form.name} onChange={f('name')} placeholder="Company or person name" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Vendor Type</label>
                  <Select value={form.vendor_type} onValueChange={f('vendor_type')}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{VENDOR_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Contact Person</label>
                  <Input value={form.contact_person} onChange={f('contact_person')} placeholder="John Doe" className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input type="email" value={form.email} onChange={f('email')} placeholder="vendor@email.com" className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Phone</label>
                  <Input value={form.phone} onChange={f('phone')} placeholder="+1 555 0000" className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Website</label>
                  <Input value={form.website} onChange={f('website')} placeholder="https://..." className="mt-1" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Business Address</label>
                <Input value={form.address} onChange={f('address')} placeholder="123 Main St, City, State ZIP" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Notes</label>
                <textarea rows={3} value={form.notes} onChange={f('notes')} placeholder="General notes about this vendor..." className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm mt-1 resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_active" checked={form.is_active} onChange={fb('is_active')} className="rounded" />
                <label htmlFor="is_active" className="text-sm font-medium cursor-pointer">Active vendor</label>
              </div>
            </div>
          )}

          {/* PRODUCTION DETAILS */}
          {section === 'production' && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1.5">Print Methods Offered</label>
                <TagInput values={form.print_methods_offered || []} onChange={v => setForm(p => ({...p, print_methods_offered: v}))} suggestions={PRINT_METHODS} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">Garment Types Offered</label>
                <TagInput values={form.garment_types_offered || []} onChange={v => setForm(p => ({...p, garment_types_offered: v}))} suggestions={GARMENT_TYPES} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Minimum Order Qty</label>
                  <Input type="number" value={form.minimum_order_quantity} onChange={f('minimum_order_quantity')} placeholder="12" className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Average Turnaround</label>
                  <Input value={form.turnaround_time} onChange={f('turnaround_time')} placeholder="5–7 business days" className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 mt-2">
                  <input type="checkbox" id="rush" checked={form.rush_order_available} onChange={fb('rush_order_available')} className="rounded" />
                  <label htmlFor="rush" className="text-sm font-medium cursor-pointer">Rush Orders Available</label>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input type="checkbox" id="pickup" checked={form.local_pickup_available} onChange={fb('local_pickup_available')} className="rounded" />
                  <label htmlFor="pickup" className="text-sm font-medium cursor-pointer">Local Pickup Available</label>
                </div>
              </div>
              {form.rush_order_available && (
                <div>
                  <label className="text-sm font-medium">Rush Fee Notes</label>
                  <Input value={form.rush_fee_notes} onChange={f('rush_fee_notes')} placeholder="e.g. +$50 for 48hr turnaround" className="mt-1" />
                </div>
              )}
              <div>
                <label className="text-sm font-medium">Shipping Options</label>
                <Input value={form.shipping_options} onChange={f('shipping_options')} placeholder="UPS, FedEx, local delivery..." className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-6 pt-2">
                <div>
                  <label className="text-sm font-medium block mb-2">Quality Rating</label>
                  <StarPicker value={form.quality_rating} onChange={v => setForm(p => ({...p, quality_rating: v}))} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">Reliability Rating</label>
                  <StarPicker value={form.reliability_rating} onChange={v => setForm(p => ({...p, reliability_rating: v}))} />
                </div>
              </div>
            </div>
          )}

          {/* PRICING */}
          {section === 'pricing' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Default Setup Fee ($)</label>
                  <Input type="number" step="0.01" value={form.default_setup_fee} onChange={f('default_setup_fee')} placeholder="0.00" className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Default Shipping Est. ($)</label>
                  <Input type="number" step="0.01" value={form.default_shipping_estimate} onChange={f('default_shipping_estimate')} placeholder="0.00" className="mt-1" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Payment Terms</label>
                <Input value={form.payment_terms} onChange={f('payment_terms')} placeholder="Net 30, prepay, COD..." className="mt-1" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="tax" checked={form.tax_charged} onChange={fb('tax_charged')} className="rounded" />
                <label htmlFor="tax" className="text-sm font-medium cursor-pointer">Tax Charged on Orders</label>
              </div>
              <div>
                <label className="text-sm font-medium">Shipping Cost Notes</label>
                <textarea rows={2} value={form.shipping_cost_notes} onChange={f('shipping_cost_notes')} placeholder="e.g. Free shipping over $200..." className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm mt-1 resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-sm font-medium">Pricing Notes</label>
                <textarea rows={3} value={form.pricing_notes} onChange={f('pricing_notes')} placeholder="Additional pricing details, volume discounts, etc." className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm mt-1 resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
            {section !== 'pricing' ? (
              <Button type="button" onClick={() => setSection(SECTIONS[SECTIONS.indexOf(section) + 1])} className="flex-1">
                Next →
              </Button>
            ) : (
              <Button type="submit" disabled={isPending} className="flex-1">
                {isPending ? 'Saving...' : editing ? 'Update Vendor' : 'Add Vendor'}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}