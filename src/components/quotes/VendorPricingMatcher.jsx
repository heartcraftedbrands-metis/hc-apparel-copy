import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, Plus, Tag, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const PRINT_METHODS = ['dtf', 'screen_print', 'embroidery', 'dtg', 'sublimation', 'vinyl', 'heat_transfer', 'other'];
const PRINT_METHOD_LABELS = {
  dtf: 'DTF', screen_print: 'Screen Print', embroidery: 'Embroidery',
  dtg: 'DTG', sublimation: 'Sublimation', vinyl: 'Vinyl',
  heat_transfer: 'Heat Transfer', other: 'Other',
};

// Compute a match score for a pricing record against a quote request
function scoreMatch(pricing, quote) {
  let score = 0;

  // Print method match (most important)
  const quotePrintMethod = (quote.print_method || '').toLowerCase().replace(/[^a-z]/g, '_');
  const pricingMethod = (pricing.print_method || '').toLowerCase();
  if (quotePrintMethod && pricingMethod && (quotePrintMethod === pricingMethod || quotePrintMethod.includes(pricingMethod) || pricingMethod.includes(quotePrintMethod))) {
    score += 40;
  }

  // Product/garment type match
  const quoteGarment = (quote.product_type || quote.garment_type || quote.what_to_print || '').toLowerCase();
  const pricingProduct = (pricing.product_name || pricing.product_category || '').toLowerCase();
  if (quoteGarment && pricingProduct) {
    const words = pricingProduct.split(/\s+/);
    const matched = words.some(w => w.length > 3 && quoteGarment.includes(w));
    if (matched) score += 30;
  }

  // Quantity check — MOQ must be <= requested qty
  if (pricing.minimum_order_quantity && quote.quantity) {
    if (Number(pricing.minimum_order_quantity) <= Number(quote.quantity)) {
      score += 20;
    } else {
      score -= 10; // penalize if MOQ is too high
    }
  }

  // Garment brand bonus
  if (pricing.garment_brand) score += 5;

  // Style number bonus
  if (pricing.garment_style_number) score += 5;

  return score;
}

