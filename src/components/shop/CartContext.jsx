import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);
  const [cartRecord, setCartRecord] = useState(null);

  useEffect(() => {
    init();
  }, []);

  const getCartItemKey = (item) => `${item.id}|${item.selectedSize || ''}|${item.selectedColor || ''}`;

  const mergeItems = (existing, incoming) => {
    const map = {};
    for (const item of existing) map[getCartItemKey(item)] = { ...item };
    for (const item of incoming) {
      const key = getCartItemKey(item);
      if (map[key]) map[key].quantity += item.quantity;
      else map[key] = { ...item };
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
      // Guest — use localStorage
      const local = JSON.parse(localStorage.getItem('hc_cart') || '[]');
      setCart(local);
    }
  };

  const persist = useCallback(async (newCart, record) => {
    setCart(newCart);
    if (record) {
      await base44.entities.Cart.update(record.id, { items: newCart });
    } else {
      localStorage.setItem('hc_cart', JSON.stringify(newCart));
    }
  }, []);

  const addToCart = useCallback((product) => {
    setCart(current => {
      // Find existing item with same product ID and options
      const existing = current.find(i => i.id === product.id && i.selectedSize === product.selectedSize && i.selectedColor === product.selectedColor);
      const currentQty = existing ? existing.quantity : 0;
      if (product.product_type === 'physical' && product.stock !== undefined && currentQty >= product.stock) {
        return current;
      }
      const newCart = existing
        ? current.map(i => i.id === product.id && i.selectedSize === product.selectedSize && i.selectedColor === product.selectedColor ? { ...i, quantity: i.quantity + (product.quantity || 1) } : i)
        : [...current, { ...product, quantity: product.quantity || 1 }];
      persist(newCart, cartRecord);
      return newCart;
    });
  }, [cartRecord, persist]);

  const updateQuantity = useCallback((itemKey, quantity) => {
    setCart(current => {
      const newCart = quantity <= 0
        ? current.filter(i => getCartItemKey(i) !== itemKey)
        : current.map(i => getCartItemKey(i) === itemKey ? { ...i, quantity } : i);
      persist(newCart, cartRecord);
      return newCart;
    });
  }, [cartRecord, persist]);

  const removeItem = useCallback((itemKey) => {
    setCart(current => {
      const newCart = current.filter(i => getCartItemKey(i) !== itemKey);
      persist(newCart, cartRecord);
      return newCart;
    });
  }, [cartRecord, persist]);

  const clearCart = useCallback(() => {
    persist([], cartRecord);
    setCart([]);
  }, [cartRecord, persist]);

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, cartItemCount, addToCart, updateQuantity, removeItem, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}