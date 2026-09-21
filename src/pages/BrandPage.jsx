import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import GarmentProductCard from '@/components/shop/GarmentProductCard';
import CatalogEditorialImage from '@/components/home/CatalogEditorialImage';
import { brandPageBySlug } from '@/lib/brandPages';
import { filterPublicProducts } from '@/lib/productVisibility';
import { getCatalogProductImage, selectBrandProduct } from '@/lib/homeCatalogImages';
import {
  CATEGORY_FILTERS,
  PRIMARY_GARMENT_CATEGORY_ORDER,
  PRIMARY_GARMENT_SECTION_LABELS,
  SORT_OPTIONS,
  STOREFRONT_CATEGORY_LABELS,
  filterAndSortGarments,
  getProductBrand,
  getStorefrontCategory,
  matchesCategory,
} from '@/lib/shopGarmentFilters';

export default function BrandPage() {
  const { slug } = useParams();
  const defaults = brandPageBySlug(slug);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  useEffect(() => {
    setCategory('all'); setSearch(''); setSize(''); setColor('');
  }, [slug]);
  useEffect(() => { document.title = `${defaults?.name || 'Brand'} Blanks | HC Apparel`; }, [defaults?.name]);

  const { data: savedPage, isLoading: pageLoading, isError: pageError } = useQuery({
    queryKey: ['brand-page', slug],
    enabled: Boolean(defaults),
    queryFn: async () => {
      const { data, error } = await supabase.from('brand_pages').select('*').eq('slug', slug).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: catalog = [], isLoading, isError } = useQuery({
    queryKey: ['shop-garments'],
    queryFn: () => base44.entities.Product.list('-created_date'),
  });
  const page = { ...defaults, ...(savedPage || {}) };
  const products = useMemo(() => filterPublicProducts(catalog).filter(product =>
    getProductBrand(product).toLowerCase().replace(/[^a-z0-9]/g, '') === page.name?.toLowerCase().replace(/[^a-z0-9]/g, '')
  ), [catalog, page.name]);
  const filtered = useMemo(() => filterAndSortGarments(products, {
    category, search, sort, minPrice, maxPrice,
    sizes: size ? [size] : [], colors: color ? [color] : [],
  }), [products, category, search, sort, minPrice, maxPrice, size, color]);
  const heroProduct = selectBrandProduct(products, page.name);
  const heroImage = page.hero_image_url || getCatalogProductImage(heroProduct);
  const heroPosition = page.hero_object_position || 'center center';
  const availableCategoryButtons = useMemo(() => CATEGORY_FILTERS.slice(1)
    .filter(item => products.some(product => matchesCategory(product, item.value))), [products]);
  const categoryButtons = useMemo(() => {
    const preferred = new Set(page.categories || []);
    const selected = availableCategoryButtons.filter(item => preferred.has(item.value));
    return selected.length ? selected : availableCategoryButtons.slice(0, 8);
  }, [availableCategoryButtons, page.categories]);
  const productGroups = useMemo(() => {
    const grouped = new Map();
    filtered.forEach(product => {
      const garmentType = getStorefrontCategory(product);
      if (!grouped.has(garmentType)) grouped.set(garmentType, []);
      grouped.get(garmentType).push(product);
    });
    return [...grouped.entries()].sort(([a], [b]) => {
      const aIndex = PRIMARY_GARMENT_CATEGORY_ORDER.indexOf(a);
      const bIndex = PRIMARY_GARMENT_CATEGORY_ORDER.indexOf(b);
      return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
    });
  }, [filtered]);

  if (pageLoading) return <div className="container mx-auto px-4 py-20 text-center">Loading brand page…</div>;
  if (!defaults || pageError || !savedPage || page.is_active === false) return <div className="container mx-auto px-4 py-20 text-center"><h1 className="text-3xl font-bold">Brand page unavailable</h1><Link to="/ShopGarments" className="mt-5 inline-block text-primary underline">Shop all garments</Link></div>;

  return <div className="min-h-screen bg-[#f8f5ed]">
    <section className="bg-[#303f20] text-[#f8f5ed]">
      <div className="container mx-auto grid min-w-0 overflow-hidden lg:grid-cols-[minmax(0,7fr)_minmax(320px,5fr)]">
        <div className="aspect-video min-w-0 overflow-hidden bg-[#202b16]">
          <CatalogEditorialImage src={heroImage} alt={`${page.name} apparel blanks`} className="object-cover" style={{ objectPosition: heroPosition }} loading="eager" />
        </div>
        <div className="flex min-w-0 flex-col justify-center px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          {page.logo_url || page.logo ? <div className="mb-6 flex h-20 max-w-xs items-center rounded-xl bg-white p-4"><img src={page.logo_url || page.logo} alt={`${page.name} logo`} className="max-h-full max-w-full object-contain" /></div> : <p className="mb-5 text-xl font-black tracking-tight">{page.name}</p>}
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#e8ba53]">HC Apparel brand spotlight</p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">{page.name}</h1>
          <p className="mt-3 text-lg font-semibold">{page.tagline}</p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">{page.description}</p>
          <div className="mt-6 flex flex-wrap gap-2">{categoryButtons.map(item => <button key={item.value} onClick={() => { setCategory(item.value); document.getElementById('brand-products')?.scrollIntoView({ behavior: 'smooth' }); }} type="button" className="rounded-full border border-white/35 px-4 py-2 text-sm font-semibold hover:bg-white/15" aria-label={`Filter ${item.label}`}>{item.label}</button>)}</div>
        </div>
      </div>
    </section>
    <section id="brand-products" className="container mx-auto px-4 py-10 sm:py-14">
      <div className="mb-6"><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary/70">Shop the brand</p><h2 className="text-3xl font-black">{page.name} apparel blanks</h2></div>
      <div className="mb-6 flex flex-wrap gap-2" aria-label={`${page.name} product categories`}>
        <button type="button" onClick={() => setCategory('all')} className={`rounded-full border px-4 py-2 text-sm font-semibold ${category === 'all' ? 'border-primary bg-primary text-white' : 'bg-white hover:border-primary'}`}>All Products</button>
        {availableCategoryButtons.map(item => <button key={item.value} type="button" onClick={() => setCategory(item.value)} className={`rounded-full border px-4 py-2 text-sm font-semibold ${category === item.value ? 'border-primary bg-primary text-white' : 'bg-white hover:border-primary'}`}>{item.label}</button>)}
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="relative sm:col-span-2 lg:col-span-2"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><input aria-label="Search within brand" placeholder={`Search ${page.name} products`} value={search} onChange={event => setSearch(event.target.value)} className="h-10 w-full rounded-lg border bg-white pl-9 pr-3 text-sm" /></label>
        <select aria-label="Category" value={category} onChange={event => setCategory(event.target.value)} className="h-10 min-w-0 rounded-lg border bg-white px-3 text-sm"><option value="all">All categories</option>{availableCategoryButtons.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <select aria-label="Sort products" value={sort} onChange={event => setSort(event.target.value)} className="h-10 min-w-0 rounded-lg border bg-white px-3 text-sm">{SORT_OPTIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <input aria-label="Minimum price" type="number" min="0" placeholder="Min price" value={minPrice} onChange={event => setMinPrice(event.target.value)} className="h-10 min-w-0 rounded-lg border bg-white px-3 text-sm" />
        <input aria-label="Maximum price" type="number" min="0" placeholder="Max price" value={maxPrice} onChange={event => setMaxPrice(event.target.value)} className="h-10 min-w-0 rounded-lg border bg-white px-3 text-sm" />
      </div>
      <div className="mb-6 flex flex-wrap gap-3"><input aria-label="Filter size" placeholder="Size" value={size} onChange={event => setSize(event.target.value)} className="h-10 w-28 rounded-lg border bg-white px-3 text-sm" /><input aria-label="Filter color" placeholder="Color" value={color} onChange={event => setColor(event.target.value)} className="h-10 w-40 rounded-lg border bg-white px-3 text-sm" /><span className="self-center text-sm text-muted-foreground">{filtered.length} products</span></div>
      {isLoading ? <p>Loading products…</p> : isError ? <p>Products could not be loaded. Please refresh.</p> : products.length === 0 ? <div className="rounded-2xl border bg-white px-6 py-20 text-center"><p className="text-xl font-semibold">Products coming soon.</p><Link to="/ShopGarments" className="mt-4 inline-block text-primary underline">Shop all garments</Link></div> : filtered.length === 0 ? <p className="rounded-xl border bg-white p-10 text-center">No products match these filters.</p> : <div className="space-y-12">{productGroups.map(([group, groupProducts]) => <section key={group} aria-labelledby={`brand-group-${group}`}><div className="mb-4 flex items-end justify-between gap-4 border-b border-[#d9d1c1] pb-3"><h3 id={`brand-group-${group}`} className="text-2xl font-black text-[#29391f]">{PRIMARY_GARMENT_SECTION_LABELS[group] || STOREFRONT_CATEGORY_LABELS[group] || 'Other'}</h3><span className="text-sm text-muted-foreground">{groupProducts.length} {groupProducts.length === 1 ? 'product' : 'products'}</span></div><div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">{groupProducts.map(product => <GarmentProductCard key={product.id} product={product} />)}</div></section>)}</div>}
    </section>
  </div>;
}