export default function VendorPricingMatcher({ quote, vendorId, vendorName, onApplyPricing }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [newPricing, setNewPricing] = useState({
    vendor_id: vendorId || '',
    vendor_name: vendorName || '',
    product_name: '',
    garment_brand: '',
    garment_style_number: '',
    product_category: quote?.product_type || quote?.garment_type || '',
    blank_garment_cost: '',
    print_method: quote?.print_method || 'dtf',
    print_cost: '',
    setup_fee: '',
    shipping_cost: '',
    minimum_order_quantity: '',
    turnaround_time: '',
    notes: '',
    is_active: true,
  });

  const { data: allPricing = [], isLoading } = useQuery({
    queryKey: ['vendor-pricing', vendorId],
    queryFn: () => vendorId
      ? base44.entities.VendorPricing.filter({ vendor_id: vendorId })
      : Promise.resolve([]),
    enabled: !!vendorId,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.VendorPricing.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-pricing', vendorId] });
      toast.success('Vendor pricing record created');
      setCreateOpen(false);
    },
  });

  // Score and sort pricing records
  const scored = allPricing
    .map(p => ({ ...p, _score: scoreMatch(p, quote) }))
    .sort((a, b) => b._score - a._score);

  const matches = scored.filter(p => p._score > 0);
  const nonMatches = scored.filter(p => p._score <= 0);
  const displayed = matches.length > 0 ? matches : nonMatches.slice(0, 3);

  const handleApply = (pricing) => {
    setSelectedId(pricing.id);
    onApplyPricing({
      blank_garment_cost: pricing.blank_garment_cost || 0,
      print_cost: pricing.print_cost || 0,
      setup_fee: pricing.setup_fee || 0,
      shipping_cost: pricing.shipping_cost || 0,
      vendor_estimate_total: (
        (Number(pricing.blank_garment_cost) || 0) +
        (Number(pricing.print_cost) || 0) +
        (Number(pricing.setup_fee) || 0) +
        (Number(pricing.shipping_cost) || 0)
      ),
      _turnaround: pricing.turnaround_time || '',
      _moq: pricing.minimum_order_quantity || '',
    });
    toast.success(`Pricing from "${pricing.product_name || vendorName}" applied to calculator`);
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate({
      ...newPricing,
      vendor_id: vendorId,
      vendor_name: vendorName,
      blank_garment_cost: Number(newPricing.blank_garment_cost) || 0,
      print_cost: Number(newPricing.print_cost) || 0,
      setup_fee: Number(newPricing.setup_fee) || 0,
      shipping_cost: Number(newPricing.shipping_cost) || 0,
      minimum_order_quantity: Number(newPricing.minimum_order_quantity) || null,
    });
  };

  const setN = (k, v) => setNewPricing(p => ({ ...p, [k]: v }));

  if (!vendorId) return null;

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="w-4 h-4 animate-spin" />Loading pricing records…
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <p className="text-yellow-800 font-medium">No vendor pricing records found for {vendorName}.</p>
          </div>
          <p className="text-yellow-700 text-xs ml-6">Add pricing manually in the calculator below, or create a pricing record.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {matches.length > 0 && (
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">
              {matches.length} matching record{matches.length !== 1 ? 's' : ''} found
            </p>
          )}
          {displayed.map(pricing => (
            <div key={pricing.id}
              className={`border rounded-xl p-3 transition-all ${selectedId === pricing.id ? 'border-primary bg-primary/5' : 'border-border bg-white hover:border-primary/40'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="font-semibold text-sm truncate">{pricing.product_name || '(unnamed product)'}</span>
                    {pricing._score > 50 && (
                      <Badge className="bg-green-100 text-green-700 text-xs px-2 py-0">Best Match</Badge>
                    )}
                    {pricing._score > 20 && pricing._score <= 50 && (
                      <Badge className="bg-blue-100 text-blue-700 text-xs px-2 py-0">Good Match</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {pricing.garment_brand && <span>Brand: <span className="text-foreground font-medium">{pricing.garment_brand}</span></span>}
                    {pricing.garment_style_number && <span>Style: <span className="text-foreground font-medium">{pricing.garment_style_number}</span></span>}
                    <span>Print: <span className="text-foreground font-medium">{PRINT_METHOD_LABELS[pricing.print_method] || pricing.print_method}</span></span>
                    {pricing.blank_garment_cost > 0 && <span>Blank: <span className="text-foreground font-medium">${pricing.blank_garment_cost}/ea</span></span>}
                    {pricing.print_cost > 0 && <span>Print: <span className="text-foreground font-medium">${pricing.print_cost}/ea</span></span>}
                    {pricing.setup_fee > 0 && <span>Setup: <span className="text-foreground font-medium">${pricing.setup_fee}</span></span>}
                    {pricing.shipping_cost > 0 && <span>Shipping: <span className="text-foreground font-medium">${pricing.shipping_cost}</span></span>}
                    {pricing.minimum_order_quantity && <span>MOQ: <span className="text-foreground font-medium">{pricing.minimum_order_quantity}</span></span>}
                    {pricing.turnaround_time && <span>Turnaround: <span className="text-foreground font-medium">{pricing.turnaround_time}</span></span>}
                  </div>
                  {pricing.notes && (
                    <p className="text-xs text-muted-foreground mt-1.5 italic truncate">{pricing.notes}</p>
                  )}
                </div>
                <Button size="sm"
                  onClick={() => handleApply(pricing)}
                  className={`shrink-0 h-8 gap-1.5 text-xs ${selectedId === pricing.id ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground hover:bg-accent/90'}`}>
                  {selectedId === pricing.id ? <><CheckCircle2 className="w-3.5 h-3.5" />Applied</> : <><Tag className="w-3.5 h-3.5" />Use This</>}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}
        className="w-full gap-2 text-xs h-8 border-dashed">
        <Plus className="w-3.5 h-3.5" />Create Vendor Pricing Record
      </Button>

      {/* Create Pricing Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Pricing Record — {vendorName}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Product Name</Label>
                <Input value={newPricing.product_name} onChange={e => setN('product_name', e.target.value)}
                  placeholder="e.g. Bella Canvas 3001 Tee" className="mt-1 h-8" />
              </div>
              <div>
                <Label className="text-xs">Garment Brand</Label>
                <Input value={newPricing.garment_brand} onChange={e => setN('garment_brand', e.target.value)}
                  placeholder="e.g. Bella Canvas" className="mt-1 h-8" />
              </div>
              <div>
                <Label className="text-xs">Style Number</Label>
                <Input value={newPricing.garment_style_number} onChange={e => setN('garment_style_number', e.target.value)}
                  placeholder="e.g. 3001" className="mt-1 h-8" />
              </div>
              <div>
                <Label className="text-xs">Print Method</Label>
                <Select value={newPricing.print_method} onValueChange={v => setN('print_method', v)}>
                  <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRINT_METHODS.map(m => <SelectItem key={m} value={m}>{PRINT_METHOD_LABELS[m]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Input value={newPricing.product_category} onChange={e => setN('product_category', e.target.value)}
                  placeholder="e.g. T-Shirts" className="mt-1 h-8" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-muted/30 rounded-xl p-3">
              <p className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pricing</p>
              {[
                { k: 'blank_garment_cost', label: 'Blank Garment ($/ea)' },
                { k: 'print_cost', label: 'Print Cost ($/ea)' },
                { k: 'setup_fee', label: 'Setup Fee ($)' },
                { k: 'shipping_cost', label: 'Shipping ($)' },
                { k: 'minimum_order_quantity', label: 'Min Order Qty' },
              ].map(({ k, label }) => (
                <div key={k}>
                  <Label className="text-xs">{label}</Label>
                  <Input type="number" step="0.01" value={newPricing[k]} onChange={e => setN(k, e.target.value)}
                    className="mt-1 h-8" placeholder="0" />
                </div>
              ))}
              <div>
                <Label className="text-xs">Turnaround Time</Label>
                <Input value={newPricing.turnaround_time} onChange={e => setN('turnaround_time', e.target.value)}
                  placeholder="e.g. 5–7 days" className="mt-1 h-8" />
              </div>
            </div>

            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={newPricing.notes} onChange={e => setN('notes', e.target.value)}
                placeholder="Size upcharges, color notes, special requirements…" rows={2} className="mt-1 text-sm" />
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} className="flex-1">Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending} className="flex-1 gap-2">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create Record
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}