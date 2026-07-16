import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { AlertTriangle } from 'lucide-react';

const CATEGORY_OPTIONS = [
  'short_sleeve_shirts','mens_short_sleeve_shirts','womens_short_sleeve_shirts','youth_short_sleeve_shirts',
  'long_sleeve_shirts','crewnecks','hoodies','polo_shirts','jackets','sportswear',
  'hats','accessories','other'
];
const SUBTYPE_OPTIONS = [
  { value: 't_shirts', label: 'T-Shirts' }, { value: 'hoodies', label: 'Hoodies' },
  { value: 'sweatshirts', label: 'Sweatshirts' }, { value: 'hats', label: 'Hats' },
  { value: 'kids_apparel', label: 'Kids Apparel' }, { value: 'apparel_blanks', label: 'Apparel Blanks' },
  { value: 'other', label: 'Other' }
];

const selectClass = "w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

export default function AddToShopModal({ item, open, onClose, onSuccess }) {
  const isOutOfStock = !item?.inventory_qty || item.inventory_qty <= 0;

  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [sizesInput, setSizesInput] = useState('');
  const [colorsInput, setColorsInput] = useState('');

  useEffect(() => {
    if (item) {
      setForm({
        name: item.product_name || '',
        description: item.description || '',
        price: item.msrp ? (item.msrp * 1.3).toFixed(2) : '',
        sale_price: '',
        category: 'other',
        product_subtype: 'apparel_blanks',
        visibility: isOutOfStock ? 'draft' : 'draft',
        is_featured: false,
        image_url: item.image_url || '',
      });
      setSizesInput(item.size || '');
      setColorsInput(item.color || '');
    }
  }, [item]);

  if (!item) return null;

  const handleSave = async () => {
    if (!form.price) { toast.error('Please enter a selling price'); return; }
    setSaving(true);
    try {
      const product = await base44.entities.Product.create({
        name: form.name,
        description: form.description,
        price: parseFloat(form.price),
        sale_price: form.sale_price ? parseFloat(form.sale_price) : undefined,
        product_type: 'physical',
        product_subtype: form.product_subtype,
        category: form.category,
        visibility: form.visibility,
        image_url: form.image_url,
        is_active: form.visibility === 'public',
        is_featured: form.is_featured,
        vendor_source: item.vendor || 'S&S Activewear',
        vendor_cost: item.blank_cost || 0,
        blank_garment_cost: item.blank_cost || 0,
        supplier_sku: item.sku || item.style_number || '',
        available_sizes: sizesInput ? sizesInput.split(',').map(s => s.trim()).filter(Boolean) : [],
        available_colors: colorsInput
          ? colorsInput.split(',').map(s => s.trim()).filter(Boolean).map(name => ({ name, hex: '' }))
          : [],
        tags: [item.brand, item.style_number, item.color].filter(Boolean),
        internal_notes: `Imported from S&S Activewear. Style: ${item.style_number || ''}. Color: ${item.color || ''}. SKU: ${item.sku || ''}.`,
      });
      await base44.entities.SSCatalogItem.update(item.id, {
        catalog_status: 'added_to_shop',
        linked_product_id: product.id,
      });
      toast.success('Product added to shop as ' + form.visibility);
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error('Failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to Public Shop</DialogTitle>
        </DialogHeader>

        {/* Source info */}
        <div className="space-y-0.5 mb-2 p-3 bg-muted/40 rounded-lg text-sm">
          <p className="font-semibold">{item.product_name}</p>
          <p className="text-muted-foreground">{item.brand} · {item.style_number} · {item.color} · {item.size}</p>
          <p className="text-xs text-muted-foreground">Blank cost (admin only): ${item.blank_cost?.toFixed(2) || '—'}</p>
        </div>

        {/* Out of stock warning */}
        {isOutOfStock && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 mb-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
            <span>This product has 0 inventory. Keep as Draft until inventory is available.</span>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label>Product Name *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Product name" />
          </div>

          <div>
            <Label>Product Description</Label>
            <textarea
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
              placeholder="Describe this product for customers..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Selling Price * ($)</Label>
              <Input type="number" step="0.01" min="0" placeholder="e.g. 24.99"
                value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>
            <div>
              <Label>Sale Price (optional)</Label>
              <Input type="number" step="0.01" min="0" placeholder="Leave blank if none"
                value={form.sale_price} onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Product Subtype</Label>
              <select className={selectClass} value={form.product_subtype} onChange={e => setForm(f => ({ ...f, product_subtype: e.target.value }))}>
                {SUBTYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <Label>Category</Label>
              <select className={selectClass} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Visibility / Status</Label>
              <select className={selectClass} value={form.visibility} onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))}>
                <option value="draft">Draft (admin only)</option>
                <option value="public" disabled={isOutOfStock}>Public (live on shop)</option>
                <option value="hidden">Hidden</option>
              </select>
              {form.visibility === 'public' && isOutOfStock && (
                <p className="text-xs text-red-600 mt-1">Cannot publish — no inventory.</p>
              )}
            </div>
            <div>
              <Label>Featured Product?</Label>
              <select className={selectClass} value={form.is_featured ? 'yes' : 'no'} onChange={e => setForm(f => ({ ...f, is_featured: e.target.value === 'yes' }))}>
                <option value="no">No</option>
                <option value="yes">Yes — show in featured section</option>
              </select>
            </div>
          </div>

          <div>
            <Label>Product Image URL</Label>
            <Input placeholder="https://..." value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} />
            {form.image_url && (
              <img src={form.image_url} alt="preview" className="mt-2 h-16 w-16 object-cover rounded-lg border" onError={e => e.target.style.display = 'none'} />
            )}
          </div>

          <div>
            <Label>Available Sizes <span className="text-muted-foreground font-normal">(comma-separated, e.g. S, M, L, XL)</span></Label>
            <Input placeholder="S, M, L, XL, 2XL" value={sizesInput} onChange={e => setSizesInput(e.target.value)} />
          </div>

          <div>
            <Label>Available Colors <span className="text-muted-foreground font-normal">(comma-separated)</span></Label>
            <Input placeholder="Black, White, Navy" value={colorsInput} onChange={e => setColorsInput(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button
            onClick={handleSave}
            disabled={saving || (form.visibility === 'public' && isOutOfStock)}
            className="flex-1 bg-primary text-primary-foreground"
          >
            {saving ? 'Saving…' : 'Add to Shop'}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}