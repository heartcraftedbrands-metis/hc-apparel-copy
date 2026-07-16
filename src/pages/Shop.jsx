import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import ProductCard from "@/components/shop/ProductCard";
import { useCart } from "@/components/shop/CartContext";
import { toast } from "sonner";
import { SlidersHorizontal, Search, X, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import PullToRefresh from "@/components/mobile/PullToRefresh";
import { motion, AnimatePresence } from 'framer-motion';

const FILTER_CATEGORIES = [
  { value: 'all', label: 'All Designs' },
  { value: 'halftone_packs', label: 'Halftone Designs' },
  { value: 'distressed_packs', label: 'Distressed / Full-Tone' },
  { value: 'design_elements', label: 'Design Elements' },
  { value: 'digital_designs', label: 'All Digital' },
  { value: 'hoodies', label: 'Hoodies' },
  { value: 'short_sleeve_shirts', label: 'T-Shirts' },
  { value: 'crewnecks', label: 'Crewnecks' },
  { value: 'accessories', label: 'Accessories' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
];

export default function Shop() {
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [designType, setDesignType] = useState('all'); // all | halftone | fulltone | bundle
  const [maxPrice, setMaxPrice] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const location = useLocation();
  const { addToCart } = useCart();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearch(params.get('q') || '');
    if (params.get('category')) setCategory(params.get('category'));
  }, [location.search]);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['shop-products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, '-created_date'),
  });

  const handleAddToCart = (product) => {
    addToCart(product);
    toast.success(`${product.name} added to cart!`);
  };

  const productCategories = (p) => p.categories?.length ? p.categories : (p.category ? [p.category] : []);

  const filtered = products
    .filter(p => {
      const matchesCat = category === 'all' || productCategories(p).includes(category);
      const q = search.toLowerCase();
      const matchesSearch = !q || p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
      const matchesPrice = !maxPrice || (p.price <= parseFloat(maxPrice));
      const cats = productCategories(p);
      const matchesType = designType === 'all'
        || (designType === 'halftone' && cats.includes('halftone_packs'))
        || (designType === 'fulltone' && cats.includes('distressed_packs'))
        || (designType === 'bundle' && p.name?.toLowerCase().includes('bundle'));
      return matchesCat && matchesSearch && matchesPrice && matchesType;
    })
    .sort((a, b) => {
      if (sort === 'price_asc') return a.price - b.price;
      if (sort === 'price_desc') return b.price - a.price;
      return new Date(b.created_date) - new Date(a.created_date);
    });

  const handleRefresh = async () => {
    await new Promise(r => setTimeout(r, 800));
    window.location.reload();
  };

  const FilterPanel = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">Category</h3>
        <div className="space-y-1">
          {FILTER_CATEGORIES.map(cat => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                category === cat.value
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">Design Type</h3>
        <div className="space-y-1">
          {[['all','All Types'],['halftone','Halftone'],['fulltone','Full-Tone'],['bundle','Bundles']].map(([v,l]) => (
            <button
              key={v}
              onClick={() => setDesignType(v)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                designType === v
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">Max Price</h3>
        <Input
          type="number"
          placeholder="e.g. 25"
          value={maxPrice}
          onChange={e => setMaxPrice(e.target.value)}
          className="bg-background"
        />
        {maxPrice && (
          <button onClick={() => setMaxPrice('')} className="text-xs text-muted-foreground mt-1 hover:text-foreground">Clear</button>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">Sort By</h3>
        <div className="space-y-1">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSort(opt.value)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                sort === opt.value
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      {/* Page Header */}
      <div className="bg-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Shop All Designs</h1>
          <p className="text-primary-foreground/70 text-sm">DTF-ready & PNG files for apparel creators</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Top bar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search designs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-white"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            className="md:hidden flex items-center gap-2 bg-white"
            onClick={() => setShowMobileFilters(v => !v)}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {showMobileFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
          <span className="hidden md:block text-sm text-muted-foreground ml-auto">
            {filtered.length} design{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Mobile filters */}
        <AnimatePresence>
          {showMobileFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden overflow-hidden mb-6"
            >
              <div className="bg-white rounded-xl border p-5">
                <FilterPanel />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-8">
          {/* Desktop Sidebar */}
          <aside className="hidden md:block w-56 flex-shrink-0">
            <div className="bg-white rounded-xl border p-5 sticky top-20">
              <FilterPanel />
            </div>
          </aside>

          {/* Product Grid */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-4 md:hidden">
              <span className="text-sm text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="bg-white rounded-xl aspect-[3/4] animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-muted-foreground mb-4">No designs match your filters.</p>
                <Button variant="outline" onClick={() => { setCategory('all'); setDesignType('all'); setSearch(''); setMaxPrice(''); }}>
                  Clear Filters
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((product) => (
                  <ProductCard key={product.id} product={product} onAddToCart={handleAddToCart} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PullToRefresh>
  );
}