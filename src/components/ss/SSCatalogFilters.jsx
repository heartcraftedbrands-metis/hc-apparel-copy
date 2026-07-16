import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Search, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from "@/components/ui/button";

const DEFAULT_FILTERS = {
  search: '', brand: 'all', category: 'all', color: 'all', size: 'all',
  status: 'all', stockFilter: 'all', minCost: '', maxCost: '', sort: 'newest',
};

export default function SSCatalogFilters({ items, filters, setFilters }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const brands = [...new Set(items.map(i => i.brand).filter(Boolean))].sort();
  const categories = [...new Set(items.map(i => i.product_category).filter(Boolean))].sort();
  const colors = [...new Set(items.map(i => i.color).filter(Boolean))].sort();
  const sizes = [...new Set(items.map(i => i.size).filter(Boolean))].sort();

  const statuses = [
    { value: 'all', label: 'All Status' },
    { value: 'vendor_catalog_only', label: 'Catalog Only' },
    { value: 'added_to_shop', label: 'Added to Shop' },
    { value: 'archived', label: 'Archived' },
    { value: 'hidden', label: 'Hidden' },
  ];
  const stockOptions = [
    { value: 'all', label: 'All Stock' },
    { value: 'in_stock', label: 'In Stock Only' },
    { value: 'out_of_stock', label: 'Out of Stock Only' },
  ];

  const selectClass = "h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

  const hasFilters = filters.search || filters.brand !== 'all' || filters.category !== 'all' ||
    filters.color !== 'all' || filters.size !== 'all' || filters.status !== 'all' ||
    filters.stockFilter !== 'all' || filters.minCost || filters.maxCost || filters.sort !== 'newest';

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-4 space-y-3">
      {/* Row 1: Search + primary filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search name, brand, style #, SKU..."
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            className="pl-9"
          />
        </div>
        <select className={selectClass} value={filters.brand} onChange={e => setFilters(f => ({ ...f, brand: e.target.value }))}>
          <option value="all">All Brands</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className={selectClass} value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={selectClass} value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className={selectClass} value={filters.stockFilter} onChange={e => setFilters(f => ({ ...f, stockFilter: e.target.value }))}>
          {stockOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <Button
          variant="ghost" size="sm"
          className="text-muted-foreground gap-1 whitespace-nowrap"
          onClick={() => setShowAdvanced(v => !v)}
        >
          More Filters {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-1"
            onClick={() => setFilters(DEFAULT_FILTERS)}>
            <X className="w-3.5 h-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Row 2: Advanced filters */}
      {showAdvanced && (
        <div className="flex flex-wrap gap-3 items-center pt-2 border-t">
          <select className={selectClass} value={filters.color} onChange={e => setFilters(f => ({ ...f, color: e.target.value }))}>
            <option value="all">All Colors</option>
            {colors.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={selectClass} value={filters.size} onChange={e => setFilters(f => ({ ...f, size: e.target.value }))}>
            <option value="all">All Sizes</option>
            {sizes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Blank Cost:</span>
            <Input
              type="number" step="0.01" placeholder="Min $" className="w-24 h-9"
              value={filters.minCost}
              onChange={e => setFilters(f => ({ ...f, minCost: e.target.value }))}
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number" step="0.01" placeholder="Max $" className="w-24 h-9"
              value={filters.maxCost}
              onChange={e => setFilters(f => ({ ...f, maxCost: e.target.value }))}
            />
          </div>
          <select className={selectClass} value={filters.sort} onChange={e => setFilters(f => ({ ...f, sort: e.target.value }))}>
            <option value="newest">Newest Import</option>
            <option value="lowest_cost">Lowest Cost</option>
            <option value="highest_cost">Highest Cost</option>
            <option value="name_az">Name A–Z</option>
            <option value="brand_az">Brand A–Z</option>
          </select>
        </div>
      )}
    </div>
  );
}