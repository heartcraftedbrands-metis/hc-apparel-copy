import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle } from 'lucide-react';

const PRINT_METHODS = ['dtf','screen_print','embroidery','dtg','sublimation','vinyl','heat_transfer','other'];
const selectClass = "w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

export default function CreateGroupPricingModal({ group, open, onClose, onSuccess }) {
  const [form, setForm] = useState({
    print_method: 'dtf', print_cost: '', setup_fee: '', shipping_cost: '',
    minimum_order_quantity: '', turnaround_time: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-ss'],
    queryFn: () => base44.entities.Vendor.filter({ name: 'S&S Activewear' }),
    enabled: open,
  });
  const ssVendor = vendors[0];

  const handleSave = async () => {
    setSaving(true);
    try {
      let vendorId = ssVendor?.id;
      if (!vendorId) {
        const v = await base44.entities.Vendor.create({
          name: 'S&S Activewear', vendor_type: 'apparel_blank_supplier', is_active: true,
          website: 'https://www.ssactivewear.com',
        });
        vendorId = v.id;
      }
      const pricing = await base44.entities.VendorPricing.create({
        vendor_id: vendorId,
        vendor_name: 'S&S Activewear',
        product_name: group.product_name,
        garment_brand: group.brand || '',
        garment_style_number: group.style_number || '',
        product_category: group.product_category || '',
        blank_garment_cost: group.min_blank_cost || 0,
        print_method: form.print_method,
        print_cost: form.print_cost ? parseFloat(form.print_cost) : 0,
        setup_fee: form.setup_fee ? parseFloat(form.setup_fee) : 0,
        shipping_cost: form.shipping_cost ? parseFloat(form.shipping_cost) : 0,
        minimum_order_quantity: form.minimum_order_quantity ? parseInt(form.minimum_order_quantity) : undefined,
        turnaround_time: form.turnaround_time || '',
        notes: form.notes || `Group: ${group.variant_count} SKU rows. Sizes: ${group.sizes.join(', ')}. Colors: ${group.colors.join(', ')}.`,
        is_active: true,
      });
      // Link all variants to this pricing record
      await Promise.all(group.variants.map(v =>
        base44.entities.SSCatalogItem.update(v.id, { linked_vendor_pricing_id: pricing.id })
      ));
      toast.success('Vendor pricing created for group');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error('Failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create Vendor Pricing — Group</DialogTitle></DialogHeader>

        {/* Auto-filled summary */}
        <div className="p-3 bg-muted/40 rounded-xl text-sm space-y-1.5 mb-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Auto-filled from group</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div><span className="text-muted-foreground">Brand:</span> <span className="font-medium">{group.brand || '—'}</span></div>
            <div><span className="text-muted-foreground">Style #:</span> <span className="font-medium">{group.style_number || '—'}</span></div>
            <div className="col-span-2"><span className="text-muted-foreground">Product:</span> <span className="font-medium">{group.product_name}</span></div>
            <div><span className="text-muted-foreground">Category:</span> <span className="font-medium">{group.product_category || '—'}</span></div>
            <div><span className="text-muted-foreground">SKU Rows:</span> <span className="font-medium">{group.variant_count}</span></div>
            <div>
              <span className="text-muted-foreground">Blank Cost:</span>{' '}
              <span className="font-semibold text-primary">
                ${group.min_blank_cost?.toFixed(2) || '0.00'}
                {group.min_blank_cost !== group.max_blank_cost ? ` – $${group.max_blank_cost?.toFixed(2)}` : ''}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 pt-1 border-t mt-1">
            <CheckCircle className="w-3.5 h-3.5 text-green-600" />
            <span className="text-xs text-green-700">
              {ssVendor ? 'Linking to existing S&S Activewear vendor' : 'Will auto-create S&S Activewear vendor'}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Print Method</Label>
            <select className={selectClass} value={form.print_method}
              onChange={e => setForm(f => ({ ...f, print_method: e.target.value }))}>
              {PRINT_METHODS.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ').toUpperCase()}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Print Cost ($)</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={form.print_cost}
                onChange={e => setForm(f => ({ ...f, print_cost: e.target.value }))} />
            </div>
            <div>
              <Label>Setup Fee ($)</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={form.setup_fee}
                onChange={e => setForm(f => ({ ...f, setup_fee: e.target.value }))} />
            </div>
            <div>
              <Label>Shipping Estimate ($)</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={form.shipping_cost}
                onChange={e => setForm(f => ({ ...f, shipping_cost: e.target.value }))} />
            </div>
            <div>
              <Label>Min Order Qty</Label>
              <Input type="number" placeholder="e.g. 12" value={form.minimum_order_quantity}
                onChange={e => setForm(f => ({ ...f, minimum_order_quantity: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Turnaround Time</Label>
            <Input placeholder="e.g. 5–7 business days" value={form.turnaround_time}
              onChange={e => setForm(f => ({ ...f, turnaround_time: e.target.value }))} />
          </div>
          <div>
            <Label>Notes</Label>
            <Input placeholder="Optional notes" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-primary text-primary-foreground">
            {saving ? 'Saving…' : 'Create Pricing Record'}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}