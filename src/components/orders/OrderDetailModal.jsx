import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { AlertCircle, X, Package, MapPin, Truck } from 'lucide-react';


const ORDER_STATUSES = [
  { value: 'awaiting_payment', label: 'Pending Payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'in_production', label: 'Processing' },
  { value: 'awaiting_fulfillment', label: 'Ordered From Vendor' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'completed', label: 'Delivered' },
  { value: 'canceled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
];

const statusLabel = (val) => ORDER_STATUSES.find(s => s.value === val)?.label || val?.replace(/_/g, ' ') || 'Pending Payment';

const statusBadgeClass = (val) => {
  const map = {
    awaiting_payment: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    paid: 'bg-green-100 text-green-800 border-green-300',
    in_production: 'bg-blue-100 text-blue-800 border-blue-300',
    awaiting_fulfillment: 'bg-purple-100 text-purple-800 border-purple-300',
    shipped: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    completed: 'bg-green-200 text-green-900 border-green-400',
    canceled: 'bg-red-100 text-red-800 border-red-300',
    refunded: 'bg-gray-100 text-gray-800 border-gray-300',
  };
  return map[val] || 'bg-gray-100 text-gray-700 border-gray-300';
};

export default function OrderDetailModal({ order, onClose, onUpdated }) {
  const [saving, setSaving] = useState(false);
  const [trackingInput, setTrackingInput] = useState('');
  const [showTracking, setShowTracking] = useState(false);
  const currentStatus = order.status || 'awaiting_payment';

  const updateStatus = async (newStatus) => {
    setSaving(true);
    await base44.entities.Order.update(order.id, { status: newStatus });
    setSaving(false);
    onUpdated?.({ ...order, status: newStatus });
  };

  const saveTracking = async () => {
    if (!trackingInput.trim()) return;
    setSaving(true);
    await base44.entities.Order.update(order.id, {
      tracking_number: trackingInput.trim(),
      status: 'shipped',
    });
    setSaving(false);
    setShowTracking(false);
    onUpdated?.({ ...order, tracking_number: trackingInput.trim(), status: 'shipped' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Order #{order.id?.slice(-8).toUpperCase()}</h2>
            <p className="text-sm text-slate-500">{order.created_date ? new Date(order.created_date).toLocaleString() : ''}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Customer Info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Customer</p>
              <p className="font-semibold text-slate-900">{order.customer_name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Email</p>
              <p className="font-medium text-slate-700">{order.customer_email}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Payment Status</p>
              <p className="font-medium capitalize text-slate-700">{order.payment_status?.replace(/_/g, ' ') || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Fulfillment</p>
              <p className="font-medium capitalize text-slate-700">{order.fulfillment_status?.replace(/_/g, ' ') || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Order Total</p>
              <p className="font-bold text-slate-900 text-base">${order.total_amount?.toFixed(2)}</p>
            </div>
            {order.tracking_number && (
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Tracking</p>
                <p className="font-medium text-blue-700">{order.tracking_number}</p>
              </div>
            )}
          </div>

          {/* Shipping Address */}
          {order.has_physical_items && order.shipping_address && (
            <div className="bg-slate-50 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-1.5 mb-1">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span className="font-semibold text-slate-700">Ship To</span>
              </div>
              <p className="text-slate-600">
                {order.shipping_address.street}, {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zip}
              </p>
            </div>
          )}

          {/* Order Items */}
          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5">
              <Package className="w-4 h-4" /> Order Items
            </h3>
            <div className="space-y-3">
              {order.order_items?.map((item, idx) => (
                <div key={idx} className="border rounded-lg p-3 bg-white">
                  <div className="flex gap-3">
                    {/* Image */}
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.product_name}
                        className="w-16 h-16 object-cover rounded border flex-shrink-0"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-16 h-16 bg-slate-100 rounded border flex-shrink-0 flex items-center justify-center">
                        <Package className="w-6 h-6 text-slate-300" />
                      </div>
                    )}
                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 text-sm">{item.product_name}</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1.5 text-xs text-slate-600">
                        {item.color && <span><span className="text-slate-400">Color:</span> {item.color}</span>}
                        {item.size && <span><span className="text-slate-400">Size:</span> {item.size}</span>}
                        <span><span className="text-slate-400">Qty:</span> {item.quantity}</span>
                        <span><span className="text-slate-400">Price:</span> ${item.price?.toFixed(2)}</span>
                        <span className="col-span-2"><span className="text-slate-400">Line Total:</span> <strong>${(item.price * item.quantity).toFixed(2)}</strong></span>
                      </div>
                      {/* SKU */}
                      {item.sku ? (
                        <div className="mt-1.5">
                          <span className="text-xs bg-slate-100 border border-slate-200 rounded px-2 py-0.5 font-mono text-slate-700">
                            SKU: {item.sku}
                          </span>
                        </div>
                      ) : (
                        <div className="mt-1.5 flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                          <AlertCircle className="w-3 h-3 flex-shrink-0" />
                          SKU missing — vendor fulfillment may fail.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Status Controls */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-slate-700 mb-3">Quick Actions</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {['awaiting_payment', 'paid', 'in_production', 'awaiting_fulfillment', 'shipped'].map(s => (
                <button
                  key={s}
                  disabled={saving || currentStatus === s}
                  onClick={() => updateStatus(s)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors disabled:opacity-50 ${
                    currentStatus === s
                      ? statusBadgeClass(s) + ' cursor-default'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {currentStatus === s ? '✓ ' : ''}{statusLabel(s)}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowTracking(!showTracking)}
              className="text-xs px-3 py-1.5 rounded-full border font-medium bg-white text-slate-700 border-slate-300 hover:bg-slate-50 flex items-center gap-1"
            >
              <Truck className="w-3 h-3" /> Add Tracking Number
            </button>
            {showTracking && (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={trackingInput}
                  onChange={e => setTrackingInput(e.target.value)}
                  placeholder="Enter tracking number"
                  className="flex-1 text-sm border rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
                <Button size="sm" onClick={saveTracking} disabled={saving || !trackingInput.trim()}>
                  Save
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}