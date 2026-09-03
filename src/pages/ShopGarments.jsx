import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, MessageSquare, Search, SlidersHorizontal, Sparkles, Star, X } from 'lucide-react';

import { base44 } from '@/api/base44Client';
import GarmentProductCard from '@/components/shop/GarmentProductCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { filterPublicProducts } from '@/lib/productVisibility';
import {
  CATEGORY_FILTERS,
  SORT_OPTIONS,
  countActiveGarmentFilters,
  filterAndSortGarments,
  getFilterOptions,
  matchesCategory,
} from '@/lib/shopGarmentFilters';
import { SS_ACTIVEWEAR_BRANDS, brandFilterValue } from '@/lib/ssBrands';

function toggleListValue(setter, value) {
  setter(current => (
    current.includes(value)
      ? current.filter(item => item !== value)
      : [...current, value]
  ));
}

function FilterPanel({
  products,
  options,
  category,
  setCategory,
  brand,
  setBrand,
  selectedSizes,
  setSelectedSizes,
  selectedColors,
  setSelectedColors,
  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  featuredOnly,
  setFeaturedOnly,
  bestSellersOnly,
  setBestSellersOnly,
  sort,
  setSort,
  showAllColors,
  setShowAllColors,
  activeFilterCount,
  resetFilters,
  filterState,
}) {
  const visibleCategories = CATEGORY_FILTERS.filter(filter => (
    filter.value === 'all'
    || products.some(product => matchesCategory(product, filter.value))
  ));
  const visibleColors = showAllColors ? options.colors : options.colors.slice(0, 14);
  const hasFeatured = products.some(product => product.is_featured === true);
  const hasBestSellers = products.some(product => product.is_best_seller === true);
  const categoryCounts = new Map(visibleCategories.map(filter => [
    filter.value,
    filterAndSortGarments(products, { ...filterState, category: filter.value }).length,
  ]));
  const brandCounts = new Map(options.brands.map(option => [
    option.value,
    filterAndSortGarments(products, { ...filterState, brand: option.value }).length,
  ]));

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">Category</p>
        <div className="space-y-0.5">
          {visibleCategories.map(filter => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={category === filter.value}
              onClick={() => setCategory(filter.value)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                category === filter.value
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <span>{filter.label}</span>
              <span className="text-xs opacity-70">{categoryCounts.get(filter.value)}</span>
            </button>
          ))}
        </div>
      </div>

      {options.brands.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">Brand</p>
          <div className="space-y-0.5">
            <button
              type="button"
              aria-pressed={brand === 'all'}
              onClick={() => setBrand('all')}
              className={`w-full rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                brand === 'all'
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              All Brands
            </button>
            {options.brands.map(option => (
              <button
                key={option.value}
                type="button"
                aria-pressed={brand === option.value}
                onClick={() => setBrand(option.value)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                  brand === option.value
                    ? 'bg-primary font-semibold text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <span>{option.label}</span>
                <span className="text-xs opacity-70">{brandCounts.get(option.value)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {options.sizes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">Size</p>
          <div className="flex flex-wrap gap-1.5">
            {options.sizes.map(option => (
              <button
                key={option.value}
                type="button"
                aria-pressed={selectedSizes.includes(option.value)}
                onClick={() => toggleListValue(setSelectedSizes, option.value)}
                title={`${option.count} products`}
                className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                  selectedSizes.includes(option.value)
                    ? 'border-primary bg-primary font-semibold text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {options.colors.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">Color</p>
          <div className="flex flex-wrap gap-1.5">
            {visibleColors.map(option => (
              <button
                key={option.value}
                type="button"
                aria-pressed={selectedColors.includes(option.value)}
                onClick={() => toggleListValue(setSelectedColors, option.value)}
                title={`${option.count} products`}
                className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                  selectedColors.includes(option.value)
                    ? 'border-primary bg-primary font-semibold text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {options.colors.length > 14 && (
            <button
              type="button"
              onClick={() => setShowAllColors(value => !value)}
              className="mt-2 text-xs font-semibold text-primary hover:underline"
            >
              {showAllColors ? 'Show fewer colors' : `Show all colors (${options.colors.length})`}
            </button>
          )}
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">Price</p>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            min="0"
            step="0.01"
            aria-label="Minimum price"
            placeholder="Min"
            value={minPrice}
            onChange={event => setMinPrice(event.target.value)}
            className="bg-background"
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            aria-label="Maximum price"
            placeholder="Max"
            value={maxPrice}
            onChange={event => setMaxPrice(event.target.value)}
            className="bg-background"
          />
        </div>
      </div>

      {(hasFeatured || hasBestSellers) && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">Special</p>
          <div className="space-y-1.5">
            {hasFeatured && (
              <button
                type="button"
                aria-pressed={featuredOnly}
                onClick={() => setFeaturedOnly(value => !value)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                  featuredOnly
                    ? 'border border-accent/40 bg-accent/20 font-semibold text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Featured Products
              </button>
            )}
            {hasBestSellers && (
              <button
                type="button"
                aria-pressed={bestSellersOnly}
                onClick={() => setBestSellersOnly(value => !value)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                  bestSellersOnly
                    ? 'border border-orange-200 bg-orange-100 font-semibold text-orange-800'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Star className="h-3.5 w-3.5" />
                Best Sellers
              </button>
            )}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">Sort By</p>
        <div className="space-y-0.5">
          {SORT_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              aria-pressed={sort === option.value}
              onClick={() => setSort(option.value)}
              className={`w-full rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                sort === option.value
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={resetFilters}
        disabled={activeFilterCount === 0}
      >
        <X className="mr-1 h-3.5 w-3.5" />
        Reset Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
      </Button>
    </div>
  );
}

export default function ShopGarments() {
  const [category, setCategory] = useState('all');
  const [brand, setBrand] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [selectedColors, setSelectedColors] = useState([]);
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [bestSellersOnly, setBestSellersOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showAllColors, setShowAllColors] = useState(false);
  const location = useLocation();

  useEffect(() => {
    document.title = 'Shop Garments | HC Apparel';
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedType = params.get('type');
    const requestedBrand = params.get('brand');
    const categoryExists = CATEGORY_FILTERS.some(filter => filter.value === requestedType);
    const matchedBrand = SS_ACTIVEWEAR_BRANDS.find(item => (
      brandFilterValue(item) === requestedType
      || brandFilterValue(item) === requestedBrand
      || item.toLowerCase() === requestedBrand?.toLowerCase()
    ));

    setSearch(params.get('q') || '');
    setCategory(categoryExists ? requestedType : 'all');
    setBrand(matchedBrand ? brandFilterValue(matchedBrand) : 'all');
  }, [location.search]);

  const {
    data: allProducts = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['shop-garments'],
    // The anonymous Product source is already the restricted storefront view.
    // Avoid requiring any particular visibility column a second time here.
    queryFn: () => base44.entities.Product.list('-created_date'),
  });

  const products = useMemo(() => filterPublicProducts(allProducts), [allProducts]);
  const filterOptions = useMemo(() => getFilterOptions(products), [products]);
  const filterState = useMemo(() => ({
    category,
    brand,
    search,
    minPrice,
    maxPrice,
    sizes: selectedSizes,
    colors: selectedColors,
    featuredOnly,
    bestSellersOnly,
    sort,
  }), [
    category,
    brand,
    search,
    minPrice,
    maxPrice,
    selectedSizes,
    selectedColors,
    featuredOnly,
    bestSellersOnly,
    sort,
  ]);

  const filtered = useMemo(
    () => filterAndSortGarments(products, filterState),
    [products, filterState],
  );
  const activeFilterCount = countActiveGarmentFilters(filterState);

  const resetFilters = () => {
    setCategory('all');
    setBrand('all');
    setSearch('');
    setMinPrice('');
    setMaxPrice('');
    setSelectedSizes([]);
    setSelectedColors([]);
    setFeaturedOnly(false);
    setBestSellersOnly(false);
    setSort('newest');
    setShowAllColors(false);
  };

  const filterPanelProps = {
    products,
    options: filterOptions,
    category,
    setCategory,
    brand,
    setBrand,
    selectedSizes,
    setSelectedSizes,
    selectedColors,
    setSelectedColors,
    minPrice,
    setMinPrice,
    maxPrice,
    setMaxPrice,
    featuredOnly,
    setFeaturedOnly,
    bestSellersOnly,
    setBestSellersOnly,
    sort,
    setSort,
    showAllColors,
    setShowAllColors,
    activeFilterCount,
    resetFilters,
    filterState,
  };

  const topCategoryValues = [
    'all',
    'hats',
    'bags',
    't_shirts',
    'hoodies',
    'fleece',
    'crewnecks',
    'outerwear',
    'long_sleeve',
    'tank_tops',
    'womens',
    'kids',
    'sportswear',
  ];
  const quickFilters = CATEGORY_FILTERS.filter(filter => (
    topCategoryValues.includes(filter.value)
    && (
      filter.value === 'all'
      || products.some(product => matchesCategory(product, filter.value))
    )
  ));

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary py-10 text-primary-foreground md:py-14">
        <div className="container mx-auto px-4">
          <h1 className="mb-2 text-3xl font-black tracking-tight md:text-4xl">Shop Garments</h1>
          <p className="mb-5 text-base text-primary-foreground/70">Quality apparel blanks and custom printed garments</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {quickFilters.map(filter => {
              const active = category === filter.value && (filter.value !== 'all' || brand === 'all');
              return (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setCategory(filter.value);
                    if (filter.value === 'all') setBrand('all');
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? 'border-accent bg-accent text-accent-foreground'
                      : 'border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20'
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
          <Link to="/RequestQuote">
            <Button size="sm" className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90">
              <MessageSquare className="h-4 w-4" />
              Bulk Quote 50+
            </Button>
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[180px] max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="bg-white pl-9"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear product search"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>

          <Sheet open={showFilters} onOpenChange={setShowFilters}>
            <SheetTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 md:hidden">
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge className="flex h-5 w-5 items-center justify-center rounded-full bg-primary p-0 text-xs text-primary-foreground">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-[90vw] flex-col p-0 sm:max-w-md">
              <SheetHeader className="border-b px-5 py-4 text-left">
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>{filtered.length} garment{filtered.length === 1 ? '' : 's'} match</SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-5 py-5">
                <FilterPanel {...filterPanelProps} />
              </div>
              <SheetFooter className="border-t p-4">
                <SheetClose asChild>
                  <Button className="w-full">View {filtered.length} Garment{filtered.length === 1 ? '' : 's'}</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <span className="text-sm text-muted-foreground md:hidden">
            {filtered.length} product{filtered.length === 1 ? '' : 's'}
          </span>

          <div className="ml-auto hidden items-center gap-2 md:flex">
            <span className="text-sm text-muted-foreground">{filtered.length} product{filtered.length === 1 ? '' : 's'}</span>
            <div className="relative">
              <select
                value={sort}
                onChange={event => setSort(event.target.value)}
                className="cursor-pointer appearance-none rounded-lg border border-border bg-white px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                aria-label="Sort garments"
              >
                {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        </div>

        <div className="flex gap-6">
          <aside className="hidden w-64 flex-shrink-0 md:block">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border bg-white p-4">
              <FilterPanel {...filterPanelProps} />
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            {isLoading ? (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {[...Array(8)].map((_, index) => <div key={index} className="aspect-[3/4] animate-pulse rounded-2xl bg-white" />)}
              </div>
            ) : isError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-12 text-center">
                <p className="mb-2 font-semibold text-foreground">Garments could not be loaded.</p>
                <p className="mb-4 text-sm text-muted-foreground">
                  The catalog connection returned an error. Please refresh or try again shortly.
                </p>
                <Button variant="outline" onClick={() => window.location.reload()}>Refresh Catalog</Button>
                {import.meta.env.DEV && error?.message && (
                  <p className="mt-4 text-xs text-muted-foreground">{error.message}</p>
                )}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center">
                <p className="mb-4 text-muted-foreground">No garments match these filters. Try clearing one or more filters.</p>
                <Button variant="outline" onClick={resetFilters}>Reset Filters</Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map(product => (
                  <GarmentProductCard
                    key={product.id}
                    product={product}
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
