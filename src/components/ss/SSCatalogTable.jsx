import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, ShoppingBag, Tag, Archive, EyeOff, Trash2, Package, Columns, Check } from 'lucide-react';

const STATUS_STYLES = {
  vendor_catalog_only: 'bg-blue-100 text-blue-800',
  added_to_shop: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-600',
  hidden: 'bg-yellow-100 text-yellow-800',
};
const STATUS_LABELS = {
  vendor_catalog_only: 'Catalog Only',
  added_to_shop: 'In Shop',
  archived: 'Archived',
  hidden: 'Hidden',
};

const ALL_COLUMNS = [
  { key: 'image',    label: 'Image' },
  { key: 'brand',    label: 'Brand' },
  { key: 'style',    label: 'Style #' },
  { key: 'name',     label: 'Product Name' },
  { key: 'category', label: 'Category' },
  { key: 'color',    label: 'Color' },
  { key: 'size',     label: 'Size' },
  { key: 'sku',      label: 'SKU' },
  { key: 'cost',     label: 'Blank Cost' },
  { key: 'inv',      label: 'Inventory' },
  { key: 'status',   label: 'Status' },
];

const DEFAULT_VISIBLE = new Set(['image','brand','style','name','cost','inv','status']);

function ItemImage({ url, name }) {
  const [err, setErr] = useState(false);
  if (url && !err) return (
    <img src={url} alt={name} className="w-8 h-8 object-cover rounded" onError={() => setErr(true)} />
  );
  return (
    <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
      <Package className="w-4 h-4 text-muted-foreground/40" />
    </div>
  );
}

function InventoryBadge({ qty }) {
  if (qty === undefined || qty === null || qty === '') return <span className="text-muted-foreground text-xs">—</span>;
  if (qty <= 0) return (
    <span className="text-xs font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">Out of Stock</span>
  );
  return (
    <span className="text-xs font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
      In Stock <span className="font-normal">({qty})</span>
    </span>
  );
}

function ActionButtons({ item, onView, onAddToShop, onCreatePricing, onStatusChange, onDelete }) {
  return (
    <div className="flex items-center gap-0.5">
      <Tip label="View Details">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onView(item)}>
          <Eye className="w-3.5 h-3.5" />
        </Button>
      </Tip>
      <Tip label="Add to Shop">
        <Button size="icon" variant="ghost" className="h-7 w-7 text-green-700" onClick={() => onAddToShop(item)}>
          <ShoppingBag className="w-3.5 h-3.5" />
        </Button>
      </Tip>
      <Tip label="Create Vendor Pricing">
        <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-700" onClick={() => onCreatePricing(item)}>
          <Tag className="w-3.5 h-3.5" />
        </Button>
      </Tip>
      <Tip label="Archive">
        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => onStatusChange(item.id, 'archived')}>
          <Archive className="w-3.5 h-3.5" />
        </Button>
      </Tip>
      <Tip label="Hide">
        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => onStatusChange(item.id, 'hidden')}>
          <EyeOff className="w-3.5 h-3.5" />
        </Button>
      </Tip>
      <Tip label="Delete">
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(item.id)}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </Tip>
    </div>
  );
}

// Simple tooltip wrapper using title for desktop hover
function Tip({ label, children }) {
  return (
    <span title={label} className="relative group">
      {children}
    </span>
  );
}

