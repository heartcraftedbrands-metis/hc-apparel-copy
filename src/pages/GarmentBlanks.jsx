import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import ProductCard from "@/components/shop/ProductCard";
import { useCart } from "@/components/shop/CartContext";
import { toast } from "sonner";
import { Package, ChevronRight, ChevronDown } from "lucide-react";

const SECTIONS = [
  {
    label: 'All Garment Blanks',
    key: 'all',
    categories: null, // null = show everything
  },
  {
    label: 'Short Sleeve',
    key: 'short_sleeve',
    categories: ['short_sleeve_shirts', 'mens_short_sleeve_shirts', 'womens_short_sleeve_shirts', 'youth_short_sleeve_shirts'],
    subcategories: [
      { label: 'Men', key: 'short_sleeve_men', categories: ['mens_short_sleeve_shirts'] },
      { label: 'Women', key: 'short_sleeve_women', categories: ['womens_short_sleeve_shirts'] },
      { label: 'Youth', key: 'short_sleeve_youth', categories: ['youth_short_sleeve_shirts'] },
    ],
  },
  {
    label: 'Long Sleeve',
    key: 'long_sleeve',
    categories: ['long_sleeve_shirts', 'mens_long_sleeve_shirts', 'womens_long_sleeve_shirts', 'youth_long_sleeve_shirts'],
    subcategories: [
      { label: 'Men', key: 'long_sleeve_men', categories: ['mens_long_sleeve_shirts'] },
      { label: 'Women', key: 'long_sleeve_women', categories: ['womens_long_sleeve_shirts'] },
      { label: 'Youth', key: 'long_sleeve_youth', categories: ['youth_long_sleeve_shirts'] },
    ],
  },
  {
    label: 'Crewnecks',
    key: 'crewnecks',
    categories: ['crewnecks', 'mens_crewnecks', 'womens_crewnecks', 'youth_crewnecks'],
    subcategories: [
      { label: 'Men', key: 'crewnecks_men', categories: ['mens_crewnecks'] },
      { label: 'Women', key: 'crewnecks_women', categories: ['womens_crewnecks'] },
      { label: 'Youth', key: 'crewnecks_youth', categories: ['youth_crewnecks'] },
    ],
  },
  {
    label: 'Polos',
    key: 'polos',
    categories: ['polo_shirts', 'mens_polo_shirts', 'womens_polo_shirts', 'youth_polo_shirts'],
    subcategories: [
      { label: 'Men', key: 'polos_men', categories: ['mens_polo_shirts'] },
      { label: 'Women', key: 'polos_women', categories: ['womens_polo_shirts'] },
      { label: 'Youth', key: 'polos_youth', categories: ['youth_polo_shirts'] },
    ],
  },
  {
    label: 'Jackets',
    key: 'jackets',
    categories: ['jackets', 'mens_jackets', 'womens_jackets', 'youth_jackets'],
    subcategories: [
      { label: 'Men', key: 'jackets_men', categories: ['mens_jackets'] },
      { label: 'Women', key: 'jackets_women', categories: ['womens_jackets'] },
      { label: 'Youth', key: 'jackets_youth', categories: ['youth_jackets'] },
    ],
  },
  {
    label: 'Sportswear',
    key: 'sportswear',
    categories: ['sportswear', 'mens_sportswear', 'womens_sportswear', 'youth_sportswear'],
    subcategories: [
      { label: 'Men', key: 'sportswear_men', categories: ['mens_sportswear'] },
      { label: 'Women', key: 'sportswear_women', categories: ['womens_sportswear'] },
      { label: 'Youth', key: 'sportswear_youth', categories: ['youth_sportswear'] },
    ],
  },
];

