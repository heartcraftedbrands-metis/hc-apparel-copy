import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, ShoppingBag, Printer, User, ShoppingCart } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCart } from '@/components/shop/CartContext';

const TABS = [
  { label: 'Home',    icon: Home,        path: '/' },
  { label: 'Shop',    icon: ShoppingBag, path: '/ShopGarments' },
  { label: 'Print',   icon: Printer,     path: '/CustomPrinting' },
  { label: 'Profile', icon: User,        path: '/Profile' },
];

export default function BottomTabBar() {
  const { pathname } = useLocation();
  const { cartItemCount } = useCart();

  const openCart = () => {
    window.dispatchEvent(new CustomEvent('hc:open-cart'));
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-primary text-primary-foreground border-t border-primary-foreground/10 flex"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map(({ label, icon: Icon, path }) => {
        const active = pathname === path || (path !== '/' && pathname.startsWith(path));
        return (
          <Link
            key={path}
            to={path}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors select-none min-h-[44px] ${
              active ? 'text-accent' : 'text-primary-foreground/50 hover:text-primary-foreground/80'
            }`}
          >
            <motion.div whileTap={{ scale: 0.85 }}>
              <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
            </motion.div>
            {label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={openCart}
        className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium text-primary-foreground/50 transition-colors select-none min-h-[44px] hover:text-primary-foreground/80"
        aria-label={`Open cart with ${cartItemCount} item${cartItemCount === 1 ? '' : 's'}`}
      >
        <motion.div whileTap={{ scale: 0.85 }} className="relative">
          <ShoppingCart className="w-5 h-5" />
          {cartItemCount > 0 && (
            <span className="absolute -top-2 left-full ml-0.5 min-w-4 h-4 px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold leading-none flex items-center justify-center">
              {cartItemCount > 99 ? '99+' : cartItemCount}
            </span>
          )}
        </motion.div>
        Cart
      </button>
    </nav>
  );
}
