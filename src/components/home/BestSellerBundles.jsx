import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useCart } from "@/components/shop/CartContext";
import { toast } from "sonner";
import { Package2, ArrowRight, ShoppingCart } from 'lucide-react';
import { motion } from 'framer-motion';

export default function BestSellerBundles() {
  const { addToCart } = useCart();

  const { data: products = [] } = useQuery({
    queryKey: ['home-bundles'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, '-created_date', 4),
  });

  const bundles = products.filter(p =>
    p.name?.toLowerCase().includes('bundle') || p.categories?.includes('digital_designs')
  ).slice(0, 4);

  if (bundles.length === 0) return null;

  return (
    <section className="py-16 bg-primary/5">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-accent text-sm font-bold uppercase tracking-widest mb-1">Save More</p>
            <h2 className="text-3xl font-black text-foreground">Best-Selling Bundles</h2>
          </div>
          <Link
            to="/Bundles"
            className="hidden md:flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80"
          >
            All Bundles <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {bundles.map((product, i) => (
            <motion.div
              key={product.id}
              className="bg-white rounded-xl border overflow-hidden hover:shadow-md transition-shadow group"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
            >
              <Link to={`/ProductDetail?id=${product.id}`}>
                <div className="aspect-square bg-muted overflow-hidden relative">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package2 className="w-10 h-10 text-muted-foreground/30" />
                    </div>
                  )}
                  <span className="absolute top-2 left-2 bg-accent text-accent-foreground text-xs font-bold px-2 py-1 rounded-md">
                    BUNDLE
                  </span>
                </div>
              </Link>
              <div className="p-3">
                <p className="font-semibold text-sm line-clamp-2 mb-1">{product.name}</p>
                <p className="text-primary font-bold">${product.price?.toFixed(2)}</p>
                <button
                  onClick={() => { addToCart(product); toast.success(`${product.name} added!`); }}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold py-2 rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <ShoppingCart className="w-3.5 h-3.5" /> Add to Cart
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}