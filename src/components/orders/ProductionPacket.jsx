import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, FileText, Printer } from 'lucide-react';

const text = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (value && typeof value === 'object') return Object.values(value).filter(Boolean).join(', ');
  return value || '—';
};

const addressText = (address = {}) => [
  address.street || address.address_line1,
  address.address_line2,
  [address.city, address.state, address.zip || address.postal_code].filter(Boolean).join(', '),
  address.country,
].filter(Boolean).join('\n');

export default function ProductionPacket({ order = {}, vendorDraft = null, vendorOrder = null }) {
  const items = order.order_items || vendorDraft?.items || vendorOrder?.items || [];
  const artwork = order.artwork_file_url || order.artwork_link || items.find((item) => item.artwork_link)?.artwork_link;
  const shippingAddress = order.shipping_address || vendorDraft?.shipping_address || {};
  const packetId = `production-packet-${order.id || vendorDraft?.id || vendorOrder?.id || 'preview'}`;
  const missing = [];
  if (!order.customer_name && !vendorDraft?.customer_name) missing.push('customer');
  if (!addressText(shippingAddress)) missing.push('shipping address');
  if (!items.length) missing.push('product line items');
  if (!artwork) missing.push('artwork link');

  const printPacket = () => {
    document.body.classList.add('printing-production-packet');
    window.print();
    window.setTimeout(() => document.body.classList.remove('printing-production-packet'), 250);
  };

  return (
    <section id={packetId} className="production-packet rounded-2xl border border-primary/20 bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold">Production Packet</h2>
        <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">Admin Only</span>
        <Button size="sm" variant="outline" className="ml-auto gap-1.5 no-print" onClick={printPacket}>
          <Printer className="w-4 h-4" />Print Packet
        </Button>
      </div>

      {missing.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Complete before production: {missing.join(', ')}.
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Customer</p>
          <p className="font-medium">{order.customer_name || vendorDraft?.customer_name || '—'}</p>
          <p>{order.customer_email || vendorDraft?.customer_email || '—'}</p>
          <p>{order.customer_phone || vendorDraft?.customer_phone || '—'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Shipping Address</p>
          <p className="whitespace-pre-line">{addressText(shippingAddress) || '—'}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b">
              {['Product', 'SKU', 'Color', 'Size', 'Qty'].map((label) => (
                <th key={label} className="text-left p-2">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.sku || item.product_name || 'item'}-${index}`} className="border-b">
                <td className="p-2">
                  <p className="font-medium">{item.product_name || item.name || '—'}</p>
                  <p className="text-muted-foreground">{text(item.brand || item.garment_brand)} {text(item.style_number || item.garment_style_number)}</p>
                </td>
                <td className="p-2 font-mono">{text(item.sku)}</td>
                <td className="p-2">{text(item.color || item.garment_color)}</td>
                <td className="p-2">{text(item.size || item.garment_size)}</td>
                <td className="p-2">{text(item.quantity || item.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <div><p className="text-xs font-semibold uppercase text-muted-foreground">Artwork Link</p>{artwork ? <a className="text-primary underline break-all" href={artwork} target="_blank" rel="noreferrer">{artwork}</a> : <p>—</p>}</div>
        <div><p className="text-xs font-semibold uppercase text-muted-foreground">Print Placement</p><p>{text(order.print_placement)}</p></div>
        <div><p className="text-xs font-semibold uppercase text-muted-foreground">Decoration Method</p><p>{text(order.print_method)}</p></div>
        <div><p className="text-xs font-semibold uppercase text-muted-foreground">Print Notes</p><p className="whitespace-pre-wrap">{text(order.what_to_print || order.project_notes)}</p></div>
        <div className="sm:col-span-2"><p className="text-xs font-semibold uppercase text-muted-foreground">Internal Notes</p><p className="whitespace-pre-wrap">{text(order.internal_notes || vendorDraft?.admin_notes || vendorDraft?.notes || vendorOrder?.internal_notes)}</p></div>
      </div>

      <p className="text-xs font-semibold text-red-700 no-print">Internal packet only. This does not submit an order to S&amp;S.</p>
      <style>{`
        @media print {
          body.printing-production-packet * { visibility: hidden !important; }
          body.printing-production-packet .production-packet,
          body.printing-production-packet .production-packet * { visibility: visible !important; }
          body.printing-production-packet .production-packet { position: absolute; inset: 0; border: 0; }
          body.printing-production-packet .no-print { display: none !important; }
        }
      `}</style>
    </section>
  );
}

