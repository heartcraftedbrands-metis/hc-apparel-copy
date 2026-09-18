import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, Truck, X } from 'lucide-react';
import { toast } from 'sonner';

const money = (value) => `$${(Number(value) || 0).toFixed(2)}`;
const addressLine = (address = {}) => [
  address.name,
  address.street || address.line1 || address.address1,
  address.street2 || address.line2,
  [address.city, address.state, address.zip || address.postal_code].filter(Boolean).join(', '),
].filter(Boolean).join(' · ');

export default function BlankFulfillmentDraftModal({ order, onClose, onCreated }) {
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inventory, setInventory] = useState(null);
  const [error, setError] = useState('');
  const items = order?.order_items || [];
  const paid = order?.payment_status === 'paid';
  const balance = Number(order?.balance_due ?? (Number(order?.total_amount) - Number(order?.amount_paid)));
  const shipping = order?.shipping_address || {};
  const addressComplete = Boolean((shipping.street || shipping.line1 || shipping.address1)
    && shipping.city && shipping.state && (shipping.zip || shipping.postal_code));

  const checkInventory = async () => {
    setChecking(true);
    setError('');
    setInventory(null);
    try {
      const { data } = await base44.functions.invoke('ss-activewear', {
        action: 'check_blank_fulfillment_inventory', order_id: order.id,
      });
      if (data?.error) throw new Error(data.error);
      setInventory(data);
    } catch (cause) {
      setError(cause.message || 'Could not check current S&S inventory.');
    } finally {
      setChecking(false);
    }
  };

  const createDraft = async () => {
    if (!inventory?.valid) return;
    setSaving(true);
    setError('');
    try {
      // The server repeats the stock check and locks the paid order before creating one private draft.
      const { data } = await base44.functions.invoke('ss-activewear', {
        action: 'create_blank_fulfillment_draft', order_id: order.id,
      });
      if (data?.error) throw new Error(data.error);
      toast.success(data?.created ? 'S&S fulfillment draft created. No S&S order was submitted.' : 'This order already has an S&S draft.');
      onCreated(data);
    } catch (cause) {
      setError(cause.message || 'Could not create the S&S draft.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[96vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-background shadow-2xl">
        <div className="flex items-center justify-between gap-3 bg-primary px-5 py-4 text-primary-foreground">
          <div><h2 className="text-lg font-extrabold">Create S&amp;S Fulfillment Draft</h2><p className="text-xs opacity-75">Paid order #{order.id.slice(-8).toUpperCase()}</p></div>
          <button type="button" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-5 overflow-y-auto p-5">
          <p className="text-xs font-medium text-muted-foreground">Review customer order → Verify S&amp;S item → Verify shipping address → Check inventory → Create vendor draft</p>
          <section className="rounded-xl border p-4 text-sm">
            <h3 className="mb-2 font-bold">Customer &amp; shipping</h3>
            <p>{order.customer_name || 'Name unavailable'} · {order.customer_email || 'Email unavailable'}</p>
            <p className="mt-1 text-muted-foreground">{addressLine(shipping) || 'Shipping address missing'}</p>
            {!addressComplete && <p className="mt-2 text-red-700">A complete shipping address is required.</p>}
          </section>
          <section className="rounded-xl border p-4 text-sm">
            <h3 className="mb-3 font-bold">Paid order items</h3>
            <div className="space-y-3">{items.map((item, index) => (
              <div key={`${item.sku || index}-${index}`} className="flex gap-3 border-t pt-3 first:border-0 first:pt-0">
                {item.image_url && <img src={item.image_url} alt="" className="h-16 w-16 shrink-0 rounded object-contain" />}
                <div className="min-w-0">
                  <p className="font-semibold">{item.product_name || 'Unnamed garment'}</p>
                  <p className="text-muted-foreground">Style {item.style_number || '—'} · SKU {item.sku || 'Missing'}</p>
                  <p className="text-muted-foreground">{item.color || 'Color missing'} / {item.size || 'Size missing'} · Qty {item.quantity}</p>
                </div>
              </div>
            ))}</div>
          </section>
          <section className="grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-2">
            <div><h3 className="font-bold">Payment</h3><p>Status: {paid ? 'Paid' : 'Not paid'}</p><p>Amount paid: {money(order.amount_paid)}</p><p>Balance due: {money(balance)}</p></div>
            <div><h3 className="font-bold">S&amp;S fulfillment</h3><p>Vendor: S&amp;S Activewear</p><p>Vendor order status: Draft</p><p>Inventory: {inventory ? (inventory.valid ? 'Available' : 'Unavailable or item mismatch') : 'Not checked'}</p></div>
          </section>
          {inventory?.items?.map((item) => <p key={item.sku} className="text-xs text-muted-foreground">{item.sku}: {item.available_quantity} available / {item.requested_quantity} needed · {item.valid ? 'Verified' : item.reason}</p>)}
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No S&amp;S order is submitted until final admin confirmation.</p>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        </div>
        <div className="flex flex-wrap gap-2 border-t p-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" variant="outline" onClick={checkInventory} disabled={checking || saving || !paid || balance > 0 || !addressComplete}>
            {checking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Check S&amp;S Inventory
          </Button>
          <Button type="button" onClick={createDraft} disabled={saving || checking || !inventory?.valid || !paid || balance > 0 || !addressComplete}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}Create S&amp;S Draft
          </Button>
        </div>
      </div>
    </div>
  );
}
