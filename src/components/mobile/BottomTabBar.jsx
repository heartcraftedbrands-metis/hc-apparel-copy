import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, ShoppingBag, Printer, User } from 'lucide-react';
import { motion } from 'framer-motion';

const TABS = [
  { label: 'Home',    icon: Home,        path: '/' },
  { label: 'Shop',    icon: ShoppingBag, path: '/ShopGarments' },
  { label: 'Printing',icon: Printer,     path: '/CustomPrinting' },
  { label: 'Profile', icon: User,        path: '/Profile' },
];

export default function BottomTabBar() {
  const { pathname } = useLocation();

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
    </nav>
  );
}