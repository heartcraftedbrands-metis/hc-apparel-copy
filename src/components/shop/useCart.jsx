import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

// Hybrid cart: backend for logged-in users, localStorage for guests
export function useCart() {
  const [cart, setCart] = useState([]);
  const [cartRecord, setCartRecord] = useState(null);

  useEffect(() => {
    init();
  }, []);

  const mergeItems = (existing, incoming) => {
    const map = {};
    for (const item of existing) map[item.id] = { ...item };
    for (const item of incoming) {
      if (map[item.id]) map[item.id].quantity += item.quantity;
      else map[item.id] = { ...item };
    }
    return Object.values(map);
  };

  const init = async () => {
    try {
      const me = await base44.auth.me();
      const records = await base44.entities.Cart.filter({ created_by: me.email });
      const local = JSON.parse(localStorage.getItem('hc_cart') || '[]');

      if (records.length > 0) {
        let items = records[0].items || [];
        if (local.length > 0) {
          items = mergeItems(items, local);
          await base44.entities.Cart.update(records[0].id, { items });
          localStorage.removeItem('hc_cart');
        }
        setCartRecord(records[0]);
        setCart(items);
      } else {
        const created = await base44.entities.Cart.create({ items: local });
        if (local.length > 0) localStorage.removeItem('hc_cart');
        setCartRecord(created);
        setCart(created.items || []);
      }
    } catch {
      // Guest user — use localStorage only
      const local = JSON.parse(localStorage.getItem('hc_cart') || '[]');
      setCart(local);
    }
  };

  const persist = useCallback(async (newCart, currentRecord) => {
    setCart(newCart);
    if (currentRecord) {
      await base44.entities.Cart.update(currentRecord.id, { items: newCart });
    } else {
      localStorage.setItem('hc_cart', JSON.stringify(newCart));
    }
    window.dispatchEvent(new CustomEvent('cartUpdated', { detail: newCart }));
  }, []);

  const addToCart = useCallback(async (product) => {
    setCart(current => {
      const existing = current.find(i => i.id === product.id);
      const newCart = existing
        ? current.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
        : [...current, { ...product, quantity: 1 }];
      persist(newCart, cartRecord);
      return newCart;
    });
  }, [cartRecord, persist]);

  const updateQuantity = useCallback(async (productId, quantity) => {
    setCart(current => {
      const newCart = quantity <= 0
        ? current.filter(i => i.id !== productId)
        : current.map(i => i.id === productId ? { ...i, quantity } : i);
      persist(newCart, cartRecord);
      return newCart;
    });
  }, [cartRecord, persist]);

  const removeItem = useCallback(async (productId) => {
    setCart(current => {
      const newCart = current.filter(i => i.id !== productId);
      persist(newCart, cartRecord);
      return newCart;
    });
  }, [cartRecord, persist]);

  const clearCart = useCallback(async () => {
    await persist([], cartRecord);
  }, [cartRecord, persist]);

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return { cart, cartItemCount, addToCart, updateQuantity, removeItem, clearCart };
}