// ── Column visibility popover ────────────────────────────────────────────────
function ColumnToggle({ visible, setVisible }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setOpen(v => !v)}>
        <Columns className="w-3.5 h-3.5" /> Columns
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-20 bg-white border rounded-xl shadow-lg p-3 min-w-[160px] space-y-1">
            {ALL_COLUMNS.map(col => (
              <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5 rounded hover:bg-muted/50 select-none">
                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${visible.has(col.key) ? 'bg-primary border-primary' : 'border-input'}`}>
                  {visible.has(col.key) && <Check className="w-3 h-3 text-primary-foreground" />}
                </span>
                <input type="checkbox" className="sr-only" checked={visible.has(col.key)}
                  onChange={() => setVisible(prev => {
                    const next = new Set(prev);
                    next.has(col.key) ? next.delete(col.key) : next.add(col.key);
                    return next;
                  })}
                />
                {col.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Mobile card ──────────────────────────────────────────────────────────────
function MobileCard({ item, selectedIds, onToggleSelect, onView, onAddToShop, onCreatePricing, onStatusChange, onDelete }) {
  const isSelected = selectedIds.has(item.id);
  return (
    <div className={`bg-white rounded-xl border p-3 flex gap-3 ${isSelected ? 'border-primary ring-1 ring-primary/30' : ''}`}>
      <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(item.id)} className="mt-0.5 rounded cursor-pointer flex-shrink-0" />
      <ItemImage url={item.image_url} name={item.product_name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{item.product_name}</p>
            <p className="text-xs text-muted-foreground">{item.brand} · {item.style_number}</p>
          </div>
          <Badge className={`text-xs flex-shrink-0 ${STATUS_STYLES[item.catalog_status] || 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABELS[item.catalog_status] || item.catalog_status}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
          {item.color && <span>{item.color}</span>}
          {item.size && <span>{item.size}</span>}
          {item.blank_cost > 0 && <span className="text-primary font-semibold">${item.blank_cost.toFixed(2)}</span>}
          <InventoryBadge qty={item.inventory_qty} />
        </div>
        <div className="mt-2">
          <ActionButtons item={item} onView={onView} onAddToShop={onAddToShop}
            onCreatePricing={onCreatePricing} onStatusChange={onStatusChange} onDelete={onDelete} />
        </div>
      </div>
    </div>
  );
}

// ── Main table ───────────────────────────────────────────────────────────────
export default function SSCatalogTable({
  items, selectedIds, onSelectAll, onToggleSelect,
  onView, onAddToShop, onCreatePricing, onStatusChange, onDelete,
}) {
  const [visibleCols, setVisibleCols] = useState(DEFAULT_VISIBLE);
  const allSelected = items.length > 0 && items.every(i => selectedIds.has(i.id));
  const someSelected = items.some(i => selectedIds.has(i.id));

  const show = (key) => visibleCols.has(key);

  return (
    <div className="space-y-2">
      {/* Column toggle toolbar */}
      <div className="flex justify-end">
        <ColumnToggle visible={visibleCols} setVisible={setVisibleCols} />
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 border-b">
              <tr>
                {/* Sticky checkbox */}
                <th className="sticky left-0 z-10 bg-muted/60 px-2 py-2.5 w-9">
                  <input type="checkbox" checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={e => onSelectAll(e.target.checked)}
                    className="rounded cursor-pointer" />
                </th>
                {show('image')    && <th className="px-2 py-2.5 w-10 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Img</th>}
                {show('brand')    && <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Brand</th>}
                {show('style')    && <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Style #</th>}
                {show('name')     && <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Product Name</th>}
                {show('category') && <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</th>}
                {show('color')    && <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Color</th>}
                {show('size')     && <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Size</th>}
                {show('sku')      && <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">SKU</th>}
                {show('cost')     && <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Blank Cost</th>}
                {show('inv')      && <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Inventory</th>}
                {show('status')   && <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>}
                {/* Sticky actions */}
                <th className="sticky right-0 z-10 bg-muted/60 px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map(item => {
                const isSelected = selectedIds.has(item.id);
                return (
                  <tr key={item.id} className={`transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/20'}`}>
                    <td className="sticky left-0 z-10 bg-inherit px-2 py-2">
                      <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(item.id)} className="rounded cursor-pointer" />
                    </td>
                    {show('image')    && <td className="px-2 py-2"><ItemImage url={item.image_url} name={item.product_name} /></td>}
                    {show('brand')    && <td className="px-2 py-2 font-medium whitespace-nowrap text-xs">{item.brand || '—'}</td>}
                    {show('style')    && <td className="px-2 py-2 text-muted-foreground text-xs">{item.style_number || '—'}</td>}
                    {show('name')     && (
                      <td className="px-2 py-2 max-w-[180px]">
                        <p className="truncate text-xs font-medium" title={item.product_name}>{item.product_name}</p>
                      </td>
                    )}
                    {show('category') && <td className="px-2 py-2 text-muted-foreground text-xs max-w-[100px] truncate">{item.product_category || '—'}</td>}
                    {show('color')    && <td className="px-2 py-2 text-xs">{item.color || '—'}</td>}
                    {show('size')     && <td className="px-2 py-2 text-xs">{item.size || '—'}</td>}
                    {show('sku')      && <td className="px-2 py-2 text-xs text-muted-foreground">{item.sku || '—'}</td>}
                    {show('cost')     && (
                      <td className="px-2 py-2 font-semibold text-primary text-xs whitespace-nowrap">
                        {item.blank_cost ? `$${item.blank_cost.toFixed(2)}` : '—'}
                      </td>
                    )}
                    {show('inv')      && <td className="px-2 py-2"><InventoryBadge qty={item.inventory_qty} /></td>}
                    {show('status')   && (
                      <td className="px-2 py-2">
                        <Badge className={`text-xs ${STATUS_STYLES[item.catalog_status] || 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABELS[item.catalog_status] || item.catalog_status}
                        </Badge>
                      </td>
                    )}
                    <td className="sticky right-0 z-10 bg-white px-2 py-2 border-l">
                      <ActionButtons item={item} onView={onView} onAddToShop={onAddToShop}
                        onCreatePricing={onCreatePricing} onStatusChange={onStatusChange} onDelete={onDelete} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {items.map(item => (
          <MobileCard key={item.id} item={item} selectedIds={selectedIds} onToggleSelect={onToggleSelect}
            onView={onView} onAddToShop={onAddToShop} onCreatePricing={onCreatePricing}
            onStatusChange={onStatusChange} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}