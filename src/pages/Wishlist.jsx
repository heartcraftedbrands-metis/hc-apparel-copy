import React, { useEffect, useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useWishlist } from "@/components/shop/WishlistContext";
import { useCart } from "@/components/shop/CartContext";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Heart, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Wishlist() {
  const { items, toggle } = useWishlist();
  const { addToCart } = useCart();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (items.length === 0) { setProducts([]); setLoading(false); return; }
    const ids = items.map(i => i.product_id);
    Promise.all(ids.map(id => base44.entities.Product.filter({ id }))).then(results => {
      setProducts(results.flat());
      setLoading(false);
    });
  }, [items]);

  const handleAddToCart = (product) => {
    addToCart(product);
    toast.success(`${product.name} added to cart`);
  };

  const handleRemove = (productId) => {
    toggle(productId);
    toast.success('Removed from wishlist');
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="flex items-center gap-3 mb-8">
        <Heart className="w-7 h-7 text-red-500 fill-red-500" />
        <h1 className="text-3xl font-bold text-gray-900">My Wishlist</h1>
        <span className="text-gray-400 text-lg">({items.length} items)</span>
      </div>

      {loading ? (
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20">
          <Heart className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-xl font-semibold text-gray-500 mb-2">Your wishlist is empty</p>
          <p className="text-gray-400 mb-6">Save items you love to come back to them later.</p>
          <Link to={createPageUrl('Home')}>
            <Button>Browse Products</Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {products.map(product => (
            <div key={product.id} className="flex items-center gap-4 bg-white rounded-xl shadow-sm border p-4">
              <Link to={`${createPageUrl('ProductDetail')}?id=${product.id}`}>
                <img
                  src={product.image_url || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=100&q=80'}
                  alt={product.name}
                  className="w-20 h-20 object-cover rounded-lg shrink-0"
                />
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={`${createPageUrl('ProductDetail')}?id=${product.id}`}>
                  <h3 className="font-semibold text-gray-900 hover:text-blue-600 transition-colors line-clamp-1">{product.name}</h3>
                </Link>
                <p className="text-gray-500 text-sm line-clamp-1 mt-0.5">{product.description}</p>
                <p className="text-lg font-bold text-gray-900 mt-1">${product.price?.toFixed(2)}</p>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={() => handleAddToCart(product)}
                  disabled={product.product_type === 'physical' && product.stock === 0}
                >
                  <ShoppingCart className="w-4 h-4 mr-1" />
                  Add to Cart
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-600 hover:bg-red-50"
                  onClick={() => handleRemove(product.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}