import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle, FileUp, ShoppingBag } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const readInitialForm = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    product_id: params.get('product_id') || '',
    product_name: params.get('product') || '',
    brand: params.get('brand') || '',
    style_number: params.get('style_number') || '',
    sku: params.get('sku') || '',
    color: params.get('color') || '',
    size: params.get('size') || '',
    quantity: Math.min(49, Math.max(1, Number(params.get('quantity')) || 1)),
    image_url: params.get('image_url') || '',
    shipping_street: '',
    shipping_city: '',
    shipping_state: '',
    shipping_postal_code: '',
    shipping_method: 'standard',
    artwork_file_url: '',
    artwork_link: '',
    needs_artwork_help: false,
    notes: '',
  };
};

export default function RequestOrderHelp() {
  const initial = useMemo(readInitialForm, []);
  const [form, setForm] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [orderId, setOrderId] = useState('');

  const set = (key) => (event) => {
    const value = event?.target?.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const uploadArtwork = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm((current) => ({ ...current, artwork_file_url: file_url }));
    } catch (uploadError) {
      setError(uploadError?.status === 401
        ? 'Please sign in before uploading artwork. You can still submit an artwork link or request artwork help.'
        : 'Artwork upload failed. Try again or provide an artwork link.');
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 49) {
      setError('Request Order Help is for orders of 1–49 items. Use Bulk Quote 50+ for larger orders.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await base44.functions.invoke('submitOrderHelpRequest', {
        ...form,
        quantity,
        shipping_address: {
          street: form.shipping_street,
          city: form.shipping_city,
          state: form.shipping_state,
          postal_code: form.shipping_postal_code,
          country: 'US',
        },
      });
      if (!response.data?.success) throw new Error('Order help request failed');
      setOrderId(response.data.order_id);
    } catch (submitError) {
      setError(submitError?.message || 'We could not submit your order request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (orderId) {
    return (
      <div className="min-h-[70vh] bg-background flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white border rounded-2xl p-8 text-center">
          <CheckCircle className="w-14 h-14 text-green-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Order help request received</h1>
          <p className="text-muted-foreground mt-2">
            HC Apparel will review the details and send payment instructions before any vendor order can be created.
          </p>
          <p className="text-sm mt-4">Reference: <span className="font-mono">{orderId.slice(-8).toUpperCase()}</span></p>
          <Link to="/ShopGarments"><Button className="mt-6">Return to Shop Garments</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4 max-w-3xl">
          <ShoppingBag className="w-9 h-9 text-accent mb-3" />
          <h1 className="text-3xl font-bold">Request Order Help 1–49</h1>
          <p className="text-primary-foreground/75 mt-2">
            Smaller orders use this custom order flow. Orders of 50 or more use Bulk Quote 50+.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="container mx-auto px-4 py-10 max-w-3xl space-y-6">
        <section className="bg-white border rounded-2xl p-6 space-y-4">
          <h2 className="font-bold text-lg">Customer and product</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Name *</Label><Input value={form.customer_name} onChange={set('customer_name')} required /></div>
            <div><Label>Email *</Label><Input type="email" value={form.customer_email} onChange={set('customer_email')} required /></div>
            <div><Label>Phone</Label><Input value={form.customer_phone} onChange={set('customer_phone')} /></div>
            <div><Label>Product *</Label><Input value={form.product_name} onChange={set('product_name')} required /></div>
            <div><Label>Brand</Label><Input value={form.brand} onChange={set('brand')} /></div>
            <div><Label>Style number</Label><Input value={form.style_number} onChange={set('style_number')} /></div>
            <div><Label>SKU</Label><Input value={form.sku} onChange={set('sku')} /></div>
            <div><Label>Quantity (1–49) *</Label><Input type="number" min="1" max="49" step="1" value={form.quantity} onChange={set('quantity')} required /></div>
            <div><Label>Color *</Label><Input value={form.color} onChange={set('color')} required /></div>
            <div><Label>Size *</Label><Input value={form.size} onChange={set('size')} required /></div>
          </div>
        </section>

        <section className="bg-white border rounded-2xl p-6 space-y-4">
          <h2 className="font-bold text-lg">Shipping address</h2>
          <div><Label>Street *</Label><Input value={form.shipping_street} onChange={set('shipping_street')} required /></div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div><Label>City *</Label><Input value={form.shipping_city} onChange={set('shipping_city')} required /></div>
            <div><Label>State *</Label><Input value={form.shipping_state} onChange={set('shipping_state')} required /></div>
            <div><Label>ZIP code *</Label><Input value={form.shipping_postal_code} onChange={set('shipping_postal_code')} required /></div>
          </div>
        </section>

        <section className="bg-white border rounded-2xl p-6 space-y-4">
          <h2 className="font-bold text-lg">Artwork and order notes</h2>
          <div>
            <Label htmlFor="small-order-artwork">Upload artwork</Label>
            <div className="mt-1 flex items-center gap-3">
              <Input id="small-order-artwork" type="file" accept=".png,.jpg,.jpeg,.pdf,.svg,.ai,.eps" onChange={uploadArtwork} disabled={uploading} />
              <FileUp className="w-5 h-5 text-muted-foreground" />
            </div>
            {form.artwork_file_url && <p className="text-sm text-green-700 mt-2">Artwork attached securely.</p>}
          </div>
          <div><Label>Artwork link</Label><Input type="url" value={form.artwork_link} onChange={set('artwork_link')} placeholder="https://..." /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.needs_artwork_help} onChange={set('needs_artwork_help')} />
            I need help preparing the artwork
          </label>
          <div><Label>Notes</Label><Textarea rows={4} value={form.notes} onChange={set('notes')} /></div>
        </section>

        {error && (
          <div className="flex gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
          </div>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={submitting || uploading}>
          {submitting ? 'Submitting…' : 'Submit Request Order Help'}
        </Button>
      </form>
    </div>
  );
}
