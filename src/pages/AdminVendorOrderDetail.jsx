import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Printer, ChevronLeft, Save, Package, Truck, DollarSign, CheckCircle2, 
  AlertCircle, MapPin, FileText
} from 'lucide-react';
import { toast } from "sonner";
import MarginBadge from '@/components/profit/MarginBadge';
import CustomerNotificationsSection from '@/components/orders/CustomerNotificationsSection';
import ProductionPacket from '@/components/orders/ProductionPacket';
import ProductionWorkflowPanel from '@/components/orders/ProductionWorkflowPanel';

const updateCustomerOrderTracking = async (customerOrderId, trackingData) => {
  if (!customerOrderId) return;
  try {
    const updateData = {};
    if (trackingData.tracking_number) updateData.tracking_number = trackingData.tracking_number;
    if (trackingData.tracking_carrier) updateData.tracking_carrier = trackingData.tracking_carrier;
    if (trackingData.tracking_url) updateData.tracking_url = trackingData.tracking_url;
    if (Object.keys(updateData).length > 0) {
      await base44.entities.Order.update(customerOrderId, updateData);
    }
  } catch (err) {
    console.error('Error syncing tracking to customer order:', err);
  }
};

const STATUSES = [
  'draft', 'ready_to_place', 'sent_to_vendor', 'accepted', 
  'in_production', 'shipped', 'delivered', 'issue_hold', 'canceled'
];

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-700',
  ready_to_place: 'bg-blue-100 text-blue-700',
  sent_to_vendor: 'bg-cyan-100 text-cyan-700',
  accepted: 'bg-green-100 text-green-700',
  in_production: 'bg-orange-100 text-orange-700',
  shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  issue_hold: 'bg-red-100 text-red-700',
  canceled: 'bg-gray-200 text-gray-500',
};

