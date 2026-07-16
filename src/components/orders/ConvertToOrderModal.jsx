import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Package, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import MarginBadge from '@/components/profit/MarginBadge';

const INITIAL_STATUSES = [
  { value: 'awaiting_fulfillment', label: 'Awaiting Fulfillment' },
  { value: 'new', label: 'New (Awaiting Payment)' },
];

export default function ConvertToOrderModal({ quote, onClose, onConverted }) {
  const [status, setStatus] = useState('awaiting_fulfillment');
  const [saving, setSaving] = useState(false);

  const qty = Number(quote.quantity) || 1;
  const pricePerItem = Number(quote.my_selling_price || quote.estimated_price) || 0;
  const totalRevenue = pricePerItem * qty;

  const blankTotal = (Number(quote.blank_garment_cost) || 0) * qty;
  const printTotal = (Number(quote.print_cost) || 0) * qty;
  const setupFee = Number(quote.setup_fee) || 0;
  const shipping = Number(quote.shipping_cost) || 0;
  const otherFees = Number(quote.other_fees) || 0;
  const vendorEst = Number(quote.vendor_estimate) || 0;
  const totalCost = blankTotal + printTotal + setupFee + shipping + otherFees + vendorEst;
  const profit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

  const printMethod = quote.print_method ? quote.print_method.replace(/_/g, ' ').toUpperCase() : '—';
  const printPlacement = Array.isArray(quote.print_placement)
    ? quote.print_placement.join(', ')
    : (quote.print_placement || '—');

  const handleCreate = async () => {
    setSaving(true);
    try {
      const orderItems = [{
        product_name: quote.product_type || quote.garment_type || quote.what_to_print || 'Custom Apparel Order',
        product_type: 'physical',
        quantity: qty,
        price: pricePerItem,
        size: quote.sizes || quote.sizes_needed || '',
        color: quote.colors || quote.garment_colors || '',
        print_method: printMethod,
        print_placement: printPlacement,
        artwork_file_url: quote.artwork_file_url || quote.file_url || '',
        artwork_link: quote.artwork_link || '',
        admin_mockup_url: quote.admin_mockup_url || '',
      }];

      const order = await base44.entities.Order.create({
        customer_name: quote.full_name || quote.customer_name,
        customer_email: quote.email || quote.customer_email,
        customer_phone: quote.phone || quote.customer_phone || '',
        order_items: orderItems,
        total_amount: totalRevenue,
        status,
        has_physical_items: true,
        shipping_address: {
          street: quote.shipping_street || '',
          city: quote.shipping_city || '',
          state: quote.shipping_state || '',
          zip: quote.shipping_zip || '',
          country: 'US',
        },
        notes: [
          `Converted from Quote Request.`,
          quote.project_notes ? `Project Notes: ${quote.project_notes}` : '',
          quote.what_to_print ? `What to Print: ${quote.what_to_print}` : '',
          quote.delivery_notes ? `Delivery Notes: ${quote.delivery_notes}` : '',
        ].filter(Boolean).join('\n'),
        quote_request_id: quote.id,
        vendor_cost_estimate: totalCost,
        estimated_profit: profit,
        profit_margin_pct: margin,
        assigned_vendor_id: quote.assigned_vendor_id || '',
        assigned_vendor_name: quote.assigned_vendor_name || '',
      });

      // Update the quote request
      const entityName = quote._entityType || 'QuoteRequest';
      await base44.entities[entityName].update(quote.id, {
        status: 'converted_to_order',
        converted_order_id: order.id,
      });

      toast.success('Customer order created!');
      onConverted(order);
    } catch (err) {
      toast.error('Failed to create order: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-primary text-primary-foreground px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5" />
            <div>
              <h2 className="font-bold text-base">Convert to Customer Order</h2>
              <p className="text-primary-foreground/70 text-xs">Create a customer order from this approved quote</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-primary-foreground/15 hover:bg-primary-foreground/30">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Confirmation prompt */}
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800 font-medium">Create customer order from this approved quote?</p>
          </div>

          {/* Customer Info */}
          <Section title="Customer">
            <Row label="Name" value={quote.full_name || quote.customer_name} />
            <Row label="Email" value={quote.email || quote.customer_email} />
            <Row label="Phone" value={quote.phone || quote.customer_phone} />
          </Section>

          {/* Order Details */}
          <Section title="Order Details">
            <Row label="Product / Garment" value={quote.product_type || quote.garment_type || quote.what_to_print} />
            <Row label="Quantity" value={qty} />
            <Row label="Sizes" value={quote.sizes || quote.sizes_needed} />
            <Row label="Colors" value={quote.colors || quote.garment_colors} />
            <Row label="Print Method" value={printMethod} />
            <Row label="Print Placement" value={printPlacement} />
          </Section>

          {/* Pricing & Profit (Admin Only) */}
          <Section title="Pricing & Profit" adminOnly>
            <Row label="Sell Price / Item" value={`$${pricePerItem.toFixed(2)}`} />
            <Row label="Quantity" value={qty} />
            <Row label="Customer Revenue" value={`$${totalRevenue.toFixed(2)}`} bold />
            <Row label="Est. Vendor Cost" value={`$${totalCost.toFixed(2)}`} red />
            <Row label="Est. Profit" value={`$${profit.toFixed(2)}`} green={profit >= 0} red={profit < 0} bold />
            <div className="col-span-2 mt-1">
              <MarginBadge margin={margin} size="sm" />
            </div>
            {quote.assigned_vendor_name && (
              <Row label="Assigned Vendor" value={quote.assigned_vendor_name} />
            )}
          </Section>

          {/* Initial status */}
          <div>
            <Label className="text-sm font-semibold">Initial Order Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INITIAL_STATUSES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2" onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
              Create Customer Order
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children, adminOnly }) {
  return (
    <div className={`rounded-xl p-4 border ${adminOnly ? 'border-primary/20 bg-primary/[0.025]' : 'border-border bg-muted/20'}`}>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
        {adminOnly && (
          <span className="ml-auto text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">Admin Only</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value, bold, red, green }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm leading-snug ${bold ? 'font-bold' : 'font-medium'} ${red ? 'text-red-600' : ''} ${green ? 'text-green-700' : ''}`}>
        {String(value)}
      </p>
    </div>
  );
}