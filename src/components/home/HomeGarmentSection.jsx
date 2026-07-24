import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/components/shop/CartContext";
import { toast } from "sonner";
import { ShoppingCart, ArrowRight, Eye, MessageSquare, Package } from 'lucide-react';
import { filterPublicProducts } from "@/lib/productVisibility";

const SUBTYPE_LABELS = {
  t_shirts: 'T-Shirt', hoodies: 'Hoodie', sweatshirts: 'Sweatshirt',
  hats: 'Hat', kids_apparel: 'Kids', apparel_blanks: 'Apparel Blank',
  custom_printed: 'Custom Print', print_support: 'Print Support',
};

function ProductCard({ product, onAddToCart }) {
  const [imgError, setImgError] = useState(false);
  const label = product.product_subtype ? SUBTYPE_LABELS[product.product_subtype] : product.category?.replace(/_/g, ' ');
  const isCustomPrint = product.product_subtype === 'custom_printed';
  const colors = product.available_colors || [];

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm hover:shadow-lg transition-all duration-200 group flex flex-col h-full">
      {/* Fixed-height image area */}
      <Link to={`/ProductDetail?id=${product.id}`} className="relative block bg-muted flex-shrink-0" style={{ height: '220px' }}>
        {product.image_url && !imgError ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-muted gap-2">
            <Package className="w-10 h-10 text-muted-foreground/30" />
            <span className="text-xs text-muted-foreground/40 font-bold uppercase tracking-widest">HC Apparel</span>
          </div>
        )}
      </Link>

      {/* Card body */}
      <div className="p-4 flex flex-col flex-1">
        {label && <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>}
        <Link to={`/ProductDetail?id=${product.id}`}>
          <h3 className="font-semibold text-sm leading-snug mb-2 hover:text-primary transition-colors line-clamp-2">{product.name}</h3>
        </Link>

        <div className="flex items-center justify-between mb-2">
          <span className="text-accent font-bold text-base">${(product.sale_price || product.price)?.toFixed(2)}</span>
          {colors.length > 0 && (
            <div className="flex gap-1">
              {colors.slice(0, 5).map((c, i) => (
                <div key={i} title={c.name} className="w-3 h-3 rounded-full border border-border/60 shadow-sm" style={{ backgroundColor: c.hex || '#ccc' }} />
              ))}
              {colors.length > 5 && <span className="text-xs text-muted-foreground ml-0.5">+{colors.length - 5}</span>}
            </div>
          )}
        </div>

        {/* Buttons pinned to bottom */}
        <div className="mt-auto space-y-1.5 pt-2">
          <Link to={`/ProductDetail?id=${product.id}`} className="block">
            <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5 border-primary text-primary hover:bg-primary hover:text-primary-foreground">
              <Eye className="w-3.5 h-3.5" /> View Product
            </Button>
          </Link>
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1 h-8 text-xs gap-1" onClick={onAddToCart}>
              <ShoppingCart className="w-3.5 h-3.5" /> Add to Cart
            </Button>
            {isCustomPrint && (
              <Link to={`/RequestQuote?product=${encodeURIComponent(product.name)}`}>
                <Button size="sm" variant="outline" className="h-8 px-2 text-xs border-secondary" title="Bulk Quote 50+">
                  <MessageSquare className="w-3.5 h-3.5" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomeGarmentSection() {
  const { addToCart } = useCart();

  const { data: allProducts = [], isLoading } = useQuery({
    queryKey: ['home-featured-garments'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, '-created_date', 12),
  });

  const products = filterPublicProducts(allProducts).slice(0, 6);

  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="text-3xl font-bold mb-1">Featured Garments</h2>
            <p className="text-muted-foreground">Premium blanks and custom-ready apparel</p>
          </div>
          <Link to="/ShopGarments">
            <Button variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground gap-2">
              View All <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border" style={{ height: '380px' }}>
                <div className="animate-pulse bg-muted rounded-t-2xl" style={{ height: '220px' }} />
                <div className="p-4 space-y-2">
                  <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
                  <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                  <div className="h-8 bg-muted rounded animate-pulse mt-4" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
            <p className="text-muted-foreground mb-4">Garments coming soon — check back!</p>
            <Link to="/Contact"><Button variant="outline" className="border-primary text-primary">Request a Custom Order</Button></Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5 items-stretch">
            {products.map(p => (
              <ProductCard
                key={p.id}
                product={p}
                onAddToCart={() => { addToCart(p); toast.success(`${p.name} added!`); }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
