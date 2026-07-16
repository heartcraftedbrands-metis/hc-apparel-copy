import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, ShoppingBag, Tag, Archive, EyeOff, Package, ChevronDown, ChevronUp } from 'lucide-react';

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

function GroupImage({ url, name }) {
  const [err, setErr] = useState(false);
  if (url && !err) return (
    <img src={url} alt={name} className="w-10 h-10 object-cover rounded-lg" onError={() => setErr(true)} />
  );
  return (
    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
      <Package className="w-5 h-5 text-muted-foreground/30" />
    </div>
  );
}

function VariantsDrawer({ group, onClose }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full max-w-xl bg-white z-50 shadow-2xl flex flex-col">
        <div className="flex items-start justify-between p-4 border-b flex-shrink-0">
          <div>
            <p className="font-bold text-sm">{group.brand} {group.style_number} — {group.product_name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{group.variants.length} SKU rows · {group.colors.length} colors · {group.sizes.length} sizes</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-xs min-w-[520px]">
              <thead className="bg-muted/60 border-b">
                <tr>
                  {['Color','Size','SKU','Blank Cost','Inventory','Status'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {group.variants.map((v, i) => (
                  <tr key={v.id || i} className="hover:bg-muted/20">
                    <td className="px-3 py-2">{v.color || '—'}</td>
                    <td className="px-3 py-2">{v.size || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{v.sku || '—'}</td>
                    <td className="px-3 py-2 font-semibold text-primary">{v.blank_cost ? `$${v.blank_cost.toFixed(2)}` : '—'}</td>
                    <td className="px-3 py-2">
                      {(v.inventory_qty || 0) > 0
                        ? <span className="text-green-700 font-medium">{v.inventory_qty}</span>
                        : <span className="text-red-600 font-medium">0</span>
                      }
                    </td>
                    <td className="px-3 py-2">
                      <Badge className={`text-xs ${STATUS_STYLES[v.catalog_status] || 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[v.catalog_status] || v.catalog_status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

export default function SSGroupsTable({ groups, onAddGroupToShop, onCreateGroupPricing, onBulkStatusChange }) {
  const [variantsGroup, setVariantsGroup] = useState(null);

  return (
    <>
      <div className="space-y-3">
        {groups.map(group => (
          <div key={group.key} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            {/* Group header row */}
            <div className="flex items-center gap-3 px-4 py-3">
              <GroupImage url={group.image_url} name={group.product_name} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm truncate">{group.product_name}</p>
                  <Badge className={`text-xs flex-shrink-0 ${STATUS_STYLES[group.catalog_status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABELS[group.catalog_status] || group.catalog_status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {group.brand && <span className="font-medium text-foreground">{group.brand}</span>}
                  {group.style_number && <span> · Style {group.style_number}</span>}
                  {group.product_category && <span> · {group.product_category}</span>}
                </p>
              </div>

              {/* Stats chips */}
              <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                <div className="text-center">
                  <p className="font-bold text-foreground">{group.colors.length}</p>
                  <p>Colors</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-foreground">{group.sizes.length}</p>
                  <p>Sizes</p>
                </div>
                <div className="text-center">
                  <p className={`font-bold ${group.total_inventory > 0 ? 'text-green-700' : 'text-red-600'}`}>{group.total_inventory}</p>
                  <p>Total Inv.</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-primary">
                    {group.min_blank_cost > 0
                      ? group.min_blank_cost === group.max_blank_cost
                        ? `$${group.min_blank_cost.toFixed(2)}`
                        : `$${group.min_blank_cost.toFixed(2)}–$${group.max_blank_cost.toFixed(2)}`
                      : '—'}
                  </p>
                  <p>Blank Cost</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8"
                  title="View Variants" onClick={() => setVariantsGroup(group)}>
                  <Eye className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Variants ({group.variant_count})</span>
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 text-green-700 border-green-300 hover:bg-green-50"
                  title="Add Group to Public Shop as Draft" onClick={() => onAddGroupToShop(group)}>
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Add to Shop</span>
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 text-blue-700 border-blue-300 hover:bg-blue-50"
                  title="Create Vendor Pricing from Group" onClick={() => onCreateGroupPricing(group)}>
                  <Tag className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Pricing</span>
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground"
                  title="Archive Group" onClick={() => onBulkStatusChange(group.variants.map(v => v.id), 'archived')}>
                  <Archive className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground"
                  title="Hide Group" onClick={() => onBulkStatusChange(group.variants.map(v => v.id), 'hidden')}>
                  <EyeOff className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Mobile stats row */}
            <div className="md:hidden flex gap-4 px-4 pb-3 text-xs text-muted-foreground border-t pt-2">
              <span><strong>{group.colors.length}</strong> colors</span>
              <span><strong>{group.sizes.length}</strong> sizes</span>
              <span className={group.total_inventory > 0 ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                {group.total_inventory} total inv.
              </span>
              {group.min_blank_cost > 0 && (
                <span className="text-primary font-medium">
                  {group.min_blank_cost === group.max_blank_cost
                    ? `$${group.min_blank_cost.toFixed(2)}`
                    : `$${group.min_blank_cost.toFixed(2)}–$${group.max_blank_cost.toFixed(2)}`}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Variants drawer */}
      {variantsGroup && (
        <VariantsDrawer group={variantsGroup} onClose={() => setVariantsGroup(null)} />
      )}
    </>
  );
}