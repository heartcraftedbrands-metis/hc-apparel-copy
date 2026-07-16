import React from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/shop/CartContext";
import { toast } from "sonner";

export default function SpecialsSection() {
  const { addToCart } = useCart();

  const { data: products = [] } = useQuery({
    queryKey: ['specials'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, '-created_date', 4),
  });

  const handleAdd = (product) => {
    addToCart(product);
    toast.success(`${product.name} added to cart`);
  };

  if (products.length === 0) return null;

  return (
    <section className="py-14 bg-white">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">🔥 Specials</h2>
            <p className="text-gray-500 mt-1">Hand-picked deals just for you</p>
          </div>
          <Link to={createPageUrl('Home') + '#shop'}>
            <Button variant="outline">View All</Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <div key={product.id} className="bg-gray-50 rounded-2xl overflow-hidden shadow hover:shadow-md transition group">
              <Link to={`${createPageUrl('ProductDetail')}?id=${product.id}`}>
                <div className="aspect-square overflow-hidden">
                  <img
                    src={product.image_url || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=400&q=80'}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              </Link>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-gray-900 text-sm line-clamp-2">{product.name}</h3>
                  <Badge className="shrink-0 bg-red-100 text-red-700 border-0">Special</Badge>
                </div>
                <p className="text-lg font-bold text-gray-900 mb-3">${product.price?.toFixed(2)}</p>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => handleAdd(product)}
                  disabled={product.product_type === 'physical' && product.stock <= 0}
                >
                  {product.product_type === 'physical' && product.stock <= 0 ? 'Out of Stock' : 'Add to Cart'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}