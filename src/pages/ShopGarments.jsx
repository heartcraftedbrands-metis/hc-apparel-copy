import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/components/shop/CartContext";
import { toast } from "sonner";
import { SlidersHorizontal, Search, X, Star, Sparkles, MessageSquare, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import GarmentProductCard from "@/components/shop/GarmentProductCard";
import { filterPublicProducts } from "@/lib/productVisibility";
import { SS_ACTIVEWEAR_BRANDS, brandFilterValue } from '@/lib/ssBrands';

const TYPE_FILTERS = [
  { value: 'all', label: 'All Products' },
  { value: 't_shirts', label: 'T-Shirts', cats: ['short_sleeve_shirts','mens_short_sleeve_shirts','womens_short_sleeve_shirts'] },
  { value: 'tank_tops', label: 'Tank Tops', cats: ['short_sleeve_shirts','mens_short_sleeve_shirts','womens_short_sleeve_shirts'], nameMatch: 'tank' },
  { value: 'womens', label: "Women's", cats: ['womens_short_sleeve_shirts','womens_long_sleeve_shirts','womens_crewnecks','womens_polo_shirts','womens_jackets','womens_sportswear'] },
  { value: 'sportswear', label: 'Sports / Activewear', cats: ['sportswear','mens_sportswear','womens_sportswear','youth_sportswear'] },
  { value: 'hoodies', label: 'Hoodies', cats: ['hoodies'] },
  { value: 'long_sleeve', label: 'Long Sleeve', cats: ['long_sleeve_shirts','mens_long_sleeve_shirts','womens_long_sleeve_shirts'] },
  { value: 'hats', label: 'Hats', cats: ['hats'] },
  { value: 'kids', label: 'Kids Apparel', cats: ['youth_short_sleeve_shirts','youth_long_sleeve_shirts','youth_crewnecks','youth_polo_shirts','youth_jackets','youth_sportswear'] },
  ...SS_ACTIVEWEAR_BRANDS.map(brand => ({
    value: brandFilterValue(brand),
    label: brand,
    brandMatch: brand.toLowerCase(),
  })),
  { value: 'apparel_blanks', label: 'Apparel Blanks', subtypes: ['apparel_blanks'] },
  { value: 'custom_printed', label: 'Custom Printed', subtypes: ['custom_printed'] },
  { value: 'print_support', label: 'Print Support', cats: ['other', 'accessories'], subtypes: ['print_support'] },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'featured', label: 'Featured' },
  { value: 'best_sellers', label: 'Best Sellers' },
  { value: 'price_asc', label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
];

const COMMON_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'One Size'];

function matchesTypeFilter(product, typeValue) {
  if (typeValue === 'all') return true;
  const filter = TYPE_FILTERS.find(f => f.value === typeValue);
  if (!filter) return false;
  const pCats = product.categories?.length ? product.categories : (product.category ? [product.category] : []);
  const subtype = product.product_subtype || '';
  const nameLower = (product.name || '').toLowerCase();
  const vendorLower = (product.vendor_source || product.internal_notes || '').toLowerCase();
  if (filter.subtypes?.includes(subtype)) return true;
  if (filter.cats?.some(c => pCats.includes(c))) return true;
  if (filter.nameMatch && nameLower.includes(filter.nameMatch)) return true;
  if (filter.brandMatch && (nameLower.includes(filter.brandMatch) || vendorLower.includes(filter.brandMatch))) return true;
  return false;
}

function countProductsForFilter(products, typeValue) {
  return products.filter(p => matchesTypeFilter(p, typeValue)).length;
}

