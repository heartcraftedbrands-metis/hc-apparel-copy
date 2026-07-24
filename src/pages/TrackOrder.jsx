import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Truck, Package, Clock, Mail, ShoppingBag, ExternalLink, MapPin } from 'lucide-react';
import { format } from 'date-fns';

// ── Status mapping ──────────────────────────────────────────────────────────

const getCustomerStatus = (paymentStatus, fulfillmentStatus, orderStatus) => {
  // Cancelled / Refunded
  if (orderStatus === 'canceled' || fulfillmentStatus === 'cancelled') return 'cancelled';
  if (orderStatus === 'refunded' || paymentStatus === 'refunded') return 'refunded';

  // Awaiting payment
  if (
    paymentStatus === 'unpaid' ||
    paymentStatus === 'awaiting_payment' ||
    orderStatus === 'awaiting_payment'
  ) return 'awaiting_payment';

  // Payment received
  if (paymentStatus === 'paid' || paymentStatus === 'pay_later') {
    // Now check fulfillment progression
    if (fulfillmentStatus === 'shipped') return 'shipped';
    if (fulfillmentStatus === 'delivered') return 'delivered';
    if (fulfillmentStatus === 'completed') return 'delivered';
    if (fulfillmentStatus === 'ready_to_ship') return 'ready_to_ship';
    if (
      fulfillmentStatus === 'ordered_from_vendor' ||
      fulfillmentStatus === 'in_transit_to_me'
    ) return 'ordered_from_vendor';
    if (
      fulfillmentStatus === 'not_started' ||
      fulfillmentStatus === 'vendor_order_needed' ||
      fulfillmentStatus === 'awaiting_fulfillment'
    ) return 'preparing';
    return 'payment_received';
  }

  // Partially paid — treat as awaiting
  if (paymentStatus === 'partially_paid') return 'awaiting_payment';

  return 'order_received';
};

const TIMELINE_STEPS = [
  { key: 'order_received',    label: 'Order Received',       icon: Package },
  { key: 'awaiting_payment',  label: 'Awaiting Payment',     icon: Clock },
  { key: 'payment_received',  label: 'Payment Received',     icon: CheckCircle },
  { key: 'preparing',         label: 'Preparing Order',      icon: Package },
  { key: 'ordered_from_vendor', label: 'Ordered From Vendor', icon: Truck },
  { key: 'ready_to_ship',     label: 'Ready to Ship',        icon: Package },
  { key: 'shipped',           label: 'Shipped',              icon: Truck },
  { key: 'delivered',         label: 'Delivered',            icon: CheckCircle },
];

const STATUS_BADGE = {
  order_received:     'bg-blue-100 text-blue-800',
  awaiting_payment:   'bg-amber-100 text-amber-800',
  payment_received:   'bg-green-100 text-green-800',
  preparing:          'bg-orange-100 text-orange-800',
  ordered_from_vendor:'bg-blue-100 text-blue-800',
  ready_to_ship:      'bg-teal-100 text-teal-800',
  shipped:            'bg-purple-100 text-purple-800',
  delivered:          'bg-green-200 text-green-900',
  cancelled:          'bg-red-100 text-red-800',
  refunded:           'bg-gray-100 text-gray-600',
};

const STATUS_LABEL = {
  order_received:     'Order Received',
  awaiting_payment:   'Awaiting Payment',
  payment_received:   'Payment Received',
  preparing:          'Preparing Order',
  ordered_from_vendor:'Ordered From Vendor',
  ready_to_ship:      'Ready to Ship',
  shipped:            'Shipped',
  delivered:          'Delivered',
  cancelled:          'Cancelled',
  refunded:           'Refunded',
};

const PAYMENT_LABEL = {
  unpaid:           'Unpaid',
  awaiting_payment: 'Awaiting Payment',
  partially_paid:   'Partially Paid',
  paid:             'Paid',
  refunded:         'Refunded',
  pay_later:        'Pay Later (invoice)',
  demo:             'Demo',
};

