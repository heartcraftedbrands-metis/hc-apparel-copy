import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  X, User, Package, Truck, FileImage, ExternalLink,
  CheckCircle2, Link2, Calculator,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import MarginBadge from '@/components/profit/MarginBadge';
import CreateVendorOrderModal from './CreateVendorOrderModal';

const ORDER_STATUSES = [
  { value: 'new', label: 'New (Awaiting Payment)' },
  { value: 'paid', label: 'Paid' },
  { value: 'awaiting_fulfillment', label: 'Awaiting Fulfillment' },
  { value: 'in_production', label: 'In Production' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'completed', label: 'Completed' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'refunded', label: 'Refunded' },
];

const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  awaiting_fulfillment: 'bg-yellow-100 text-yellow-800',
  in_production: 'bg-orange-100 text-orange-800',
  shipped: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-200 text-green-900',
  canceled: 'bg-red-100 text-red-800',
  refunded: 'bg-gray-100 text-gray-600',
};

function Section({ title, icon, children, adminOnly }) {
  return (
    <div className={`rounded-2xl p-4 border ${adminOnly ? 'border-primary/20 bg-primary/[0.025]' : 'border-border bg-white'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={adminOnly ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
        <p className="text-sm font-bold">{title}</p>
        {adminOnly && (
          <span className="ml-auto text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full shrink-0">Admin Only</span>
        )}
      </div>
      {children}
    </div>
  );
}

function InfoGrid({ items }) {
  const visible = items.filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!visible.length) return <p className="text-sm text-muted-foreground">No information.</p>;
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

export default function OrderDetailPanel({ order: initialOrder, onClose, onUpdated, queryClient }) {
  const [order, setOrder] = useState({ ...initialOrder });
  const [showVendorModal, setShowVendorModal] = useState(false);

  // Fetch linked quote request if any
  const { data: quoteRequest } = useQuery({
    queryKey: ['quote-request-for-order', order.quote_request_id],
    queryFn: () => order.quote_request_id
      ? base44.entities.QuoteRequest.filter({ id: order.quote_request_id }).then(r => r[0])
      : Promise.resolve(null),
    enabled: !!order.quote_request_id,
  });

  // Fetch linked vendor order if any
  const { data: vendorOrder } = useQuery({
    queryKey: ['vendor-order-for-order', order.vendor_order_id],
    queryFn: () => order.vendor_order_id
      ? base44.entities.VendorOrder.filter({ id: order.vendor_order_id }).then(r => r[0])
      : Promise.resolve(null),
    enabled: !!order.vendor_order_id,
  });

  const updateStatus = async (status) => {
    await base44.entities.Order.update(order.id, { status });
    const updated = { ...order, status };
    setOrder(updated);
    if (onUpdated) onUpdated(updated);
    if (queryClient) queryClient.invalidateQueries(['admin-orders']);
    toast.success('Status updated');
  };

  const qty = order.order_items?.reduce((s, i) => s + (Number(i.quantity) || 1), 0) || 1;
  const revenue = Number(order.total_amount) || 0;
  const vendorCost = Number(order.vendor_cost_estimate) || 0;
  const profit = revenue - vendorCost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  const statusInfo = STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600';

  return (
    <>
      <div className="fixed inset-0 z-50 flex">
        <div className="flex-1 bg-black/40 cursor-pointer" onClick={onClose} />
        <div className="w-full max-w-4xl bg-background flex flex-col shadow-2xl overflow-hidden">
          {/* Sticky Header */}
          <div className="bg-primary text-primary-foreground px-6 py-4 flex-shrink-0">
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-xl font-extrabold">Order #{order.id.slice(-8).toUpperCase()}</h2>
                  <Badge className={`text-xs shrink-0 ${statusInfo}`}>
                    {order.status?.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <p className="text-primary-foreground/70 text-sm mt-0.5 truncate">
                  {order.customer_name} · {order.customer_email}
                  {order.created_date ? ` · ${format(new Date(order.created_date), 'MMM d, yyyy')}` : ''}
                </p>
              </div>
              <button onClick={onClose}
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-primary-foreground/15 hover:bg-primary-foreground/30 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status + Vendor Order button */}
            <div className="flex flex-wrap gap-2 mt-3 items-center">
              <Select value={order.status} onValueChange={updateStatus}>
                <SelectTrigger className="h-8 w-52 text-xs bg-primary-foreground/15 border-0 text-primary-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {!order.vendor_order_id && (
                <Button size="sm" onClick={() => setShowVendorModal(true)}
                  className="bg-accent text-accent-foreground hover:bg-accent/90 gap-1.5 h-8">
                  <Truck className="w-3.5 h-3.5" />Create Vendor Order
                </Button>
              )}
            </div>

            {/* Linked quote + vendor order badges */}
            <div className="flex flex-wrap gap-2 mt-2">
              {order.quote_request_id && (
                <div className="bg-primary-foreground/10 border border-primary-foreground/20 rounded-lg px-3 py-1 text-xs text-primary-foreground flex items-center gap-1.5">
                  <Link2 className="w-3 h-3" />Quote Ref: #{order.quote_request_id.slice(-6).toUpperCase()}
                </div>
              )}
              {order.vendor_order_id && (
                <div className="bg-green-900/30 border border-green-400/30 rounded-lg px-3 py-1 text-xs text-green-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3" />Vendor Order Created #{order.vendor_order_id.slice(-6).toUpperCase()}
                </div>
              )}
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Left column */}
                <div className="space-y-5">
                  <Section title="Customer Information" icon={<User className="w-4 h-4" />}>
                    <InfoGrid items={[
                      ['Name', order.customer_name],
                      ['Email', order.customer_email],
                      ['Phone', order.customer_phone],
                    ]} />
                  </Section>

                  <Section title="Order Items" icon={<Package className="w-4 h-4" />}>
                    <div className="space-y-3">
                      {order.order_items?.map((item, idx) => (
                        <div key={idx} className="bg-muted/30 rounded-xl p-3">
                          <p className="font-semibold text-sm">{item.product_name}</p>
                          <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                            <p>Qty: {item.quantity} · Price: ${Number(item.price).toFixed(2)}/ea</p>
                            {item.size && <p>Size: {item.size}</p>}
                            {item.color && <p>Color: {item.color}</p>}
                            {item.print_method && <p>Print: {item.print_method}</p>}
                            {item.print_placement && <p>Placement: {item.print_placement}</p>}
                          </div>
                          {(item.artwork_file_url || item.artwork_link) && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {item.artwork_file_url && (
                                <a href={item.artwork_file_url} target="_blank" rel="noreferrer"
                                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                                  <FileImage className="w-3 h-3" />Artwork File
                                </a>
                              )}
                              {item.artwork_link && (
                                <a href={item.artwork_link} target="_blank" rel="noreferrer"
                                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                                  <ExternalLink className="w-3 h-3" />Artwork Link
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center mt-3 pt-3 border-t font-bold">
                      <span>Order Total</span>
                      <span className="text-lg">${revenue.toFixed(2)}</span>
                    </div>
                  </Section>

                  {order.shipping_address?.street && (
                    <Section title="Shipping Address" icon={<Truck className="w-4 h-4" />}>
                      <p className="text-sm">
                        {order.shipping_address.street}<br />
                        {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zip}
                      </p>
                    </Section>
                  )}

                  {order.notes && (
                    <Section title="Order Notes" icon={<Package className="w-4 h-4" />}>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{order.notes}</p>
                    </Section>
                  )}
                </div>

                {/* Right column — admin only */}
                <div className="space-y-5">
                  {/* Linked Quote Request */}
                  {quoteRequest && (
                    <Section title="Linked Quote Request" icon={<Link2 className="w-4 h-4" />} adminOnly>
                      <InfoGrid items={[
                        ['Quote Ref', `#${quoteRequest.id.slice(-6).toUpperCase()}`],
                        ['Project Type', quoteRequest.product_type || quoteRequest.garment_type],
                        ['Print Method', quoteRequest.print_method],
                        ['Quantity', quoteRequest.quantity],
                        ['Submitted', quoteRequest.created_date ? format(new Date(quoteRequest.created_date), 'MMM d, yyyy') : '—'],
                      ]} />
                      {quoteRequest.what_to_print && (
                        <p className="text-xs text-muted-foreground mt-2 bg-muted/30 rounded-lg p-2">{quoteRequest.what_to_print}</p>
                      )}
                    </Section>
                  )}

                  {/* Vendor Info */}
                  {order.assigned_vendor_name && (
                    <Section title="Assigned Vendor" icon={<Truck className="w-4 h-4" />} adminOnly>
                      <p className="text-sm font-semibold">{order.assigned_vendor_name}</p>
                    </Section>
                  )}

                  {/* Linked Vendor Order */}
                  {vendorOrder && (
                    <Section title="Vendor Order" icon={<Truck className="w-4 h-4" />} adminOnly>
                      <InfoGrid items={[
                        ['Vendor', vendorOrder.vendor_name],
                        ['Status', vendorOrder.status?.replace(/_/g, ' ')],
                        ['Tracking #', vendorOrder.tracking_number],
                        ['Vendor Order #', `#${vendorOrder.id.slice(-6).toUpperCase()}`],
                      ]} />
                    </Section>
                  )}

                  {/* Fulfillment & Payment Status */}
                  <Section title="Payment & Fulfillment" icon={<Package className="w-4 h-4" />} adminOnly>
                    <InfoGrid items={[
                      ['Order Status', order.status?.replace(/_/g, ' ')],
                      ['Payment', order.status === 'paid' || order.status === 'completed' ? 'Paid' : 'Pending'],
                      ['Fulfillment', order.vendor_order_id ? 'Vendor Order Created' : 'Not Started'],
                      ['Customer Total', `$${revenue.toFixed(2)}`],
                    ]} />
                  </Section>

                  {/* Profit Summary */}
                  {vendorCost > 0 && (
                    <Section title="Profit Summary" icon={<Calculator className="w-4 h-4" />} adminOnly>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Customer Revenue</p>
                            <p className="font-semibold">${revenue.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Est. Vendor Cost</p>
                            <p className="font-semibold text-red-600">${vendorCost.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Est. Profit</p>
                            <p className={`font-bold ${profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>${profit.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Profit / Item</p>
                            <p className={`font-medium ${(profit / qty) >= 0 ? 'text-green-700' : 'text-red-700'}`}>${(profit / qty).toFixed(2)}</p>
                          </div>
                        </div>
                        <div className="border-t pt-2 flex items-center justify-between">
                          <span className="text-sm font-semibold">Margin</span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{margin.toFixed(1)}%</span>
                            <MarginBadge margin={margin} size="sm" />
                          </div>
                        </div>
                      </div>
                    </Section>
                  )}

                  {/* Create vendor order CTA */}
                  {!order.vendor_order_id && (
                    <Button className="w-full gap-2 bg-primary h-11" onClick={() => setShowVendorModal(true)}>
                      <Truck className="w-4 h-4" />Create Vendor Fulfillment Order
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showVendorModal && (
        <CreateVendorOrderModal
          order={order}
          quoteRequest={quoteRequest}
          onClose={() => setShowVendorModal(false)}
          onCreated={(vo) => {
            setShowVendorModal(false);
            setOrder(prev => ({ ...prev, vendor_order_id: vo.id }));
            if (queryClient) queryClient.invalidateQueries(['admin-orders']);
            if (onUpdated) onUpdated({ ...order, vendor_order_id: vo.id });
          }}
        />
      )}
    </>
  );
}