export default function ShopGarments() {
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [maxPrice, setMaxPrice] = useState('');
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [bestSellersOnly, setBestSellersOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const location = useLocation();
  const { addToCart } = useCart();

  useEffect(() => { document.title = 'Shop Garments | HC Apparel'; }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearch(params.get('q') || '');
    if (params.get('type')) setTypeFilter(params.get('type'));
  }, [location.search]);

  const { data: allProducts = [], isLoading } = useQuery({
    queryKey: ['shop-garments'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, '-created_date'),
  });

  const products = filterPublicProducts(allProducts);

  const toggleSize = (size) => {
    setSelectedSizes(prev => prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size]);
  };

  const filtered = products
    .filter(p => {
      if (!matchesTypeFilter(p, typeFilter)) return false;
      const q = search.toLowerCase();
      if (q && !p.name?.toLowerCase().includes(q) && !p.description?.toLowerCase().includes(q) && !(p.tags || []).some(t => t.toLowerCase().includes(q))) return false;
      if (maxPrice && (p.sale_price || p.price) > parseFloat(maxPrice)) return false;
      if (selectedSizes.length > 0 && !(p.available_sizes || []).some(s => selectedSizes.includes(s))) return false;
      if (featuredOnly && !p.is_featured) return false;
      if (bestSellersOnly && !p.is_best_seller) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === 'price_asc') return (a.sale_price || a.price) - (b.sale_price || b.price);
      if (sort === 'price_desc') return (b.sale_price || b.price) - (a.sale_price || a.price);
      if (sort === 'featured') return (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0);
      if (sort === 'best_sellers') return (b.is_best_seller ? 1 : 0) - (a.is_best_seller ? 1 : 0);
      return new Date(b.created_date) - new Date(a.created_date);
    });

  const activeFilterCount = [
    typeFilter !== 'all', maxPrice, selectedSizes.length > 0, featuredOnly, bestSellersOnly
  ].filter(Boolean).length;

  const clearFilters = () => {
    setTypeFilter('all'); setMaxPrice(''); setSelectedSizes([]);
    setFeaturedOnly(false); setBestSellersOnly(false); setSort('newest');
  };

  const FilterContent = () => {
    // Only show filter categories with products
    const visibleFilters = TYPE_FILTERS.filter(f => f.value === 'all' || countProductsForFilter(products, f.value) > 0);
    
    return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-foreground mb-2">Product Type</p>
        <div className="space-y-0.5">
          {visibleFilters.map(f => (
            <button key={f.value} onClick={() => setTypeFilter(f.value)}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${typeFilter === f.value ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-foreground mb-2">Size</p>
        <div className="flex flex-wrap gap-1.5">
          {COMMON_SIZES.map(s => (
            <button key={s} onClick={() => toggleSize(s)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${selectedSizes.includes(s) ? 'bg-primary text-primary-foreground border-primary font-semibold' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-foreground mb-2">Max Price</p>
        <Input type="number" placeholder="e.g. $50" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="bg-background" />
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-foreground mb-2">Special</p>
        <div className="space-y-1.5">
          <button onClick={() => setFeaturedOnly(v => !v)}
            className={`w-full text-left px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${featuredOnly ? 'bg-accent/20 text-accent-foreground font-semibold border border-accent/40' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
            <Sparkles className="w-3.5 h-3.5" />Featured Products
          </button>
          <button onClick={() => setBestSellersOnly(v => !v)}
            className={`w-full text-left px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${bestSellersOnly ? 'bg-orange-100 text-orange-800 font-semibold border border-orange-200' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
            <Star className="w-3.5 h-3.5" />Best Sellers
          </button>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-foreground mb-2">Sort By</p>
        <div className="space-y-0.5">
          {SORT_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setSort(opt.value)}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${sort === opt.value ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {activeFilterCount > 0 && (
        <Button variant="outline" size="sm" className="w-full" onClick={clearFilters}>
          <X className="w-3 h-3 mr-1" /> Clear Filters ({activeFilterCount})
        </Button>
      )}
    </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground py-10 md:py-14">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl md:text-4xl font-black mb-2 tracking-tight">Shop Garments</h1>
          <p className="text-primary-foreground/70 text-base mb-5">Quality apparel blanks and custom printed garments</p>
          {/* Quick filter chips */}
          <div className="flex flex-wrap gap-2 mb-4">
            {['all','t_shirts','tank_tops','womens','sportswear','gildan','champion'].map(v => {
                const f = TYPE_FILTERS.find(f => f.value === v);
                if (!f || (v !== 'all' && countProductsForFilter(products, v) === 0)) return null;
                const active = typeFilter === v;
                return (
                  <button key={v} onClick={() => setTypeFilter(v)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                      active
                        ? 'bg-accent text-accent-foreground border-accent'
                        : 'bg-primary-foreground/10 border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/20'
                    }`}>
                    {f.label}
                  </button>
                );
              })}
          </div>
          <Link to="/RequestQuote">
            <Button size="sm" className="bg-accent hover:bg-accent/90 text-accent-foreground gap-1.5">
              <MessageSquare className="w-4 h-4" /> Bulk Quote 50+
            </Button>
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-white" />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-muted-foreground" /></button>}
          </div>
          <Button variant="outline" className="flex items-center gap-2 md:hidden" onClick={() => setShowFilters(v => !v)}>
            <SlidersHorizontal className="w-4 h-4" />
            Filters {activeFilterCount > 0 && <Badge className="bg-primary text-primary-foreground text-xs w-5 h-5 p-0 flex items-center justify-center rounded-full">{activeFilterCount}</Badge>}
          </Button>
          <div className="hidden md:flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">{filtered.length} product{filtered.length !== 1 ? 's' : ''}</span>
            <div className="relative">
              <select value={sort} onChange={e => setSort(e.target.value)}
                className="appearance-none bg-white border border-border rounded-lg px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer">
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="md:hidden bg-white border rounded-xl p-5 mb-5 shadow-sm">
            <FilterContent />
          </div>
        )}

        <div className="flex gap-6">
          <aside className="hidden md:block w-52 flex-shrink-0">
            <div className="bg-white rounded-xl border p-4 sticky top-20">
              <FilterContent />
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => <div key={i} className="bg-white rounded-2xl aspect-[3/4] animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-muted-foreground mb-4">No products match your filters.</p>
                <Button variant="outline" onClick={clearFilters}>Clear Filters</Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map(product => (
                  <GarmentProductCard
                    key={product.id}
                    product={product}
                    onAddToCart={() => { addToCart(product); toast.success(`${product.name} added to cart!`); }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
