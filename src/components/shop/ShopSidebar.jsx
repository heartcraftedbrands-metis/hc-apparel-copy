import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const navItems = [
  { label: 'All Products', value: 'all' },
  {
    label: 'Digital Designs',
    value: 'digital_designs',
    children: [
      { label: 'Halftone Packs', value: 'halftone_packs' },
      { label: 'Distressed Packs', value: 'distressed_packs' },
      { label: 'Design Elements', value: 'design_elements' },
    ],
  },
  {
    label: 'Garment Blanks',
    value: 'garment_blanks',
    children: [
      {
        label: 'Short Sleeve Shirts',
        value: 'short_sleeve_shirts',
        children: [
          { label: 'Men', value: 'mens_short_sleeve_shirts' },
          { label: 'Women', value: 'womens_short_sleeve_shirts' },
          { label: 'Youth', value: 'youth_short_sleeve_shirts' },
        ],
      },
      { label: 'Long Sleeve Shirts', value: 'long_sleeve_shirts' },
      { label: 'Polo Shirts', value: 'polo_shirts' },
      { label: 'Hoodies', value: 'hoodies' },
      { label: 'Crewnecks', value: 'crewnecks' },
      { label: 'Hats', value: 'hats' },
    ],
  },
  { label: 'Office Supplies', value: 'office_supplies' },
];

function getAllValues(item) {
  const values = [item.value];
  if (item.children) {
    for (const child of item.children) values.push(...getAllValues(child));
  }
  return values;
}

function NavItem({ item, activeCategory, onSelect, depth = 0 }) {
  const allVals = getAllValues(item);
  const isAnyChildActive = allVals.includes(activeCategory);
  const [open, setOpen] = useState(isAnyChildActive);

  if (!item.children) {
    return (
      <button
        onClick={() => onSelect(item.value)}
        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
          depth === 0 ? 'text-sm font-medium' : depth === 1 ? 'text-sm' : 'text-xs'
        } ${
          activeCategory === item.value
            ? 'bg-gray-900 text-white font-medium'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
      >
        {item.label}
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
          depth === 0 ? 'text-sm font-medium' : 'text-sm'
        } ${
          isAnyChildActive && !open
            ? 'bg-gray-100 text-gray-900'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        {item.label}
        {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
      </button>
      {open && (
        <div className={`mt-1 space-y-1 border-l-2 border-gray-100 ${depth === 0 ? 'ml-4 pl-3' : 'ml-3 pl-2'}`}>
          {item.children.map(child => (
            <NavItem key={child.value} item={child} activeCategory={activeCategory} onSelect={onSelect} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ShopSidebar({ activeCategory, onSelect }) {
  return (
    <aside className="w-52 shrink-0">
      <nav className="sticky top-24 space-y-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-3">Browse</p>
        {navItems.map(item => (
          <NavItem key={item.value} item={item} activeCategory={activeCategory} onSelect={onSelect} depth={0} />
        ))}
      </nav>
    </aside>
  );
}