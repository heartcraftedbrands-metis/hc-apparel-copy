import React, { useState, useEffect } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingBag, Tag, Archive, EyeOff, Package, X, Calendar, Layers } from 'lucide-react';

const STATUS_STYLES = {
  vendor_catalog_only: 'bg-blue-100 text-blue-800',
  added_to_shop: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-600',
  hidden: 'bg-yellow-100 text-yellow-800',
};
const STATUS_LABELS = {
  vendor_catalog_only: 'Catalog Only',
  added_to_shop: 'Added to Shop',
  archived: 'Archived',
  hidden: 'Hidden',
};

function Field({ label, value, highlight }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${highlight ? 'text-primary font-semibold' : ''}`}>{value}</p>
    </div>
  );
}

export default function SSItemDetailModal({ item, open, onClose, onAddToShop, onCreatePricing, onStatusChange }) {
  const [imgErr, setImgErr] = useState(false);

  useEffect(() => { if (item) setImgErr(false); }, [item]);

  if (!item) return null;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Slide-in drawer from right */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white z-50 shadow-2xl flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b flex-shrink-0">
          <div className="min-w-0">
            <p className="font-bold text-sm leading-snug truncate">{item.product_name}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className={`text-xs ${STATUS_STYLES[item.catalog_status] || 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABELS[item.catalog_status] || item.catalog_status}
              </Badge>
              {(item.inventory_qty || 0) <= 0
                ? <span className="text-xs font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full">Out of Stock</span>
                : <span className="text-xs font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">In Stock ({item.inventory_qty})</span>
              }
            </div>
          </div>
          <Button variant="ghost" size="icon" className="flex-shrink-0 h-8 w-8" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Image */}
          <div className="w-full aspect-video rounded-xl border bg-muted overflow-hidden flex items-center justify-center">
            {item.image_url && !imgErr ? (
              <img src={item.image_url} alt={item.product_name}
                className="w-full h-full object-contain"
                onError={() => setImgErr(true)} />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
                <Package className="w-14 h-14" />
                <span className="text-xs font-semibold">No Image</span>
              </div>
            )}
          </div>

          {/* Core product info */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Vendor" value={item.vendor || 'S&S Activewear'} />
            <Field label="Brand" value={item.brand} />
            <Field label="Style Number" value={item.style_number} />
            <Field label="SKU" value={item.sku} />
            <Field label="Product Category" value={item.product_category} />
            <Field label="Color" value={item.color} />
            <Field label="Size" value={item.size} />
            <Field label="Item Status" value={item.item_status} />
          </div>

          {/* Pricing & inventory */}
          <div className="border rounded-xl p-3 bg-muted/30 grid grid-cols-2 gap-3">
            <Field label="Blank Cost (Admin)" value={item.blank_cost ? `$${item.blank_cost.toFixed(2)}` : null} highlight />
            <Field label="MSRP / Suggested Retail" value={item.msrp ? `$${item.msrp.toFixed(2)}` : null} />
            <Field label="Inventory Qty" value={item.inventory_qty !== undefined ? String(item.inventory_qty) : null} />
            <Field label="Warehouse Location" value={item.warehouse_location} />
            <Field label="Weight" value={item.weight} />
            <Field label="Case Quantity" value={item.case_quantity !== undefined ? String(item.case_quantity) : null} />
          </div>

          {/* Import metadata */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground border-t pt-3">
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Imported: {item.import_batch || '—'}</span>
            {item.linked_product_id && <span className="flex items-center gap-1 text-green-700"><Layers className="w-3.5 h-3.5" /> Linked to shop product</span>}
            {item.linked_vendor_pricing_id && <span className="flex items-center gap-1 text-blue-700"><Tag className="w-3.5 h-3.5" /> Vendor pricing created</span>}
          </div>

          {/* Description */}
          {item.description && (
            <div className="border-t pt-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Description</p>
              <p className="text-sm leading-relaxed">{item.description}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t p-4 flex flex-wrap gap-2 flex-shrink-0 bg-white">
          <Button className="gap-2 bg-primary text-primary-foreground flex-1" onClick={() => { onAddToShop(item); onClose(); }}>
            <ShoppingBag className="w-4 h-4" /> Add to Shop
          </Button>
          <Button variant="outline" className="gap-2 border-blue-300 text-blue-700 flex-1" onClick={() => { onCreatePricing(item); onClose(); }}>
            <Tag className="w-4 h-4" /> Create Pricing
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => { onStatusChange(item.id, 'archived'); onClose(); }}>
            <Archive className="w-3.5 h-3.5" /> Archive
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => { onStatusChange(item.id, 'hidden'); onClose(); }}>
            <EyeOff className="w-3.5 h-3.5" /> Hide
          </Button>
        </div>
      </div>
    </>
  );
}