export default function AdminVendorOrderDetail() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const vendorOrderId = urlParams.get('id');

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [checklist, setChecklist] = useState({});

  const { data: vendorOrder, isLoading, refetch: refetchVendorOrder } = useQuery({
    queryKey: ['vendor-order-detail', vendorOrderId],
    queryFn: () => vendorOrderId ? base44.entities.VendorOrder.get(vendorOrderId) : null,
  });

  const { data: customerOrder, refetch: refetchCustomerOrder } = useQuery({
    queryKey: ['customer-order-ref', vendorOrder?.customer_order_id],
    queryFn: () => vendorOrder?.customer_order_id ? base44.entities.Order.get(vendorOrder.customer_order_id) : null,
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.VendorOrder.update(vendorOrderId, data),
    onSuccess: () => {
      qc.invalidateQueries(['vendor-order-detail', vendorOrderId]);
      toast.success('Vendor order updated');
    },
  });

  // Initialize form and checklist when data loads
  React.useEffect(() => {
    if (vendorOrder) {
      setForm({
        status: vendorOrder.status || 'draft',
        tracking_number: vendorOrder.tracking_number || '',
        tracking_carrier: vendorOrder.tracking_carrier || '',
        tracking_url: vendorOrder.tracking_url || '',
        ship_date: vendorOrder.ship_date || '',
        estimated_delivery_date: vendorOrder.estimated_delivery_date || '',
        shipping_notes: vendorOrder.shipping_notes || '',
        production_notes: vendorOrder.production_notes || '',
        internal_notes: vendorOrder.internal_notes || '',
      });
      setChecklist(vendorOrder.fulfillment_checklist || {});
    }
  }, [vendorOrder]);

  const handleStatusChange = (newStatus) => {
    setForm(p => ({ ...p, status: newStatus }));
  };

  const handleChecklistChange = (key, value) => {
    setChecklist(p => ({ ...p, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const dataToSave = {
        ...form,
        fulfillment_checklist: checklist,
      };
      await updateMutation.mutateAsync(dataToSave);
      // Sync tracking info to linked customer order
      await updateCustomerOrderTracking(vendorOrder.customer_order_id, {
        tracking_number: form.tracking_number,
        tracking_carrier: form.tracking_carrier,
        tracking_url: form.tracking_url,
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading vendor order...</div>
      </div>
    );
  }

  if (!vendorOrder) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-amber-600" />
          <p className="text-muted-foreground mb-4">Vendor order not found</p>
          <Button onClick={() => navigate('/AdminVendorOrders')}>Back to Orders</Button>
        </div>
      </div>
    );
  }

  const qty = (vendorOrder.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0) || 1;
  const blankTotal = (Number(vendorOrder.blank_garment_cost) || 0) * qty;
  const printTotal = (Number(vendorOrder.print_cost) || 0) * qty;
  const flatCost = (Number(vendorOrder.setup_fee) || 0) + (Number(vendorOrder.shipping_cost) || 0) + (Number(vendorOrder.other_fees) || 0);
  const totalCost = blankTotal + printTotal + flatCost;
  const revenue = Number(vendorOrder.customer_sell_price) || 0;
  const profit = revenue > 0 ? revenue - totalCost : 0;
  const margin = revenue > 0 ? (profit / revenue * 100) : 0;

  const addr = customerOrder?.shipping_address;
  const shippingStr = addr ? [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ') : '';

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-primary text-primary-foreground py-6 px-4">
        <div className="container mx-auto">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={() => navigate('/AdminVendorOrders')}>
              <ChevronLeft className="w-4 h-4 mr-1" />Back
            </Button>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={handlePrint} className="gap-2">
                <Printer className="w-4 h-4" />Print Sheet
              </Button>
              <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2" onClick={handleSave} disabled={saving}>
                <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Vendor Order #{vendorOrder.id.slice(-8).toUpperCase()}</h1>
            <p className="text-primary-foreground/70">Linked Customer Order: {customerOrder?.customer_name} #{vendorOrder.customer_order_id.slice(-6)}</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-3 gap-6 mb-8">
          {/* Left column: Order info */}
          <div className="col-span-2 space-y-6">
            
            {/* Status & Header */}
            <div className="bg-white rounded-2xl border p-6">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><Package className="w-5 h-5" />Vendor Order Status</h2>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Current Status</p>
                  <Badge className={`text-sm ${STATUS_COLORS[form.status] || 'bg-gray-100'}`}>{form.status?.replace(/_/g, ' ')}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Vendor</p>
                  <p className="font-semibold">{vendorOrder.vendor_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Created</p>
                  <p className="font-semibold text-sm">{new Date(vendorOrder.created_date).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="mb-6">
                <label className="text-sm font-medium block mb-2">Change Status</label>
                <Select value={form.status} onValueChange={handleStatusChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => (
                      <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant={form.status === 'ready_to_place' ? 'default' : 'outline'} onClick={() => handleStatusChange('ready_to_place')}>Mark Ready to Place</Button>
                <Button size="sm" variant={form.status === 'sent_to_vendor' ? 'default' : 'outline'} onClick={() => handleStatusChange('sent_to_vendor')}>Mark Sent to Vendor</Button>
                <Button size="sm" variant={form.status === 'shipped' ? 'default' : 'outline'} onClick={() => handleStatusChange('shipped')}>Mark Shipped</Button>
                <Button size="sm" variant={form.status === 'delivered' ? 'default' : 'outline'} onClick={() => handleStatusChange('delivered')}>Mark Delivered</Button>
              </div>
            </div>

            <ProductionWorkflowPanel
              order={customerOrder}
              vendorOrder={vendorOrder}
              onUpdated={async () => {
                await Promise.all([refetchVendorOrder(), refetchCustomerOrder()]);
                qc.invalidateQueries({ queryKey: ['customer-notifications', customerOrder?.id] });
              }}
            />

            <ProductionPacket order={customerOrder || {}} vendorOrder={vendorOrder} />

            {customerOrder && (
              <CustomerNotificationsSection orderId={customerOrder.id} order={customerOrder} />
            )}

            {/* Customer Shipping Address */}
            <div className="bg-white rounded-2xl border p-6">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><MapPin className="w-5 h-5" />Customer Shipping Address</h2>
              {customerOrder?.shipping_address ? (
                <div className="space-y-2 text-sm">
                  <p className="font-semibold">{customerOrder.customer_name}</p>
                  <p>{customerOrder.shipping_address.street}</p>
                  <p>{customerOrder.shipping_address.city}, {customerOrder.shipping_address.state} {customerOrder.shipping_address.zip}</p>
                  {customerOrder.shipping_address.country && <p>{customerOrder.shipping_address.country}</p>}
                  {customerOrder.delivery_notes && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground mb-1">Delivery Notes:</p>
                      <p className="text-muted-foreground">{customerOrder.delivery_notes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No shipping address on file</p>
              )}
            </div>

            {/* Fulfillment Items */}
            <div className="bg-white rounded-2xl border p-6">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><Package className="w-5 h-5" />Fulfillment Items</h2>
              <div className="space-y-4">
                {vendorOrder.items?.map((item, idx) => (
                  <div key={idx} className="border rounded-xl p-4 bg-muted/20">
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Product</p>
                        <p className="font-semibold">{item.product_name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Quantity</p>
                        <p className="font-semibold">{item.quantity}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-xs">
                      {item.garment_brand && (
                        <div>
                          <p className="text-muted-foreground">Brand</p>
                          <p className="font-medium">{item.garment_brand}</p>
                        </div>
                      )}
                      {item.garment_style_number && (
                        <div>
                          <p className="text-muted-foreground">Style #</p>
                          <p className="font-medium">{item.garment_style_number}</p>
                        </div>
                      )}
                      {item.garment_color && (
                        <div>
                          <p className="text-muted-foreground">Color</p>
                          <p className="font-medium">{item.garment_color}</p>
                        </div>
                      )}
                      {item.garment_size && (
                        <div>
                          <p className="text-muted-foreground">Size</p>
                          <p className="font-medium">{item.garment_size}</p>
                        </div>
                      )}
                    </div>
                    {item.sku && (
                      <div className="mt-3 pt-3 border-t text-xs">
                        <p className="text-muted-foreground">SKU (Admin)</p>
                        <p className="font-mono font-semibold text-foreground">{item.sku}</p>
                      </div>
                    )}
                    {(item.print_method || item.print_placement) && (
                      <div className="mt-3 pt-3 border-t text-xs space-y-1">
                        {item.print_method && <p><span className="text-muted-foreground">Print Method:</span> {item.print_method}</p>}
                        {item.print_placement && <p><span className="text-muted-foreground">Placement:</span> {item.print_placement}</p>}
                        {item.print_details && <p><span className="text-muted-foreground">Notes:</span> {item.print_details}</p>}
                      </div>
                    )}
                    {item.artwork_link && (
                      <div className="mt-3 pt-3 border-t text-xs">
                        <p className="text-muted-foreground mb-1">Artwork Link</p>
                        <a href={item.artwork_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 break-all hover:underline">{item.artwork_link}</a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Tracking Information */}
            <div className="bg-white rounded-2xl border p-6">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><Truck className="w-5 h-5" />Tracking & Shipping</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium block mb-2">Tracking Number</label>
                    <Input 
                      value={form.tracking_number} 
                      onChange={e => setForm(p => ({ ...p, tracking_number: e.target.value }))}
                      placeholder="e.g. 1Z999AA10123456784"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-2">Carrier</label>
                    <Input 
                      value={form.tracking_carrier}
                      onChange={e => setForm(p => ({ ...p, tracking_carrier: e.target.value }))}
                      placeholder="e.g. FedEx, UPS, USPS"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">Tracking URL</label>
                  <Input 
                    value={form.tracking_url}
                    onChange={e => setForm(p => ({ ...p, tracking_url: e.target.value }))}
                    placeholder="e.g. https://tracking.fedex.com/..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium block mb-2">Ship Date</label>
                    <Input 
                      type="date"
                      value={form.ship_date}
                      onChange={e => setForm(p => ({ ...p, ship_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-2">Est. Delivery Date</label>
                    <Input 
                      type="date"
                      value={form.estimated_delivery_date}
                      onChange={e => setForm(p => ({ ...p, estimated_delivery_date: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-2xl border p-6">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><FileText className="w-5 h-5" />Notes</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-2">Shipping Notes</label>
                  <textarea 
                    value={form.shipping_notes}
                    onChange={e => setForm(p => ({ ...p, shipping_notes: e.target.value }))}
                    rows={3}
                    className="w-full border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Special handling, delivery instructions, etc."
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">Production Notes</label>
                  <textarea 
                    value={form.production_notes}
                    onChange={e => setForm(p => ({ ...p, production_notes: e.target.value }))}
                    rows={3}
                    className="w-full border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Vendor-specific production instructions"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">Internal Notes (Admin Only)</label>
                  <textarea 
                    value={form.internal_notes}
                    onChange={e => setForm(p => ({ ...p, internal_notes: e.target.value }))}
                    rows={3}
                    className="w-full border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Internal team notes, follow-ups, issues, etc."
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Right column: Cost summary & Checklist */}
          <div className="space-y-6">
            
            {/* Cost Summary */}
            <div className="bg-white rounded-2xl border p-6">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><DollarSign className="w-5 h-5" />Cost Summary</h2>
              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Customer Order Total</span>
                  <span className="font-semibold">${revenue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Blank Cost (×{qty})</span>
                  <span>${blankTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Print Cost (×{qty})</span>
                  <span>${printTotal.toFixed(2)}</span>
                </div>
                {Number(vendorOrder.setup_fee) > 0 && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Setup Fee</span>
                    <span>${(Number(vendorOrder.setup_fee) || 0).toFixed(2)}</span>
                  </div>
                )}
                {Number(vendorOrder.shipping_cost) > 0 && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Shipping Estimate</span>
                    <span>${(Number(vendorOrder.shipping_cost) || 0).toFixed(2)}</span>
                  </div>
                )}
                {Number(vendorOrder.other_fees) > 0 && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Other Fees</span>
                    <span>${(Number(vendorOrder.other_fees) || 0).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-2">
                  <span>Total Vendor Cost</span>
                  <span className="text-red-600">${totalCost.toFixed(2)}</span>
                </div>
              </div>
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <span className="font-semibold">Est. Profit</span>
                  <span className={`text-lg font-bold ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>${profit.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Margin</span>
                  {revenue > 0 ? <MarginBadge margin={margin} size="sm" /> : <span className="text-xs text-muted-foreground">—</span>}
                </div>
              </div>
            </div>

            {/* Fulfillment Checklist */}
            <div className="bg-white rounded-2xl border p-6">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><CheckCircle2 className="w-5 h-5" />Fulfillment Checklist</h2>
              <div className="space-y-3">
                {[
                  { key: 'order_reviewed', label: 'Customer order reviewed' },
                  { key: 'size_color_confirmed', label: 'Size and color confirmed' },
                  { key: 'vendor_product_checked', label: 'Vendor product checked' },
                  { key: 'inventory_checked', label: 'Inventory checked' },
                  { key: 'vendor_order_placed', label: 'Vendor order placed' },
                  { key: 'tracking_added', label: 'Tracking added' },
                  { key: 'customer_notified', label: 'Customer notified' },
                  { key: 'order_completed', label: 'Order completed' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <Checkbox
                      checked={checklist[key] || false}
                      onCheckedChange={(checked) => handleChecklistChange(key, checked)}
                      id={key}
                    />
                    <label htmlFor={key} className="text-sm font-medium cursor-pointer">{label}</label>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
              <h2 className="font-bold text-lg mb-4 text-blue-900">Quick Actions</h2>
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start"
                  onClick={() => navigate(`/AdminOrderDetail?id=${vendorOrder.customer_order_id}`)}
                >
                  View Customer Order
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start"
                  onClick={handlePrint}
                >
                  <Printer className="w-4 h-4 mr-2" />Print Fulfillment Sheet
                </Button>
              </div>
            </div>

          </div>
        </div>

        {/* Save button at bottom */}
        <div className="flex gap-3 sticky bottom-4">
          <Button 
            size="lg"
            className="flex-1 gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={handleSave}
            disabled={saving}
          >
            <Save className="w-5 h-5" />{saving ? 'Saving...' : 'Save All Changes'}
          </Button>
          <Button 
            size="lg"
            variant="outline"
            onClick={() => navigate('/AdminVendorOrders')}
          >
            Back to Orders
          </Button>
        </div>
      </div>

      {/* Print Stylesheet */}
      <style>{`
        @media print {
          body > * { display: none; }
          .print-only { display: block !important; }
        }
      `}</style>

      {/* Printable Fulfillment Sheet (hidden until print) */}
      <div className="print-only hidden">
        <PrintFulfillmentSheet vendorOrder={vendorOrder} customerOrder={customerOrder} />
      </div>
    </div>
  );
}

function PrintFulfillmentSheet({ vendorOrder, customerOrder }) {
  return (
    <div className="p-12 bg-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">FULFILLMENT SHEET</h1>
        <div className="grid grid-cols-2 gap-8 text-sm">
          <div>
            <p className="text-muted-foreground">Vendor Order #</p>
            <p className="text-xl font-bold">{vendorOrder.id.slice(-8).toUpperCase()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Customer Order #</p>
            <p className="text-xl font-bold">{vendorOrder.customer_order_id.slice(-8).toUpperCase()}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mb-8 text-sm">
        <div className="border rounded-lg p-4">
          <h3 className="font-bold mb-3">Customer Information</h3>
          <p className="font-semibold">{customerOrder?.customer_name}</p>
          {customerOrder?.customer_email && <p>{customerOrder.customer_email}</p>}
          {customerOrder?.customer_phone && <p>{customerOrder.customer_phone}</p>}
        </div>
        <div className="border rounded-lg p-4">
          <h3 className="font-bold mb-3">Vendor</h3>
          <p className="font-semibold">{vendorOrder.vendor_name}</p>
          <p className="text-muted-foreground text-xs mt-2">Order Date: {new Date(vendorOrder.created_date).toLocaleDateString()}</p>
        </div>
      </div>

      <div className="border rounded-lg p-4 mb-8">
        <h3 className="font-bold mb-3">Shipping Address</h3>
        {customerOrder?.shipping_address ? (
          <div className="text-sm space-y-1">
            <p className="font-semibold">{customerOrder.customer_name}</p>
            <p>{customerOrder.shipping_address.street}</p>
            <p>{customerOrder.shipping_address.city}, {customerOrder.shipping_address.state} {customerOrder.shipping_address.zip}</p>
            {customerOrder.shipping_address.country && <p>{customerOrder.shipping_address.country}</p>}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No address on file</p>
        )}
      </div>

      <table className="w-full text-sm mb-8 border-collapse">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="text-left p-2 font-bold">Product</th>
            <th className="text-left p-2 font-bold">Brand</th>
            <th className="text-left p-2 font-bold">Style #</th>
            <th className="text-left p-2 font-bold">Size</th>
            <th className="text-left p-2 font-bold">Color</th>
            <th className="text-center p-2 font-bold">Qty</th>
            <th className="text-left p-2 font-bold">SKU</th>
          </tr>
        </thead>
        <tbody>
          {vendorOrder.items?.map((item, idx) => (
            <tr key={idx} className="border-b">
              <td className="p-2">{item.product_name}</td>
              <td className="p-2">{item.garment_brand || '—'}</td>
              <td className="p-2">{item.garment_style_number || '—'}</td>
              <td className="p-2">{item.garment_size || '—'}</td>
              <td className="p-2">{item.garment_color || '—'}</td>
              <td className="text-center p-2">{item.quantity}</td>
              <td className="p-2 font-mono text-xs">{item.sku || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {(vendorOrder.print_cost || vendorOrder.shipping_notes || vendorOrder.production_notes) && (
        <div className="border rounded-lg p-4 mb-8">
          <h3 className="font-bold mb-3">Instructions</h3>
          {vendorOrder.print_cost > 0 && <p className="text-sm mb-2"><strong>Print Cost:</strong> ${vendorOrder.print_cost.toFixed(2)} per item</p>}
          {vendorOrder.shipping_notes && <p className="text-sm mb-2"><strong>Shipping Notes:</strong> {vendorOrder.shipping_notes}</p>}
          {vendorOrder.production_notes && <p className="text-sm"><strong>Production Notes:</strong> {vendorOrder.production_notes}</p>}
        </div>
      )}

      <div className="border rounded-lg p-4">
        <h3 className="font-bold mb-3">Fulfillment Checklist</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { key: 'order_reviewed', label: '☐ Order Reviewed' },
            { key: 'size_color_confirmed', label: '☐ Size/Color Confirmed' },
            { key: 'vendor_product_checked', label: '☐ Product Checked' },
            { key: 'inventory_checked', label: '☐ Inventory Checked' },
            { key: 'vendor_order_placed', label: '☐ Order Placed' },
            { key: 'tracking_added', label: '☐ Tracking Added' },
            { key: 'customer_notified', label: '☐ Customer Notified' },
            { key: 'order_completed', label: '☐ Order Completed' },
          ].map(({ label }) => (
            <p key={label}>{label}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
