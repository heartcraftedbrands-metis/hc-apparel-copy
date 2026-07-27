import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, LockKeyhole, PackageCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { base44 } from '@/api/base44Client';
import { useCart } from '@/components/shop/CartContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createPageUrl } from '@/utils';
import {
  buildSmallOrderCheckoutPayload,
  validateCheckoutCart,
  validateCheckoutCustomer,
} from '@/lib/smallOrderCheckout';

const emptyAddress = {
  street: '',
  city: '',
  state: '',
  zip: '',
  country: 'USA',
};

const initialForm = {
  customer_name: '',
  customer_email: '',
  customer_phone: '',
  shipping_address: emptyAddress,
  billing_address: emptyAddress,
  shipping_method: 'standard',
  delivery_notes: '',
  billing_same_as_shipping: true,
};

function AddressFields({ title, value, onChange }) {
  const set = (key) => (event) => onChange({ ...value, [key]: event.target.value });
  return (
    <fieldset className="space-y-3">
      <legend className="font-semibold">{title}</legend>
      <div>
        <Label>Street address</Label>
        <Input value={value.street} onChange={set('street')} autoComplete="street-address" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>City</Label>
          <Input value={value.city} onChange={set('city')} autoComplete="address-level2" />
        </div>
        <div>
          <Label>State</Label>
          <Input value={value.state} onChange={set('state')} autoComplete="address-level1" />
        </div>
        <div>
          <Label>ZIP code</Label>
          <Input value={value.zip} onChange={set('zip')} autoComplete="postal-code" />
        </div>
      </div>
    </fieldset>
  );
}