const ALL_GARMENT_CATEGORIES = [
  'short_sleeve_shirts', 'mens_short_sleeve_shirts', 'womens_short_sleeve_shirts', 'youth_short_sleeve_shirts',
  'long_sleeve_shirts', 'mens_long_sleeve_shirts', 'womens_long_sleeve_shirts', 'youth_long_sleeve_shirts',
  'crewnecks', 'mens_crewnecks', 'womens_crewnecks', 'youth_crewnecks',
  'polo_shirts', 'mens_polo_shirts', 'womens_polo_shirts', 'youth_polo_shirts',
  'jackets', 'mens_jackets', 'womens_jackets', 'youth_jackets',
  'sportswear', 'mens_sportswear', 'womens_sportswear', 'youth_sportswear',
  'hoodies', 'hats', 'accessories',
];

function findActiveCategories(activeKey) {
  if (activeKey === 'all') return null;
  for (const section of SECTIONS) {
    if (section.key === activeKey) return section.categories;
    if (section.subcategories) {
      const sub = section.subcategories.find(s => s.key === activeKey);
      if (sub) return sub.categories;
    }
  }
  return null;
}

export default function GarmentBlanks() {
  const [activeKey, setActiveKey] = useState('all');
  const [expandedSections, setExpandedSections] = useState({});
  const { addToCart } = useCart();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['garment-blanks'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, '-created_date'),
  });

  const handleAddToCart = (product) => {
    addToCart(product);
    toast.success(`${product.name} added to cart`);
  };

  const productCategories = (p) => p.categories?.length ? p.categories : (p.category ? [p.category] : []);

  const allBlanks = products.filter(p => productCategories(p).some(c => ALL_GARMENT_CATEGORIES.includes(c)));

  const activeCategories = findActiveCategories(activeKey);
  const filtered = activeCategories
    ? allBlanks.filter(p => productCategories(p).some(c => activeCategories.includes(c)))
    : allBlanks;

  const toggleExpand = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSectionClick = (section) => {
    setActiveKey(section.key);
    if (section.subcategories) {
      toggleExpand(section.key);
    }
  };

  // All sub-keys for checking if a sub is active
  const allSubKeys = SECTIONS.flatMap(s => s.subcategories?.map(sub => sub.key) ?? []);

  return (
    <div className="container mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Garment Blanks</h1>
      <p className="text-gray-500 mb-8">Browse our blank garment inventory</p>

      <div className="flex gap-8">
        {/* Sidebar */}
        <aside className="hidden md:block w-52 shrink-0">
          <nav className="space-y-0.5">
            {SECTIONS.map(section => {
              const isActive = activeKey === section.key;
              const isExpanded = expandedSections[section.key];
              const hasSubActive = section.subcategories?.some(s => s.key === activeKey);

              return (
                <div key={section.key}>
                  <button
                    onClick={() => handleSectionClick(section)}
                    className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive || hasSubActive
                        ? 'bg-gray-900 text-white font-medium'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {section.label}
                    {section.subcategories && (
                      isExpanded
                        ? <ChevronDown className="w-4 h-4 shrink-0" />
                        : <ChevronRight className="w-4 h-4 shrink-0" />
                    )}
                  </button>

                  {section.subcategories && isExpanded && (
                    <div className="ml-4 mt-0.5 space-y-0.5">
                      {section.subcategories.map(sub => (
                        <button
                          key={sub.key}
                          onClick={() => setActiveKey(sub.key)}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                            activeKey === sub.key
                              ? 'bg-gray-200 text-gray-900 font-medium'
                              : 'text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* Mobile dropdown */}
        <div className="md:hidden w-full mb-4">
          <select
            value={activeKey}
            onChange={e => setActiveKey(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {SECTIONS.map(s => (
              <optgroup key={s.key} label={s.label}>
                <option value={s.key}>{s.label} — All</option>
                {s.subcategories?.map(sub => (
                  <option key={sub.key} value={sub.key}>&nbsp;&nbsp;{sub.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Products Grid */}
        <div className="flex-1">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-gray-100 rounded-2xl aspect-square animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No products found in this category.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filtered.map((product) => (
                <ProductCard key={product.id} product={product} onAddToCart={handleAddToCart} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}