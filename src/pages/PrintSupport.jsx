import React from 'react';
import { Link } from 'react-router-dom';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/components/shop/CartContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Package, Zap, ShoppingCart } from 'lucide-react';
import { filterPublicProducts } from "@/lib/productVisibility";

const PRINT_SUPPORT_CATS = ['design_elements', 'accessories', 'other'];

export default function PrintSupport() {
  const { addToCart } = useCart();

  const { data: allProducts = [], isLoading } = useQuery({
    queryKey: ['print-support-products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, '-created_date'),
  });

  const products = filterPublicProducts(allProducts).filter(p => {
    const cats = p.categories?.length ? p.categories : (p.category ? [p.category] : []);
    return cats.some(c => PRINT_SUPPORT_CATS.includes(c)) || p.product_type === 'physical';
  });

  const FEATURES = [
    { icon: Package, title: 'Apparel Blanks', desc: 'Quality blank garments ready for your custom printing projects.' },
    { icon: Zap, title: 'Transfer Supplies', desc: 'DTF transfers, heat transfer vinyl, and application accessories.' },
    { icon: ShoppingCart, title: 'Print Accessories', desc: 'Everything you need to set up and run your print shop.' },
  ];

  return (
    <div className="bg-background">
      <div className="bg-primary text-primary-foreground py-12">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Print Support Products</h1>
          <p className="text-primary-foreground/70">Supplies and accessories for print professionals</p>
        </div>
      </div>

      {/* Feature highlights */}
      <section className="container mx-auto px-4 py-12">
        <div className="grid md:grid-cols-3 gap-6 mb-14">
          {FEATURES.map((f, i) => (
            <div key={i} className="bg-white rounded-2xl border p-6 flex gap-4 items-start shadow-sm">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <f.icon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-bold mb-1">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {[...Array(8)].map((_, i) => <div key={i} className="bg-white rounded-xl aspect-[3/4] animate-pulse" />)}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-4">Print support products coming soon!</p>
            <Link to="/Contact">
              <Button variant="outline" className="border-primary text-primary">Request Specific Items</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {products.map(product => (
              <div key={product.id} className="bg-white rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                <div className="aspect-square bg-muted overflow-hidden">
                  {product.image_url
                    ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    : <div className="w-full h-full flex items-center justify-center"><Package className="w-12 h-12 text-muted-foreground/30" /></div>
                  }
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-sm mb-1 line-clamp-2">{product.name}</h3>
                  <p className="text-accent font-bold text-base mb-3">${product.price?.toFixed(2)}</p>
                  <Button size="sm" className="w-full gap-2" onClick={() => { addToCart(product); toast.success(`${product.name} added!`); }}>
                    <ShoppingCart className="w-3.5 h-3.5" /> Add to Cart
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}