import React from 'react';
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Download, Package, Heart, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { useWishlist } from "./WishlistContext";
import { motion } from 'framer-motion';

const CATEGORY_LABEL = {
  halftone_packs: 'Halftone',
  distressed_packs: 'Full-Tone',
  digital_designs: 'Digital',
  design_elements: 'Elements',
};

export default function ProductCard({ product, onAddToCart }) {
  const { isWishlisted, toggle } = useWishlist();
  const wishlisted = isWishlisted(product.id);

  const cats = product.categories?.length ? product.categories : (product.category ? [product.category] : []);
  const isHalftone = cats.includes('halftone_packs');
  const isFullTone = cats.includes('distressed_packs');
  const catLabel = CATEGORY_LABEL[cats[0]] || null;

  return (
    <motion.div
      className="bg-white rounded-xl border overflow-hidden group flex flex-col"
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
    >
      {/* Image */}
      <Link to={`/ProductDetail?id=${product.id}`} className="block relative aspect-square overflow-hidden bg-muted">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-12 h-12 text-muted-foreground/30" />
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {isHalftone && (
            <span className="text-[10px] font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded-md leading-tight">
              HALFTONE
            </span>
          )}
          {isFullTone && (
            <span className="text-[10px] font-bold bg-foreground text-background px-2 py-0.5 rounded-md leading-tight">
              FULL-TONE
            </span>
          )}
          {product.product_type === 'digital' && (
            <span className="text-[10px] font-bold bg-accent/90 text-accent-foreground px-2 py-0.5 rounded-md leading-tight">
              PNG
            </span>
          )}
        </div>

        {/* Wishlist */}
        <motion.button
          onClick={(e) => { e.preventDefault(); toggle(product.id); }}
          className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm rounded-full p-1.5 shadow"
          whileTap={{ scale: 0.85 }}
        >
          <Heart className={`w-4 h-4 ${wishlisted ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
        </motion.button>
      </Link>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1">
        <Link to={`/ProductDetail?id=${product.id}`}>
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors mb-1">
            {product.name}
          </h3>
        </Link>
        {catLabel && (
          <p className="text-xs text-muted-foreground mb-2">{catLabel}</p>
        )}
        <div className="mt-auto pt-2">
          <p className="text-base font-bold text-primary mb-2">${product.price?.toFixed(2)}</p>
          <div className="flex gap-1.5">
            <motion.button
              onClick={() => onAddToCart(product)}
              disabled={product.product_type === 'physical' && product.stock === 0}
              className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              whileTap={{ scale: 0.97 }}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              {product.product_type === 'physical' && product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
            </motion.button>
            <Link
              to={`/ProductDetail?id=${product.id}`}
              className="flex items-center justify-center bg-secondary text-secondary-foreground p-2 rounded-lg hover:bg-secondary/80 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}