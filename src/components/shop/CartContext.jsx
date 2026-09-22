import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { getCartItemKey, getSmallOrderCartQuantity } from '@/lib/productCustomization';
import { trackMarketingEvent } from '@/lib/marketingAnalytics';
import { useAuth } from '@/lib/AuthContext';
import { normalizePublicVisitorPricing, publicVisitorPrice } from '@/lib/customerPricing';

const CartContext = createContext(null);

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

export function CartProvider({ children }) {
  const { isAuthenticated, isLoadingAuth, publicPricingSettings } = useAuth();
  const pricingSettings = normalizePublicVisitorPricing(publicPricingSettings);
  const [cart, setCart] = useState([]);
  const [cartRecord, setCartRecord] = useState(null);
  const [cartReady, setCartReady] = useState(false);

  const priceItemsForViewer = useCallback((items, authenticated) => (items || []).map(item => {
    const markedPublic = item.pricing_tier === 'public_visitor';
    const inferred = markedPublic
      ? Number(item.customer_price ?? (Number(item.price) - pricingSettings.difference))
      : Number(item.customer_price ?? item.price);
    const customerPrice = Number.isFinite(inferred) ? inferred : 0;
    return {
      ...item,
      customer_price: customerPrice,
      price: authenticated ? customerPrice : publicVisitorPrice(customerPrice, pricingSettings, item),
      pricing_tier: authenticated ? 'customer' : 'public_visitor',
    };
  }), [pricingSettings.difference, pricingSettings.enabled]);

  useEffect(() => {
    if (isLoadingAuth) return undefined;
    let active = true;
    const init = async () => {
      setCartReady(false);
      try {
        if (!isAuthenticated) throw new Error('guest');
        const me = await base44.auth.me();
        const records = await base44.entities.Cart.filter({ created_by: me.email });
        const local = JSON.parse(localStorage.getItem('hc_cart') || '[]');
        const record = records[0] || await base44.entities.Cart.create({ items: [] });
        const items = priceItemsForViewer(mergeItems(record.items || [], local), true);
        await base44.entities.Cart.update(record.id, { items });
        localStorage.removeItem('hc_cart');
        if (active) { setCartRecord(record); setCart(items); }
      } catch {
        const local = JSON.parse(localStorage.getItem('hc_cart') || '[]');
        const items = priceItemsForViewer(local, false);
        localStorage.setItem('hc_cart', JSON.stringify(items));
        if (active) { setCartRecord(null); setCart(items); }
      } finally {
        if (active) setCartReady(true);
      }
    };
    init();
    return () => { active = false; };
  }, [isAuthenticated, isLoadingAuth, priceItemsForViewer]);

  const persist = useCallback(async (newCart, record) => {
    setCart(newCart);
    if (record) await base44.entities.Cart.update(record.id, { items: newCart });
    else localStorage.setItem('hc_cart', JSON.stringify(newCart));
  }, []);

  const addToCart = useCallback((product) => {
    const pricedProduct = priceItemsForViewer([{ ...product, customer_price: Number(product.customer_price ?? product.price) }], isAuthenticated)[0];
    setCart(current => {
      const incomingQuantity = Number(pricedProduct.quantity) || 1;
      if ((pricedProduct.product_type || 'physical') === 'physical' && getSmallOrderCartQuantity(current) + incomingQuantity >= 50) return current;
      const productKey = getCartItemKey(pricedProduct);
      const existing = current.find(item => getCartItemKey(item) === productKey);
      const currentQty = existing ? existing.quantity : 0;
      if (pricedProduct.product_type === 'physical' && pricedProduct.stock !== undefined && currentQty >= pricedProduct.stock) return current;
      const newCart = existing
        ? current.map(item => getCartItemKey(item) === productKey ? { ...item, quantity: item.quantity + incomingQuantity } : item)
        : [...current, { ...pricedProduct, quantity: incomingQuantity }];
      persist(newCart, cartRecord);
      trackMarketingEvent('add_to_cart', { id: pricedProduct.id || pricedProduct.product_id, name: pricedProduct.name || pricedProduct.product_name }, 'cart');
      return newCart;
    });
  }, [cartRecord, isAuthenticated, persist, priceItemsForViewer]);

  const updateQuantity = useCallback((itemKey, quantity) => {
    setCart(current => {
      const currentItem = current.find(item => getCartItemKey(item) === itemKey);
      let safeQuantity = quantity;
      if ((currentItem?.product_type || 'physical') === 'physical' && quantity > 0) {
        const otherGarmentQuantity = getSmallOrderCartQuantity(current) - Number(currentItem.quantity || 0);
        safeQuantity = Math.min(quantity, Math.max(1, 49 - otherGarmentQuantity));
      }
      const newCart = safeQuantity <= 0 ? current.filter(i => getCartItemKey(i) !== itemKey) : current.map(i => getCartItemKey(i) === itemKey ? { ...i, quantity: safeQuantity } : i);
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

  const clearCart = useCallback(async () => { localStorage.removeItem('hc_cart'); await persist([], cartRecord); }, [cartRecord, persist]);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  return <CartContext.Provider value={{ cart, cartItemCount, cartReady, addToCart, updateQuantity, removeItem, clearCart }}>{children}</CartContext.Provider>;
}

export function useCart() { return useContext(CartContext); }
