import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, MessageSquare, Package, ArrowLeft, Star, Sparkles, Minus, Plus, Truck, Shield, Scissors, Bug } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useCart } from "../components/shop/CartContext";
import { isPublicProduct } from "@/lib/productVisibility";
import { createOrderHelpUrl } from "@/lib/orderHelp";

const SS_CDN = 'https://www.ssactivewear.com/';

// Resolve relative S&S image paths to full URLs
function resolveImgUrl(raw) {
  if (!raw) return null;
  if (raw.startsWith('http')) return raw;
  // relative S&S path e.g. "Images/Color/17106_f_fm.jpg"
  return SS_CDN + raw.replace(/^\//, '');
}

const CAT_LABELS = {
  short_sleeve_shirts: 'T-Shirt', hoodies: 'Hoodie', crewnecks: 'Crewneck',
  long_sleeve_shirts: 'Long Sleeve', hats: 'Hat', polo_shirts: 'Polo',
  jackets: 'Jacket', sportswear: 'Sportswear', youth_short_sleeve_shirts: 'Kids',
  apparel_blanks: 'Apparel Blank', custom_printed: 'Custom Print', print_support: 'Print Support',
};

const COLOR_MAP = {
  // Whites / Naturals
  'white': '#FFFFFF',
  'natural': '#E8DCC4',
  'sand': '#D6C3A5',
  'tan': '#D2B48C',
  'cornsilk': '#FEF3C7',
  'cream': '#FFFBEB',
  'ivory': '#FFFBEB',
  'prairie dust': '#A16207',
  // Blacks / Darks
  'black': '#111111',
  'dark navy': '#111827',
  // Navy / Blues
  'navy': '#1F2A44',
  'heather navy': '#2D3A5C',
  'indigo blue': '#3730A3',
  'indigo': '#3730A3',
  'royal': '#1D4ED8',
  'royal blue': '#1D4ED8',
  'cobalt': '#1D4ED8',
  'carolina blue': '#7DD3FC',
  'light blue': '#93C5FD',
  'sky': '#7DD3FC',
  'sapphire': '#0284C7',
  'heather sapphire': '#1E6FA8',
  'iris': '#818CF8',
  'stone blue': '#4B7BA0',
  'heather royal': '#3B5EA6',
  'heather indigo': '#4338CA',
  // Reds / Pinks
  'red': '#B91C1C',
  'cardinal red': '#991B1B',
  'cardinal': '#991B1B',
  'cherry red': '#DC2626',
  'antique cherry red': '#991B1B',
  'maroon': '#7F1D1D',
  'garnet': '#8B1E1E',
  'heliconia': '#DB2777',
  'light pink': '#F9A8D4',
  'azalea': '#F472B6',
  'safety pink': '#FB7185',
  'pink': '#F9A8D4',
  'heather red': '#C45C5C',
  'heather cardinal': '#A03030',
  // Greens
  'forest green': '#14532D',
  'irish green': '#15803D',
  'kelly green': '#16A34A',
  'kelly': '#16A34A',
  'military green': '#4D5D3A',
  'kiwi': '#84CC16',
  'lime': '#65A30D',
  'jade dome': '#047857',
  'turf green': '#166534',
  'green': '#166534',
  'heather green': '#3D7A5F',
  'heather military green': '#5C6B4A',
  // Purples
  'purple': '#581C87',
  'violet': '#7E22CE',
  'orchid': '#C084FC',
  'lavender': '#C4B5FD',
  'heather purple': '#7B4F9E',
  // Oranges / Yellows / Golds
  'orange': '#EA580C',
  'texas orange': '#C2410C',
  'safety orange': '#F97316',
  'tennessee orange': '#F97316',
  'tangerine': '#F97316',
  'gold': '#D97706',
  'vegas gold': '#B8952A',
  'daisy': '#FACC15',
  'yellow': '#FBBF24',
  'yellow haze': '#FDE047',
  'heather orange': '#D4744A',
  // Greys / Charcoals
  'sport grey': '#B8B8B8',
  'sports grey': '#B8B8B8',
  'sport gray': '#B8B8B8',
  'ash': '#D6D3D1',
  'dark heather': '#4B5563',
  'graphite heather': '#4B5563',
  'graphite': '#4B5563',
  'charcoal': '#374151',
  'gravel': '#6B7280',
  'tweed': '#78716C',
  'slate': '#64748B',
  'grey': '#9CA3AF',
  'gray': '#9CA3AF',
  'heather': '#9CA3AF',
  'ice grey': '#D1D5DB',
  // Browns
  'brown': '#7C2D12',
  'chestnut': '#92400E',
  'dark chocolate': '#4A2C2A',
  'forest': '#1F5C3A',
  'olive': '#6B7A2E',
  'pistachio': '#93C572',
  // Misc
  'teal': '#0F766E',
  'coral': '#FB7185',
};

function normalizeColorKey(colorName) {
  return colorName
    .toLowerCase()
    .trim()
    .replace(/®/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveColorHex(colorName, variant) {
  // 1. Check for hex field on the variant object
  if (variant) {
    const hex = variant.color_hex || variant.colorHex || variant.hex || variant.swatch_color || variant.swatchColor;
    if (hex) return { hex, matched: 'variant_field' };
  }
  if (!colorName) return { hex: '#D1D5DB', matched: 'unknown' };

  const key = normalizeColorKey(colorName);

  // 2. Exact map lookup
  if (COLOR_MAP[key]) return { hex: COLOR_MAP[key], matched: 'exact' };

  // 3. Partial match — longer keys first (more specific wins)
  const sortedKeys = Object.keys(COLOR_MAP).sort((a, b) => b.length - a.length);
  for (const k of sortedKeys) {
    if (key.includes(k)) return { hex: COLOR_MAP[k], matched: 'partial' };
  }

  // 4. Family fallbacks
  if (key.includes('navy')) return { hex: '#1F2A44', matched: 'family' };
  if (key.includes('blue')) return { hex: '#2563EB', matched: 'family' };
  if (key.includes('red')) return { hex: '#B91C1C', matched: 'family' };
  if (key.includes('green')) return { hex: '#15803D', matched: 'family' };
  if (key.includes('pink')) return { hex: '#F9A8D4', matched: 'family' };
  if (key.includes('purple')) return { hex: '#7E22CE', matched: 'family' };
  if (key.includes('orange')) return { hex: '#EA580C', matched: 'family' };
  if (key.includes('yellow')) return { hex: '#FACC15', matched: 'family' };
  if (key.includes('gold')) return { hex: '#D97706', matched: 'family' };
  if (key.includes('grey') || key.includes('gray')) return { hex: '#B8B8B8', matched: 'family' };
  if (key.includes('heather')) return { hex: '#9CA3AF', matched: 'family' };
  if (key.includes('ash')) return { hex: '#D6D3D1', matched: 'family' };
  if (key.includes('charcoal')) return { hex: '#374151', matched: 'family' };
  if (key.includes('black')) return { hex: '#111111', matched: 'family' };
  if (key.includes('white')) return { hex: '#FFFFFF', matched: 'family' };
  if (key.includes('sand') || key.includes('tan') || key.includes('natural')) return { hex: '#D6C3A5', matched: 'family' };
  if (key.includes('brown')) return { hex: '#7C2D12', matched: 'family' };

  return { hex: '#D1D5DB', matched: 'unknown' };
}

function normalize(str) {
  return (str || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Parse size_prices where each entry is { size: "Color / Size", price, image_url?, sku? }
// Returns a map keyed by "normColor|||normSize" with SKU-level price and stock.
function buildVariantMap(product) {
  const map = {};
  const sp = product.size_prices || [];
  for (const entry of sp) {
    const raw = entry.size || '';
    const slashIdx = raw.indexOf(' / ');
    if (slashIdx === -1) continue;
    const color = raw.substring(0, slashIdx).trim();
    const size = raw.substring(slashIdx + 3).trim();
    const key = `${normalize(color)}|||${normalize(size)}`;
    map[key] = {
      color,
      size,
      price: entry.price,
      image_url: entry.image_url || '',
      sku: entry.sku || '',
      inventory: entry.inventory == null ? null : Number(entry.inventory),
      color_hex: entry.color_hex || '',
    };
  }
  return map;
}

// Get first valid image URL for a given normalized color across all variants
function getColorImage(variantMap, normColor) {
  for (const [key, v] of Object.entries(variantMap)) {
    const [kColor] = key.split('|||');
    if (kColor === normColor && v.image_url) return v.image_url;
  }
  return null;
}

// Get all unique colors from size_prices
function getVariantColors(product) {
  const sp = product.size_prices || [];
  const seen = new Set();
  const colors = [];
  for (const entry of sp) {
    const raw = entry.size || '';
    const slashIdx = raw.indexOf(' / ');
    if (slashIdx === -1) continue;
    const color = raw.substring(0, slashIdx).trim();
    if (!seen.has(color)) {
      seen.add(color);
      colors.push(color);
    }
  }
  return colors;
}

// Get all sizes available for a given color (normalized)
function getSizesForColor(variantMap, normColor) {
  const sizes = [];
  for (const [key] of Object.entries(variantMap)) {
    const [kColor, kSize] = key.split('|||');
    if (kColor === normColor) sizes.push(kSize);
  }
  return sizes;
}

function isLightColor(hex) {
  if (!hex) return false;
  // Parse hex to luminance
  const h = hex.replace('#', '');
  if (h.length !== 6) return false;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  // Perceived luminance
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6;
}

function cleanProductName(name) {
  if (!name) return '';
  const parts = name.split(' — ');
  if (parts.length === 2) {
    const prefix = parts[0].split(' - ')[0];
    if (parts[1].startsWith(prefix) || parts[1].includes(parts[0])) return parts[1];
  }
  return name;
}

export default function ProductDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id');
  const isDraftPreview = urlParams.get('preview') === 'draft';
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const { addToCart } = useCart();

  useEffect(() => {
    base44.auth.me()
      .then(u => setIsAdmin(u?.role === 'admin'))
      .catch(() => setIsAdmin(false))
      .finally(() => setAuthChecked(true));
  }, []);

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const products = await base44.entities.Product.filter({ id: productId });
      return products[0];
    },
    enabled: !!productId,
  });

  // Build variant map and derived state after product loads
  const variantMap = useMemo(() => product ? buildVariantMap(product) : {}, [product]);
  const variantColors = useMemo(() => product ? getVariantColors(product) : [], [product]);

  const normSelectedColor = normalize(selectedColor);

  // Admin debug: color mapping QA summary
  if (variantColors.length > 0 && typeof console !== 'undefined') {
    const summary = variantColors.reduce((acc, c) => {
      const { matched } = resolveColorHex(c);
      acc[matched] = (acc[matched] || 0) + 1;
      return acc;
    }, {});
    console.debug('[ProductDetail] Color QA:', {
      total: variantColors.length,
      exact: summary.exact || 0,
      partial: summary.partial || 0,
      family: summary.family || 0,
      unknown: summary.unknown || 0,
      variant_field: summary.variant_field || 0,
    });
  }
  const normSelectedSize = normalize(selectedSize);
  const variantKey = `${normSelectedColor}|||${normSelectedSize}`;
  const selectedVariant = (selectedColor && selectedSize) ? (variantMap[variantKey] || null) : null;

  // Sizes available for the currently selected color
  const availableSizesForColor = useMemo(() => {
    if (!selectedColor) return [];
    return getSizesForColor(variantMap, normSelectedColor);
  }, [variantMap, normSelectedColor, selectedColor]);

  // Image priority: selectedVariant.image_url → color's first image → product.image_url → null
  // All paths run through resolveImgUrl to handle relative S&S paths
  const variantImage = resolveImgUrl(selectedVariant?.image_url);
  const colorImage = selectedColor ? resolveImgUrl(getColorImage(variantMap, normSelectedColor)) : null;
  const productMainImage = resolveImgUrl(product?.image_url);
  const displayImage = variantImage || colorImage || productMainImage || null;

  // Price
  const displayPrice = selectedVariant?.price ?? product?.price ?? 0;

  const selectedInventory = selectedVariant?.inventory;
  const inStock = selectedVariant
    ? (selectedInventory == null ? (product?.stock ?? 0) > 0 : selectedInventory > 0)
    : (product?.stock ?? 0) > 0;
  const canAddToCart = !!(selectedColor && selectedSize && selectedVariant && inStock);
  const canPreviewDraft = isDraftPreview && isAdmin && product?.visibility === 'draft';
  const orderHelpUrl = createOrderHelpUrl({
    product: cleanProductName(product?.name || ''),
    productId: product?.id,
    brand: product?.brand,
    styleNumber: product?.style_number,
    imageUrl: displayImage,
    quantity,
    color: selectedVariant?.color || selectedColor,
    size: selectedVariant?.size || selectedSize,
    sku: selectedVariant?.sku,
  });

  const handleAddToCart = () => {
    if (!canAddToCart) return;
    const cartImage = variantImage || colorImage || productMainImage || null;
    const cartItem = {
      id: product.id,
      name: cleanProductName(product.name),
      price: displayPrice,
      image_url: cartImage,
      selectedSize: selectedVariant.size,
      selectedColor: selectedVariant.color,
      sku: selectedVariant.sku || null,
      quantity,
      product_type: product.product_type,
      stock: selectedInventory ?? product.stock,
    };
    addToCart(cartItem);
    toast.success(`${cleanProductName(product.name)} added to cart!`);
    // Open cart drawer by dispatching a custom event the layout listens to
    window.dispatchEvent(new CustomEvent('hc:open-cart'));
  };

  if (isLoading || (isDraftPreview && !authChecked)) return (
    <div className="container mx-auto px-4 py-8">
      <div className="animate-pulse grid md:grid-cols-2 gap-8">
        <div className="aspect-square bg-muted rounded-2xl" />
        <div className="space-y-4 pt-4">
          <div className="h-6 bg-muted rounded w-1/3" />
          <div className="h-8 bg-muted rounded w-3/4" />
          <div className="h-10 bg-muted rounded w-1/3" />
          <div className="h-20 bg-muted rounded" />
          <div className="h-12 bg-muted rounded" />
        </div>
      </div>
    </div>
  );

  if (!product || (!isPublicProduct(product) && !canPreviewDraft)) return (
    <div className="container mx-auto px-4 py-20 text-center">
      <p className="text-muted-foreground mb-4">Product not found.</p>
      <Link to="/ShopGarments"><Button>Back to Shop</Button></Link>
    </div>
  );

  const cats = product.categories?.length ? product.categories : (product.category ? [product.category] : []);
  const catLabel = product.product_subtype
    ? (CAT_LABELS[product.product_subtype] || product.product_subtype.replace(/_/g, ' '))
    : cats.map(c => CAT_LABELS[c]).find(Boolean);

  const isOnSale = product.sale_price && product.sale_price < product.price;

  const isCustomPrint = product.product_subtype === 'custom_printed' ||
    cats.some(c => ['short_sleeve_shirts','hoodies','crewnecks','long_sleeve_shirts','jackets','sportswear','polo_shirts'].includes(c));

  // Button label
  let buttonLabel = 'Select Available Options';
  if (selectedColor && !selectedSize) buttonLabel = 'Select a Size';
  else if (!selectedColor) buttonLabel = 'Select a Color';
  else if (selectedVariant && inStock) buttonLabel = `Add to Cart — $${(displayPrice * quantity).toFixed(2)}`;
  else if (selectedColor && selectedSize && !selectedVariant) buttonLabel = 'Combination Not Available';
  else if (!inStock) buttonLabel = 'Out of Stock';

  return (
    <div className="bg-background min-h-screen">
      <div className="container mx-auto px-4 py-6">
        <Link to={canPreviewDraft ? '/AdminSSLaunchBatch' : '/ShopGarments'}>
          <Button variant="ghost" size="sm" className="mb-5 gap-1.5 -ml-2">
            <ArrowLeft className="w-4 h-4" /> {canPreviewDraft ? 'Back to Private Batch' : 'Back to Shop'}
          </Button>
        </Link>

        {canPreviewDraft && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <strong>Private admin preview.</strong> This S&amp;S product is inactive and cannot appear in the public shop.
            Cart testing here is for QA only.
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {/* Image */}
          <div className="space-y-3">
            <div className="aspect-square bg-white rounded-2xl overflow-hidden border shadow-sm flex items-center justify-center">
              {displayImage ? (
                <img src={displayImage} alt={cleanProductName(product.name)} className="w-full h-full object-contain p-4" onError={e => { e.target.style.display = 'none'; }} />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-muted/20 gap-4">
                  {selectedColor ? (
                    <>
                      <div
                        className="w-24 h-24 rounded-full border-4 border-white shadow-lg"
                        style={{ backgroundColor: resolveColorHex(selectedColor).hex }}
                      />
                      <p className="text-sm font-medium text-muted-foreground">{selectedColor}</p>
                    </>
                  ) : (
                    <>
                      <Package className="w-20 h-20 text-muted-foreground/20" />
                      <p className="text-xs text-muted-foreground">Select a color to preview</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Product Info */}
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {catLabel && <Badge className="bg-primary/10 text-primary text-xs">{catLabel}</Badge>}
                {product.is_featured && <Badge className="bg-accent/20 text-accent-foreground text-xs gap-1"><Sparkles className="w-3 h-3" />Featured</Badge>}
                {product.is_best_seller && <Badge className="bg-orange-100 text-orange-700 text-xs gap-1"><Star className="w-3 h-3" />Best Seller</Badge>}
                {isOnSale && <Badge className="bg-red-100 text-red-700 text-xs">On Sale</Badge>}
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-foreground leading-tight">
                {cleanProductName(product.name)}
              </h1>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-black text-primary">${displayPrice.toFixed(2)}</span>
              {isOnSale && <span className="text-xl text-muted-foreground line-through">${product.price?.toFixed(2)}</span>}
            </div>

            {/* Colors */}
            {variantColors.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-1.5">Color</p>
                {selectedColor && (
                  <p className="text-sm text-muted-foreground mb-2">Selected color: <span className="font-medium text-foreground">{selectedColor}</span></p>
                )}
                <div className="flex flex-wrap gap-2">
                  {variantColors.map((colorName, i) => {
                    const { hex, matched } = resolveColorHex(colorName);
                    const isLight = isLightColor(hex);
                    const isSelected = normalize(colorName) === normSelectedColor;
                    const isUnknown = matched === 'unknown';
                    return (
                      <button
                        key={i}
                        title={colorName}
                        onClick={() => { setSelectedColor(colorName); setSelectedSize(''); }}
                        className={`w-9 h-9 rounded-full border-2 transition-all shadow-sm flex items-center justify-center relative ${
                          isSelected
                            ? 'scale-110 shadow-md ring-2 ring-primary/40 border-primary'
                            : isLight
                            ? 'border-gray-400 hover:border-primary/60'
                            : 'border-transparent hover:border-primary/60'
                        }`}
                        style={{ backgroundColor: hex }}
                      >
                        {isSelected && (
                          <span style={{ color: isLight ? '#111' : '#fff', fontSize: 15, lineHeight: 1, fontWeight: 'bold' }}>✓</span>
                        )}
                        {isUnknown && !isSelected && (
                          <span style={{ color: '#555', fontSize: 10, lineHeight: 1 }}>?</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sizes */}
            {product.available_sizes?.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">
                  Size {selectedSize && <span className="font-normal text-muted-foreground">— {selectedSize}</span>}
                </p>
                {!selectedColor && (
                  <p className="text-xs text-muted-foreground mb-2">Select a color first to see available sizes</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {product.available_sizes.map((s, i) => {
                    const normS = normalize(s);
                    const vKey = `${normSelectedColor}|||${normS}`;
                    const v = variantMap[vKey];
                    const available = selectedColor
                      ? availableSizesForColor.includes(normS) && Boolean(v) && (v.inventory == null || v.inventory > 0)
                      : true;
                    const isSelected = normalize(selectedSize) === normS;
                    const vPrice = v?.price;

                    return (
                      <button
                        key={i}
                        onClick={() => available && selectedColor && setSelectedSize(s)}
                        disabled={!available || !selectedColor}
                        title={!available ? 'Not available in this color' : undefined}
                        className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : !available || !selectedColor
                            ? 'border-border bg-muted text-muted-foreground line-through cursor-not-allowed opacity-40'
                            : 'border-border bg-white hover:border-primary/50 hover:bg-primary/5'
                        }`}
                      >
                        {s}
                        {vPrice != null && vPrice !== product.price && available && !isSelected && (
                          <span className="text-xs ml-1 opacity-60">${vPrice.toFixed(2)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Unavailable combination notice */}
            {selectedColor && selectedSize && !selectedVariant && (
              <p className="text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                This color/size combination is not available.
              </p>
            )}

            {/* Quantity */}
            <div>
              <p className="text-sm font-semibold mb-2">Quantity</p>
              <div className="flex items-center gap-3 w-fit">
                <button
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-9 h-9 rounded-xl border border-border flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-lg font-bold w-8 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(q => {
                    const maximum = selectedInventory == null ? Number.POSITIVE_INFINITY : selectedInventory;
                    return Math.min(maximum, q + 1);
                  })}
                  disabled={selectedInventory != null && quantity >= selectedInventory}
                  className="w-9 h-9 rounded-xl border border-border flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Description */}
            {product.description && (
              <p className="text-muted-foreground leading-relaxed text-sm border-t pt-4">{product.description}</p>
            )}

            {/* Soft Launch Ordering Note */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-4">
              <p className="text-sm font-semibold text-primary mb-1">Soft Launch Ordering</p>
              <p className="text-sm text-foreground">
                1–49 items: Request Order Help. 50+ items: use Bulk Quote 50+ for custom pricing.
              </p>
            </div>

            {/* CTA */}
            <div className="flex flex-col gap-2.5 pt-2">
              {canPreviewDraft && (
                <Button
                  size="lg"
                  type="button"
                  disabled={!canAddToCart}
                  onClick={handleAddToCart}
                  className="w-full text-base font-bold gap-2"
                >
                  <ShoppingCart className="w-5 h-5" /> {buttonLabel}
                </Button>
              )}
              <Link to={orderHelpUrl} className="block">
                <Button size="lg" className="w-full text-base font-bold gap-2">
                  <MessageSquare className="w-5 h-5" /> Request Order Help
                </Button>
              </Link>
              <Link to="/Contact" className="block">
                <Button size="lg" variant="outline" className="w-full gap-2">
                  Contact Support
                </Button>
              </Link>
            </div>

            {/* Info cards */}
            <div className="space-y-2 border-t pt-4">
              {product.shipping_note ? (
                <div className="flex items-start gap-2.5 text-sm bg-primary/5 border border-primary/10 rounded-xl p-3">
                  <Truck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-foreground/80">{product.shipping_note}</p>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 text-sm bg-muted/40 rounded-xl p-3">
                  <Truck className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-muted-foreground">Production & shipping times vary. Contact us for rush orders.</p>
                </div>
              )}
              {product.care_instructions && (
                <div className="flex items-start gap-2.5 text-sm bg-muted/40 rounded-xl p-3">
                  <Scissors className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground mb-0.5">Care Instructions</p>
                    <p className="text-muted-foreground">{product.care_instructions}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2.5 text-sm bg-white border rounded-xl p-3">
                <Shield className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-muted-foreground">
                  Questions? <Link to="/Contact" className="text-primary hover:underline font-medium">Contact us</Link>
                  {' '}or <Link to="/RequestQuote" className="text-primary hover:underline font-medium">request a Bulk Quote 50+</Link>.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Admin debug panel — garment products only */}
        {isAdmin && product.vendor_source === 'Garment Catalog' && (
          <div className="mt-8 border border-dashed border-amber-400 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowDebug(d => !d)}
              className="w-full flex items-center gap-2 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold"
            >
              <Bug className="w-4 h-4" />
              Admin Debug: Variant Image Inspector {showDebug ? '▲' : '▼'}
            </button>
            {showDebug && (
              <div className="bg-amber-50/50 p-4 font-mono text-xs space-y-1.5 text-slate-700">
                <p><span className="font-bold text-slate-500">product_id:</span> {product.id}</p>
                <p><span className="font-bold text-slate-500">selected_color:</span> {selectedColor || '(none)'}</p>
                <p><span className="font-bold text-slate-500">selected_size:</span> {selectedSize || '(none)'}</p>
                <p><span className="font-bold text-slate-500">variant_key:</span> {selectedColor && selectedSize ? variantKey : '(none)'}</p>
                <p><span className="font-bold text-slate-500">selectedVariant found:</span> {selectedVariant ? 'YES' : 'NO'}</p>
                <p><span className="font-bold text-slate-500">selectedVariant.sku:</span> {selectedVariant?.sku || '(empty)'}</p>
                <p><span className="font-bold text-slate-500">selectedVariant.image_url (raw):</span> <span className="break-all">{selectedVariant?.image_url || '(empty)'}</span></p>
                <p><span className="font-bold text-slate-500">variantImage (resolved):</span> <span className="break-all">{variantImage || '(null)'}</span></p>
                <p><span className="font-bold text-slate-500">colorImage (resolved):</span> <span className="break-all">{colorImage || '(null)'}</span></p>
                <p><span className="font-bold text-slate-500">product.image_url (raw):</span> <span className="break-all">{product.image_url || '(empty)'}</span></p>
                <p><span className="font-bold text-slate-500">productMainImage (resolved):</span> <span className="break-all">{productMainImage || '(null)'}</span></p>
                <p><span className="font-bold text-slate-500">displayImage (final):</span> <span className="break-all text-green-700 font-bold">{displayImage || '(NONE — placeholder shown)'}</span></p>
                <p><span className="font-bold text-slate-500">cartItem.image_url (would save):</span> <span className="break-all text-blue-700">{variantImage || colorImage || productMainImage || '(NONE)'}</span></p>
                <p className="pt-1 text-amber-600 font-semibold">
                  {!selectedVariant?.image_url
                    ? '⚠ Variant has no image_url — run Force Repair on /AdminGarmentCatalog'
                    : '✓ Variant has image_url'}
                </p>
                {variantImage && (
                  <div className="pt-2">
                    <p className="font-bold text-slate-500 mb-1">Image preview:</p>
                    <img src={variantImage} alt="variant" className="w-24 h-24 object-contain border rounded bg-white" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
