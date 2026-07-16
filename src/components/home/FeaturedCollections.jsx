import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ProductCard from "@/components/shop/ProductCard";
import { useCart } from "@/components/shop/CartContext";
import { toast } from "sonner";
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export default function FeaturedCollections() {
  const { addToCart } = useCart();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['featured-products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, '-created_date', 8),
  });

  const handleAddToCart = (product) => {
    addToCart(product);
    toast.success(`${product.name} added to cart!`);
  };

  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-accent text-sm font-bold uppercase tracking-widest mb-1">New Arrivals</p>
            <h2 className="text-3xl font-black text-foreground">Featured Designs</h2>
          </div>
          <Link
            to="/Shop"
            className="hidden md:flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            View all <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl aspect-[3/4] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {products.map((product, i) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <ProductCard product={product} onAddToCart={handleAddToCart} />
              </motion.div>
            ))}
          </div>
        )}

        <div className="text-center mt-8 md:hidden">
          <Link
            to="/Shop"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors"
          >
            View All Designs <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}