export default function Checkout() {
  const navigate = useNavigate();
  const { cart, clearCart } = useCart();
  const [form, setForm] = useState(initialForm);
  const [settings, setSettings] = useState({ payment_mode: 'manual', stripe_connected: false });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState([]);

  const cartErrors = useMemo(() => validateCheckoutCart(cart), [cart]);
  const total = useMemo(
    () => cart.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0),
    [cart],
  );

  useEffect(() => {
    let active = true;
    Promise.all([
      base44.auth.me(),
      base44.functions.invoke('getPublicPaymentSettings', {}).catch(() => ({ data: null })),
    ]).then(([user, paymentResponse]) => {
      if (!active) return;
      setForm(current => ({
        ...current,
        customer_name: user.full_name || '',
        customer_email: user.email || '',
      }));
      if (paymentResponse.data) setSettings(paymentResponse.data);
    }).catch((error) => {
      if (error?.status === 401) base44.auth.redirectToLogin(window.location.href);
      else setErrors([error.message || 'Unable to prepare checkout.']);
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const setField = (key) => (event) => {
    setForm(current => ({ ...current, [key]: event.target.value }));
    setErrors([]);
  };

  const submit = async (event) => {
    event.preventDefault();
    const billingAddress = form.billing_same_as_shipping
      ? { ...form.shipping_address }
      : form.billing_address;
    const customer = { ...form, billing_address: billingAddress };
    const validationErrors = [...cartErrors, ...validateCheckoutCustomer(customer)];
    if (validationErrors.length) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildSmallOrderCheckoutPayload(cart, customer);
      const { data } = await base44.functions.invoke('createSmallOrderCheckout', payload);
      const orderId = data?.order_id;
      if (!orderId) throw new Error('Checkout did not return an order number.');

      if (settings.payment_mode === 'stripe' && settings.stripe_connected) {
        const origin = window.location.origin;
        const payment = await base44.functions.invoke('createStripeCheckoutSession', {
          orderId,
          successUrl: `${origin}/OrderConfirmation?orderId=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}/Checkout`,
        });
        const paymentUrl = payment.data?.checkout_url || payment.data?.sessionUrl;
        if (paymentUrl) {
          clearCart();
          window.location.assign(paymentUrl);
          return;
        }
      }

      clearCart();
      toast.success('Order created securely. Payment confirmation is still required.');
      navigate(`/OrderConfirmation?orderId=${encodeURIComponent(orderId)}`);
    } catch (error) {
      setErrors([error.message || 'Checkout could not be completed.']);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="container mx-auto px-4 py-16 text-center">Preparing secure checkout…</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-10">
        <Link to={createPageUrl('ShopGarments')}>
          <Button variant="ghost" className="mb-5">
            <ArrowLeft className="mr-2 h-4 w-4" /> Continue shopping
          </Button>
        </Link>

        <form onSubmit={submit} className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_420px]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Customer and shipping details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Name</Label>
                    <Input value={form.customer_name} onChange={setField('customer_name')} autoComplete="name" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input value={form.customer_email} readOnly className="bg-muted" />
                  </div>
                  <div>
                    <Label>Phone (optional)</Label>
                    <Input value={form.customer_phone} onChange={setField('customer_phone')} autoComplete="tel" />
                  </div>
                  <div>
                    <Label>Shipping method</Label>
                    <Input value="Standard shipping" readOnly className="bg-muted" />
                  </div>
                </div>

                <AddressFields
                  title="Shipping address"
                  value={form.shipping_address}
                  onChange={(shipping_address) => setForm(current => ({ ...current, shipping_address }))}
                />

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.billing_same_as_shipping}
                    onChange={(event) => setForm(current => ({
                      ...current,
                      billing_same_as_shipping: event.target.checked,
                    }))}
                  />
                  Billing address is the same as shipping
                </label>

                {!form.billing_same_as_shipping && (
                  <AddressFields
                    title="Billing address"
                    value={form.billing_address}
                    onChange={(billing_address) => setForm(current => ({ ...current, billing_address }))}
                  />
                )}

                <div>
                  <Label>Delivery notes (optional)</Label>
                  <Textarea value={form.delivery_notes} onChange={setField('delivery_notes')} rows={3} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Payment connection</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="flex items-center gap-2 font-semibold">
                  <LockKeyhole className="h-4 w-4 text-primary" />
                  Payment status is confirmed by the payment provider or an administrator.
                </p>
                <p className="text-muted-foreground">
                  A vendor order draft cannot be created until payment is confirmed and every customization field passes validation.
                </p>
                {settings.payment_notes_customer && <p>{settings.payment_notes_customer}</p>}
                {!settings.stripe_connected && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                    Online card payment is not connected yet. Your order will remain Awaiting Payment.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Customized order</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {cart.map((item, index) => (
                  <div key={item.customization_id || index} className="border-b pb-4 last:border-0">
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-semibold">{item.product_name || item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.color || item.selectedColor} / {item.size || item.selectedSize} · Qty {item.quantity}
                        </p>
                      </div>
                      <p className="font-semibold">
                        ${((Number(item.price) || 0) * Number(item.quantity || 0)).toFixed(2)}
                      </p>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <p>Artwork: {item.artwork_file_name || 'Missing'}</p>
                      <p>Method: {String(item.decoration_method || '').replace(/_/g, ' ')}</p>
                      <p>Placement: {String(item.print_placement || '').replace(/_/g, ' ')}</p>
                      <p>Print size: {String(item.print_size_option || '').replace(/_/g, ' ')}</p>
                      {item.print_notes && <p>Notes: {item.print_notes}</p>}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-4 text-lg font-bold">
                  <span>Order total</span><span>${total.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            {(cartErrors.length > 0 || errors.length > 0) && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <p className="mb-2 flex items-center gap-2 font-bold">
                  <AlertCircle className="h-4 w-4" /> Checkout needs attention
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  {[...new Set([...cartErrors, ...errors])].map(error => <li key={error}>{error}</li>)}
                </ul>
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={submitting || cartErrors.length > 0}>
              <PackageCheck className="mr-2 h-4 w-4" />
              {submitting ? 'Preparing order…' : 'Create Order & Continue to Payment'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              No S&S or ZeroTouch order is submitted from checkout.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
