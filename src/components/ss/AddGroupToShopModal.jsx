import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { AlertTriangle, Package } from 'lucide-react';
import { cleanSSProductName } from "@/lib/ssProductNameClean";

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

export default function AddGroupToShopModal({ group, open, onClose, onSuccess }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (group) {
      setForm({
        name: cleanSSProductName(group.brand, group.style_number, group.product_name),
        description: '',
        price: '',
        sale_price: '',
        category: 'other',
        product_subtype: 'apparel_blanks',
        visibility: 'draft',
        is_featured: false,
        image_url: group.image_url || '',
      });
    }
  }, [group]);

  if (!group) return null;

  const hasOOSVariants = group.variants.some(v => (v.inventory_qty || 0) <= 0);
  const allOOS = group.variants.every(v => (v.inventory_qty || 0) <= 0);

  const handleSave = async () => {
    if (!form.price) { toast.error('Please enter a selling price'); return; }
    setSaving(true);
    try {
      // Deduplicate colors and sizes from variants
      const colorSet = [...new Set(group.variants.map(v => v.color).filter(Boolean))];
      const sizeSet = [...new Set(group.variants.map(v => v.size).filter(Boolean))];

      const product = await base44.entities.Product.create({
        name: form.name,
        description: form.description,
        price: parseFloat(form.price),
        sale_price: form.sale_price ? parseFloat(form.sale_price) : undefined,
        product_type: 'physical',
        product_subtype: form.product_subtype,
        category: form.category,
        visibility: 'draft', // always draft — never auto-publish
        is_active: false,
        is_featured: form.is_featured,
        image_url: form.image_url,
        vendor_source: group.vendor || 'S&S Activewear',
        vendor_cost: group.min_blank_cost || 0,
        blank_garment_cost: group.min_blank_cost || 0,
        supplier_sku: group.style_number || '',
        available_sizes: sizeSet,
        available_colors: colorSet.map(name => ({ name, hex: '' })),
        tags: [group.brand, group.style_number].filter(Boolean),
        internal_notes: `Grouped from S&S Activewear catalog. Brand: ${group.brand}. Style: ${group.style_number}. ${group.variant_count} SKU rows. Blank cost: $${group.min_blank_cost?.toFixed(2)||'0'}–$${group.max_blank_cost?.toFixed(2)||'0'}. Sizes: ${sizeSet.join(', ')}. Colors: ${colorSet.join(', ')}.`,
      });

      // Mark all variants as added_to_shop with linked product
      await Promise.all(group.variants.map(v =>
        base44.entities.SSCatalogItem.update(v.id, {
          catalog_status: 'added_to_shop',
          linked_product_id: product.id,
        })
      ));

      toast.success(`"${form.name}" created as Draft — set selling price and review before publishing.`);
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
          <DialogTitle>Add Product Group to Shop</DialogTitle>
        </DialogHeader>

        {/* Group summary */}
        <div className="flex gap-3 p-3 bg-muted/40 rounded-xl mb-2">
          {group.image_url ? (
            <img src={group.image_url} alt={group.product_name} className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Package className="w-7 h-7 text-muted-foreground/30" />
            </div>
          )}
          <div className="text-sm min-w-0">
            <p className="font-semibold truncate">{group.product_name}</p>
            <p className="text-muted-foreground text-xs">{group.brand} · Style {group.style_number}</p>
            <p className="text-xs mt-0.5">
              <span className="font-medium">{group.colors.length}</span> colors ·{' '}
              <span className="font-medium">{group.sizes.length}</span> sizes ·{' '}
              <span className="font-medium">{group.variant_count}</span> SKU rows
            </p>
            <p className="text-xs text-primary font-medium">
              Blank cost: ${group.min_blank_cost?.toFixed(2) || '0'}
              {group.min_blank_cost !== group.max_blank_cost ? ` – $${group.max_blank_cost?.toFixed(2)}` : ''}
            </p>
          </div>
        </div>

        {/* Variant preview */}
        <div className="flex flex-wrap gap-1 mb-2">
          {group.colors.slice(0, 8).map(c => (
            <span key={c} className="text-xs bg-muted px-2 py-0.5 rounded-full">{c}</span>
          ))}
          {group.colors.length > 8 && <span className="text-xs text-muted-foreground px-1">+{group.colors.length - 8} more</span>}
        </div>

        {allOOS && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 mb-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
            <span>All variants have 0 inventory. Product will be saved as Draft until inventory is available.</span>
          </div>
        )}
        {hasOOSVariants && !allOOS && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
            <span>Some variants have 0 inventory. Product will be saved as Draft — review before publishing.</span>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label>Product Name *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label>Description</Label>
            <textarea
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3} placeholder="Describe this product for customers..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Selling Price * ($)</Label>
              <Input type="number" step="0.01" min="0" placeholder="e.g. 24.99"
                value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              <p className="text-xs text-muted-foreground mt-1">Blank cost is admin-only and won't appear publicly.</p>
            </div>
            <div>
              <Label>Sale Price (optional)</Label>
              <Input type="number" step="0.01" min="0" placeholder="Leave blank"
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
              <Label>Status</Label>
              <select className={selectClass} value="draft" disabled>
                <option value="draft">Draft (admin only)</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">Always Draft — publish manually after review.</p>
            </div>
            <div>
              <Label>Featured?</Label>
              <select className={selectClass} value={form.is_featured ? 'yes' : 'no'}
                onChange={e => setForm(f => ({ ...f, is_featured: e.target.value === 'yes' }))}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
          </div>
          <div>
            <Label>Product Image URL</Label>
            <Input placeholder="https://..." value={form.image_url}
              onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} />
            {form.image_url && (
              <img src={form.image_url} alt="preview" className="mt-2 h-14 w-14 object-cover rounded-lg border"
                onError={e => e.target.style.display = 'none'} />
            )}
          </div>
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
            <strong>Sizes & Colors</strong> will be automatically set from the {group.variant_count} grouped SKU rows:
            <br />Sizes: {group.sizes.join(', ') || '—'}
            <br />Colors: {group.colors.slice(0, 6).join(', ')}{group.colors.length > 6 ? ` +${group.colors.length - 6} more` : ''}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-primary text-primary-foreground">
            {saving ? 'Creating…' : 'Create Draft Product'}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}