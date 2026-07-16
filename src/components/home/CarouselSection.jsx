import React, { useState, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from "@/components/ui/button";

export default function CarouselSection() {
  const [current, setCurrent] = useState(0);

  const { data: products = [] } = useQuery({
    queryKey: ['featured-products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, '-created_date', 8),
  });

  useEffect(() => {
    if (products.length === 0) return;
    const timer = setInterval(() => {
      setCurrent(c => (c + 1) % products.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [products.length]);

  if (products.length === 0) return null;

  const prev = () => setCurrent(c => (c - 1 + products.length) % products.length);
  const next = () => setCurrent(c => (c + 1) % products.length);

  return (
    <section className="py-14 bg-gray-50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-8">Featured Products</h2>
        <div className="relative overflow-hidden rounded-2xl shadow-lg">
          <div
            className="flex transition-transform duration-500 ease-in-out"
            style={{ transform: `translateX(-${current * 100}%)` }}
          >
            {products.map((product) => (
              <div key={product.id} className="min-w-full relative">
                <img
                  src={product.image_url || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=1200&q=80'}
                  alt={product.name}
                  className="w-full h-72 md:h-[420px] object-contain bg-gray-100"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex flex-col justify-end p-8">
                  <h3 className="text-2xl font-bold text-white mb-1">{product.name}</h3>
                  <p className="text-white/80 mb-4 text-sm line-clamp-2">{product.description}</p>
                  <div className="flex items-center gap-4">
                    <span className="text-white text-xl font-semibold">${product.price?.toFixed(2)}</span>
                    <Link to={`${createPageUrl('ProductDetail')}?id=${product.id}`}>
                      <Button className="bg-white text-black hover:bg-gray-100">View Product</Button>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-2 shadow transition"
          >
            <ChevronLeft className="w-5 h-5 text-gray-800" />
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-2 shadow transition"
          >
            <ChevronRight className="w-5 h-5 text-gray-800" />
          </button>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {products.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-2.5 h-2.5 rounded-full transition-all ${i === current ? 'bg-white scale-125' : 'bg-white/50'}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}