const PAYMENT_BADGE = {
  unpaid:           'bg-red-100 text-red-700',
  awaiting_payment: 'bg-amber-100 text-amber-800',
  partially_paid:   'bg-yellow-100 text-yellow-800',
  paid:             'bg-green-100 text-green-800',
  refunded:         'bg-gray-100 text-gray-600',
  pay_later:        'bg-cyan-100 text-cyan-700',
  demo:             'bg-purple-100 text-purple-700',
};

// ── Status context messages ──────────────────────────────────────────────────
const getContextMessage = (status) => {
  switch (status) {
    case 'awaiting_payment':
      return 'Your order is awaiting payment. Please complete your checkout to begin processing.';
    case 'ordered_from_vendor':
      return 'Your garments have been ordered and are being prepared for fulfillment.';
    case 'ready_to_ship':
      return 'Your order is being prepared for shipment.';
    default:
      return null;
  }
};

// ── Placeholder SVG ──────────────────────────────────────────────────────────
const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect fill='%23e5e7eb' width='200' height='200'/%3E%3Ctext x='50%25' y='50%25' font-size='12' fill='%239ca3af' text-anchor='middle' dy='.3em'%3ENo Image%3C/text%3E%3C/svg%3E";

// ── Main component ───────────────────────────────────────────────────────────
export default function TrackOrder() {
  const [orderNum, setOrderNum] = useState('');
  const [email, setEmail] = useState('');
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  // Pre-fill from URL params (from AdminOrderDetail "View Customer Page" button)
  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('order')) setOrderNum(p.get('order'));
    if (p.get('email')) setEmail(decodeURIComponent(p.get('email')));
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!orderNum.trim() || !email.trim()) {
      setError('Please enter both your order number and email address.');
      return;
    }
    setLoading(true);
    setError('');
    setOrder(null);

    try {
      const emailNorm = email.toLowerCase().trim();
      const numNorm = orderNum.trim().replace(/^#/, '').toLowerCase();
      const response = await base44.functions.invoke('trackOrder', {
        order_number: numNorm,
        email: emailNorm,
      });
      const found = response.data;

      if (!found) {
        setError('not_found');
        setSearched(true);
        return;
      }

      setOrder(found);
      setSearched(true);
    } catch (err) {
      setError('error');
    } finally {
      setLoading(false);
    }
  };

  const customerStatus = order
    ? getCustomerStatus(order.payment_status, order.fulfillment_status, order.status)
    : null;

  const timelineIdx = TIMELINE_STEPS.findIndex(s => s.key === customerStatus);
  const isTerminal = customerStatus === 'cancelled' || customerStatus === 'refunded';
  const contextMsg = customerStatus ? getContextMessage(customerStatus) : null;

  const hasTracking = order?.tracking_number;
  const isPaid = !!(order && (
    order.payment_status === 'paid' ||
    order.payment_status === 'pay_later' ||
    order.payment_status === 'demo'
  ));
  const effectiveAmountPaid = isPaid
    ? Math.max(Number(order?.amount_paid) || 0, Number(order?.total_amount) || 0)
    : (Number(order?.amount_paid) || 0);
  const balanceDue = order ? Math.max((Number(order.total_amount) || 0) - effectiveAmountPaid, 0) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="text-center mb-2">
          <h1 className="text-3xl font-extrabold text-primary tracking-tight mb-2">Track Your Order</h1>
          <p className="text-muted-foreground text-sm">Enter your order number and email address to view your order status.</p>
        </div>

        {/* ── Search form ── */}
        <div className="bg-white rounded-2xl shadow-md border border-border p-6">
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <Label htmlFor="order-num" className="text-sm font-medium">Order Number</Label>
              <Input
                id="order-num"
                placeholder="e.g. 6A68F2"
                value={orderNum}
                onChange={e => setOrderNum(e.target.value)}
                className="mt-1.5"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="cust-email" className="text-sm font-medium">Email Address</Label>
              <Input
                id="cust-email"
                type="email"
                placeholder="The email used when you placed the order"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="mt-1.5"
                autoComplete="email"
              />
            </div>
            <Button type="submit" className="w-full gap-2 text-base font-semibold" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Searching…</span>
              ) : (
                <span className="flex items-center gap-2"><Package className="w-4 h-4" />Track Order</span>
              )}
            </Button>
          </form>

          {/* Errors */}
          {error === 'not_found' && (
            <div className="mt-4 flex gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">
                We couldn't find an order with that order number and email. Please check your information or contact{' '}
                <a href="mailto:support@ilovehcapparel.net" className="underline font-medium">support@ilovehcapparel.net</a>.
              </p>
            </div>
          )}
          {error === 'error' && (
            <div className="mt-4 flex gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">Something went wrong. Please try again or contact support.</p>
            </div>
          )}
          {error && error !== 'not_found' && error !== 'error' && (
            <div className="mt-4 flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">{error}</p>
            </div>
          )}
        </div>

        {/* ── Order results ── */}
        {order && (
          <div className="space-y-5">

            {/* Order summary */}
            <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="bg-primary px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-primary-foreground/70 text-xs font-semibold uppercase tracking-wider">Order</p>
                  <p className="text-primary-foreground text-xl font-extrabold">#{order.id.slice(-8).toUpperCase()}</p>
                  <p className="text-primary-foreground/70 text-xs mt-0.5">
                    {order.created_date ? format(new Date(order.created_date), 'MMMM d, yyyy') : ''}
                  </p>
                </div>
                <Badge className={`text-sm px-3 py-1 font-semibold ${STATUS_BADGE[customerStatus] || 'bg-gray-100 text-gray-700'}`}>
                  {STATUS_LABEL[customerStatus] || 'Order Received'}
                </Badge>
              </div>

              <div className="px-6 py-5 grid sm:grid-cols-2 gap-5">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold uppercase mb-0.5">Customer</p>
                    <p className="text-sm font-medium">{order.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold uppercase mb-0.5">Payment Status</p>
                    <Badge className={`text-xs ${PAYMENT_BADGE[order.payment_status] || 'bg-gray-100 text-gray-600'}`}>
                      {PAYMENT_LABEL[order.payment_status] || order.payment_status?.replace(/_/g, ' ') || 'Pending'}
                    </Badge>
                  </div>
                  {order.shipping_address?.city && (
                    <div>
                      <p className="text-xs text-muted-foreground font-semibold uppercase mb-0.5">Shipping To</p>
                      <p className="text-sm font-medium flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                        {[order.shipping_address.city, order.shipping_address.state].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="bg-accent/10 rounded-xl p-4">
                    <p className="text-xs text-muted-foreground font-semibold uppercase mb-0.5">Order Total</p>
                    <p className="text-2xl font-extrabold text-primary">${Number(order.total_amount || 0).toFixed(2)}</p>
                  </div>
                  {balanceDue > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
                      <p className="text-xs text-amber-700 font-semibold uppercase mb-0.5">Balance Due</p>
                      <p className="text-lg font-bold text-amber-800">${balanceDue.toFixed(2)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Context message */}
              {contextMsg && (
                <div className="border-t border-border mx-6 py-4">
                  <p className="text-sm text-muted-foreground">{contextMsg}</p>
                </div>
              )}
            </div>

            {/* Status timeline */}
            {!isTerminal && (
              <div className="bg-white rounded-2xl shadow-sm border border-border px-6 py-5">
                <h2 className="text-base font-bold mb-5">Order Progress</h2>
                <div className="space-y-0">
                  {TIMELINE_STEPS.map((step, idx) => {
                    const completed = idx < timelineIdx;
                    const current = idx === timelineIdx;
                    const pending = idx > timelineIdx;
                    const Icon = step.icon;
                    return (
                      <div key={step.key} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                            current
                              ? 'text-white'
                              : completed
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground/40'
                          }`}
                          style={current ? { backgroundColor: '#D97706' } : {}}>
                            <Icon className="w-4 h-4" />
                          </div>
                          {idx < TIMELINE_STEPS.length - 1 && (
                            <div className={`w-0.5 h-6 my-0.5 ${completed ? 'bg-primary' : 'bg-muted'}`} />
                          )}
                        </div>
                        <div className="pt-1.5 pb-3">
                          <p className={`text-sm leading-tight ${
                            current ? 'font-bold' : completed ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'
                          }`}
                          style={current ? { color: '#7A4E00' } : {}}>
                            {step.label}
                          </p>
                          {current && (
                            <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FEF3C7', color: '#B7791F' }}>
                              Current status
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Cancelled / Refunded notice */}
            {isTerminal && (
              <div className="bg-white rounded-2xl shadow-sm border border-border px-6 py-5 flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-sm">{STATUS_LABEL[customerStatus]}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {customerStatus === 'refunded'
                      ? 'This order has been refunded. Please allow a few business days for the refund to appear.'
                      : 'This order has been cancelled. Contact support if you have questions.'}
                  </p>
                </div>
              </div>
            )}

            {/* Items */}
            {order.order_items && order.order_items.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-base font-bold">Items Ordered</h2>
                </div>
                <div className="divide-y divide-border">
                  {order.order_items.map((item, idx) => {
                    const qty = Number(item.quantity || 1);
                    const unitPrice = Number(item.price || 0);
                    const lineTotal = qty * unitPrice;
                    return (
                      <div key={idx} className="flex gap-4 px-6 py-4">
                        <div className="shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-muted border border-border">
                          <img
                            src={item.image_url || item.file_url || item.mockup_file_url || PLACEHOLDER}
                            alt={item.product_name}
                            onError={e => { e.target.src = PLACEHOLDER; }}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm leading-snug">{item.product_name}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                            {item.color && <span><span className="font-medium text-foreground">Color:</span> {item.color}</span>}
                            {item.size && <span><span className="font-medium text-foreground">Size:</span> {item.size}</span>}
                            <span><span className="font-medium text-foreground">Qty:</span> {qty}</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">${unitPrice.toFixed(2)} each</p>
                            <p className="text-sm font-bold text-primary">${lineTotal.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tracking */}
            <div className="bg-white rounded-2xl shadow-sm border border-border px-6 py-5">
              <h2 className="text-base font-bold flex items-center gap-2 mb-4">
                <Truck className="w-4 h-4 text-primary" />Shipment Tracking
              </h2>
              {hasTracking ? (
                <div className="space-y-3">
                  {order.tracking_carrier && (
                    <div>
                      <p className="text-xs text-muted-foreground font-semibold uppercase mb-0.5">Carrier</p>
                      <p className="text-sm font-medium">{order.tracking_carrier}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold uppercase mb-0.5">Tracking Number</p>
                    <p className="text-sm font-mono font-bold">{order.tracking_number}</p>
                  </div>
                  {order.tracking_url && (
                    <Button asChild variant="outline" className="gap-2 w-full sm:w-auto">
                      <a href={order.tracking_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4" />Track Package
                      </a>
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Tracking will appear here once your order ships.</p>
              )}
            </div>

            {/* Help */}
            <div className="bg-secondary/10 rounded-2xl border border-border px-6 py-5 space-y-4">
              <h2 className="text-base font-bold">Need Help?</h2>
              <p className="text-sm text-muted-foreground">Questions about your order? We're here to help.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="outline" className="gap-2 flex-1" asChild>
                  <a href="mailto:support@ilovehcapparel.net">
                    <Mail className="w-4 h-4" />Contact Support
                  </a>
                </Button>
                <Button variant="outline" className="gap-2 flex-1" asChild>
                  <Link to="/ShopGarments">
                    <ShoppingBag className="w-4 h-4" />Continue Shopping
                  </Link>
                </Button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
