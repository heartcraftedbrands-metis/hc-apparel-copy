import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Eye, Star, Sparkles } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getProductPriceRange, getStorefrontCategoryLabel } from "@/lib/shopGarmentFilters";
import ProductCustomizationDialog from "@/components/shop/ProductCustomizationDialog";
import { isBlankFirstProduct } from "@/lib/productCustomization";

export default function GarmentProductCard({ product }) {
  const [imgError, setImgError] = useState(false);

  const catLabel = getStorefrontCategoryLabel(product);

  const colors = product.available_colors || [];
  const sizes = product.available_sizes || [];
  const priceRange = getProductPriceRange(product);
  const displayPrice = priceRange.minimum;
  const isOnSale = product.sale_price && product.sale_price < product.price;

  const isCustomPrint = product.product_subtype === 'custom_printed';
  const isPrintSupport = product.product_subtype === 'print_support';
  const blankFirst = isBlankFirstProduct(product);

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 group flex flex-col">
      {/* Image */}
      <Link to={`/ProductDetail?id=${product.id}`} className="relative block bg-muted overflow-hidden flex-shrink-0" style={{ paddingTop: '100%' }}>
        <div className="absolute inset-0">
          {product.image_url && !imgError ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-black text-5xl text-muted-foreground/10 select-none">HC</div>
          )}
        </div>

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {catLabel && (
            <Badge className="bg-primary/90 text-primary-foreground text-xs px-2 py-0.5 w-fit">{catLabel}</Badge>
          )}
          {product.is_featured && (
            <Badge className="bg-accent text-accent-foreground text-xs px-2 py-0.5 w-fit gap-0.5">
              <Sparkles className="w-2.5 h-2.5" />Featured
            </Badge>
          )}
          {product.is_best_seller && (
            <Badge className="bg-orange-500 text-white text-xs px-2 py-0.5 w-fit gap-0.5">
              <Star className="w-2.5 h-2.5" />Best Seller
            </Badge>
          )}
          {isOnSale && (
            <Badge className="bg-red-500 text-white text-xs px-2 py-0.5 w-fit">Sale</Badge>
          )}
          {product.is_premium && (
            <Badge className="bg-slate-900 text-white text-xs px-2 py-0.5 w-fit">Premium</Badge>
          )}
        </div>
      </Link>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1">
        <Link to={`/ProductDetail?id=${product.id}`}>
          <h3 className="font-semibold text-sm leading-snug mb-1 hover:text-primary transition-colors line-clamp-2">{product.name}</h3>
        </Link>

        {/* Price */}
        <div className="flex items-baseline gap-1.5 mb-2">
          {priceRange.hasVariablePricing && (
            <span className="text-xs font-medium text-muted-foreground">Starting at</span>
          )}
          <span className="text-accent font-bold text-base">${displayPrice?.toFixed(2)}</span>
          {isOnSale && (
            <span className="text-xs text-muted-foreground line-through">${product.price?.toFixed(2)}</span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
          Blank garment · Customization priced separately
        </p>

        {/* Colors preview */}
        {colors.length > 0 && (
          <div className="flex items-center gap-1 mb-2 flex-wrap">
            {colors.slice(0, 7).map((c, i) => {
              const colorName = typeof c === 'object'
                ? c.name ?? c.color ?? c.label ?? ''
                : c;
              const colorHex = typeof c === 'object' ? c.hex ?? c.color_hex : '';
              return (
                <div
                  key={`${colorName}-${i}`}
                  title={colorName}
                  aria-label={colorName}
                  className="w-3.5 h-3.5 rounded-full border border-border/60 shadow-sm flex-shrink-0"
                  style={{ backgroundColor: colorHex || '#d1d5db' }}
                />
              );
            })}
            {colors.length > 7 && (
              <span className="text-xs text-muted-foreground">+{colors.length - 7}</span>
            )}
          </div>
        )}

        {/* Sizes preview */}
        {sizes.length > 0 && (
          <div className="flex items-center gap-1 mb-2 flex-wrap">
            {sizes.slice(0, 4).map((s, i) => (
              <span key={i} className="text-xs px-1.5 py-0.5 bg-muted rounded font-medium text-muted-foreground">{s}</span>
            ))}
            {sizes.length > 4 && <span className="text-xs text-muted-foreground">+{sizes.length - 4}</span>}
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto pt-2 space-y-1.5">
          <Link to={`/ProductDetail?id=${product.id}`} className="block">
            <Button size="sm" variant="outline" className="w-full h-8 gap-1.5 text-xs border-primary text-primary hover:bg-primary hover:text-primary-foreground">
              <Eye className="w-3.5 h-3.5" /> View Product
            </Button>
          </Link>
          <ProductCustomizationDialog
            product={product}
            blankFirst={blankFirst}
            trigger={(
              <Button size="sm" className="w-full h-8 gap-1 text-xs">
                <ShoppingCart className="w-3.5 h-3.5" /> {blankFirst ? 'Add Blank to Cart' : 'Customize & Add to Cart'}
              </Button>
            )}
          />
        </div>
      </div>
    </div>
  );
}
