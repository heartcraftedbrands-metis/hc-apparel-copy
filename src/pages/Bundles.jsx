import React from 'react';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ProductCard from "@/components/shop/ProductCard";
import { useCart } from "@/components/shop/CartContext";
import { toast } from "sonner";
import { Package2 } from "lucide-react";
import { motion } from 'framer-motion';

export default function Bundles() {
  const { addToCart } = useCart();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['bundle-products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, '-created_date'),
  });

  const bundles = products.filter(p =>
    p.name?.toLowerCase().includes('bundle') ||
    p.categories?.includes('digital_designs') ||
    p.description?.toLowerCase().includes('bundle')
  );

  const handleAddToCart = (product) => {
    addToCart(product);
    toast.success(`${product.name} added to cart!`);
  };

  return (
    <div className="bg-background min-h-screen">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-14">
        <div className="container mx-auto px-4 text-center">
          <Package2 className="w-12 h-12 mx-auto mb-4 text-accent" />
          <h1 className="text-4xl font-bold mb-3">Design Bundles</h1>
          <p className="text-primary-foreground/75 max-w-xl mx-auto">
            Save big with curated bundles of our best-selling DTF & PNG designs. Perfect for print shops and apparel creators stocking up.
          </p>
        </div>
      </div>

      {/* Value props */}
      <div className="bg-accent/10 border-b border-accent/20">
        <div className="container mx-auto px-4 py-5">
          <div className="flex flex-wrap justify-center gap-8 text-sm text-center">
            {[
              ['💾', 'Instant Download'],
              ['🎨', 'PNG & DTF Ready'],
              ['🔓', 'Commercial License'],
              ['💰', 'Best Value'],
            ].map(([icon, text]) => (
              <div key={text} className="flex items-center gap-2 font-medium text-foreground">
                <span>{icon}</span> {text}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl aspect-[3/4] animate-pulse" />
            ))}
          </div>
        ) : bundles.length === 0 ? (
          <div className="text-center py-24">
            <Package2 className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">No bundles available yet. Check back soon!</p>
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {bundles.map((product, i) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <ProductCard product={product} onAddToCart={handleAddToCart} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}