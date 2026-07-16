import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const WishlistContext = createContext(null);

export function WishlistProvider({ children }) {
  const [items, setItems] = useState([]); // array of Wishlist records { id, product_id }
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    base44.auth.me()
      .then(() => base44.entities.Wishlist.list())
      .then(records => { setItems(records); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const isWishlisted = useCallback((productId) => items.some(i => i.product_id === productId), [items]);

  const toggle = useCallback(async (productId) => {
    const existing = items.find(i => i.product_id === productId);
    if (existing) {
      await base44.entities.Wishlist.delete(existing.id);
      setItems(prev => prev.filter(i => i.id !== existing.id));
    } else {
      const created = await base44.entities.Wishlist.create({ product_id: productId });
      setItems(prev => [...prev, created]);
    }
  }, [items]);

  return (
    <WishlistContext.Provider value={{ items, isWishlisted, toggle, loaded }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  return useContext(WishlistContext);
}