import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ShoppingCart, Settings, LogOut, User, Package, BarChart3, Search, Archive, Truck, Mail, Inbox, Sparkles, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import CartDrawer from "./components/shop/CartDrawer";
import { useQuery } from '@tanstack/react-query';
import { CartProvider, useCart } from "./components/shop/CartContext";
import { WishlistProvider } from "./components/shop/WishlistContext";
import BottomTabBar from "./components/mobile/BottomTabBar";
import MobileHeader from "./components/mobile/MobileHeader";
import RouteTransition from "./components/mobile/RouteTransition";
import DeleteAccountModal from "./components/mobile/DeleteAccountModal";

const NAV_LINKS = [
  { to: '/ShopGarments', label: 'Shop Garments' },
  { to: '/CustomPrinting', label: 'Custom Printing' },
  { to: '/PrintSupport', label: 'Print Support' },
  { to: '/RequestQuote', label: 'Bulk Quote 50+' },
  { to: '/About', label: 'About' },
  { to: '/FAQ', label: 'FAQ' },
  { to: '/Contact', label: 'Contact' },
];

function LayoutInner({ children }) {
  const [user, setUser] = useState(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [headerSearch, setHeaderSearch] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleHeaderSearch = (e) => {
    if (e.key === 'Enter' && headerSearch.trim()) {
      navigate(`/ShopGarments?q=${encodeURIComponent(headerSearch.trim())}`);
      setHeaderSearch('');
    }
  };

  const { cart, cartItemCount, updateQuantity, removeItem } = useCart();

  const { data: inboxMessages = [] } = useQuery({
    queryKey: ['contact_messages'],
    queryFn: () => base44.entities.ContactMessage.list('-created_date', 50),
    enabled: user?.role === 'admin',
  });
  const { data: inboxQuotes = [] } = useQuery({
    queryKey: ['quote_requests'],
    queryFn: () => base44.entities.QuoteRequest.list('-created_date', 50),
    enabled: user?.role === 'admin',
  });
  const inboxBadge = inboxMessages.filter(m => m.status === 'new').length +
    inboxQuotes.filter(q => q.status === 'new').length;

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    const handler = () => setIsCartOpen(true);
    window.addEventListener('hc:open-cart', handler);
    return () => window.removeEventListener('hc:open-cart', handler);
  }, []);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background">
      <MobileHeader />

      {/* Desktop header */}
      <header className="hidden md:block bg-primary text-primary-foreground sticky top-0 z-40 shadow-md">
        <div className="container mx-auto max-w-full px-4">
          <div className="flex h-16 min-w-0 items-center justify-between gap-2 xl:gap-6">
            <Link to="/" className="flex shrink-0 items-center gap-2.5 whitespace-nowrap" aria-label="HC Apparel home">
              <img
                src="https://bxsdajpldrdesnvjiubt.supabase.co/storage/v1/object/public/storefront-assets/legacy/8498fd234f415ff5_4bf10d633_1.png"
                alt="HC Apparel"
                className="h-11 w-auto max-w-16 object-contain brightness-0 invert"
              />
              <span className="text-sm font-bold tracking-wide text-primary-foreground xl:text-base">HC Apparel</span>
            </Link>

            <nav className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 lg:flex">
              {NAV_LINKS.map(({ to, label }) => {
                const active = location.pathname === to || location.pathname.startsWith(to + '/');
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`whitespace-nowrap rounded-lg px-2 py-2 text-xs font-medium transition-colors xl:px-3.5 xl:text-sm ${
                      active
                        ? 'bg-primary-foreground/15 text-primary-foreground'
                        : 'text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10'
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-1 xl:gap-2">
              <div className="relative hidden items-center xl:flex">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground" />
                <Input
                  placeholder="Search garments..."
                  value={headerSearch}
                  onChange={e => setHeaderSearch(e.target.value)}
                  onKeyDown={handleHeaderSearch}
                  className="pl-9 w-44 bg-white border-0 text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-accent"
                />
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="relative text-primary-foreground hover:bg-primary-foreground/15"
                onClick={() => setIsCartOpen(true)}
              >
                <ShoppingCart className="w-5 h-5" />
                {cartItemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {cartItemCount}
                  </span>
                )}
              </Button>

              {user && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/15">
                      <User className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-[80vh] w-64 overflow-y-auto">
                    <DropdownMenuItem disabled className="text-xs">{user.email}</DropdownMenuItem>
                    {user.role === 'admin' && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">Admin</DropdownMenuLabel>
                        <Link to="/AdminDashboard"><DropdownMenuItem><BarChart3 className="w-4 h-4 mr-2" />Admin Dashboard</DropdownMenuItem></Link>
                        <Link to="/AdminInbox"><DropdownMenuItem><Inbox className="w-4 h-4 mr-2" />HC Apparel Inbox{inboxBadge > 0 && <span className="ml-auto rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-bold text-blue-700">{inboxBadge}</span>}</DropdownMenuItem></Link>
                        <Link to="/AdminOperationsDashboard"><DropdownMenuItem><Package className="w-4 h-4 mr-2" />Customer Orders</DropdownMenuItem></Link>
                        <Link to="/AdminVendorOrders"><DropdownMenuItem><Truck className="w-4 h-4 mr-2" />S&amp;S Fulfillment Orders</DropdownMenuItem></Link>
                        <Link to="/AdminGarmentCatalog"><DropdownMenuItem><Archive className="w-4 h-4 mr-2" />Garment Catalog</DropdownMenuItem></Link>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">Marketing</DropdownMenuLabel>
                        <Link to="/AdminSocialMediaStudio"><DropdownMenuItem><Sparkles className="w-4 h-4 mr-2" />Social Media Studio</DropdownMenuItem></Link>
                        <Link to="/AdminEmailMarketingSettings"><DropdownMenuItem><Mail className="w-4 h-4 mr-2" />Email Marketing</DropdownMenuItem></Link>
                        <Link to="/AdminMarketingAnalytics"><DropdownMenuItem><BarChart3 className="w-4 h-4 mr-2" />Marketing Analytics</DropdownMenuItem></Link>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">Operations</DropdownMenuLabel>
                        <Link to="/AdminProductivityDashboard"><DropdownMenuItem><Settings className="w-4 h-4 mr-2" />Productivity Dashboard</DropdownMenuItem></Link>
                        <Link to="/AdminCalendarSettings"><DropdownMenuItem><CalendarDays className="w-4 h-4 mr-2" />Calendar Settings</DropdownMenuItem></Link>
                        <Link to="/AdminTeamProductivity"><DropdownMenuItem><User className="w-4 h-4 mr-2" />Team Settings</DropdownMenuItem></Link>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">Account</DropdownMenuLabel>
                    <Link to="/Profile"><DropdownMenuItem><User className="w-4 h-4 mr-2" />My Account</DropdownMenuItem></Link>
                    <DropdownMenuItem onClick={() => base44.auth.logout()}>
                      <LogOut className="w-4 h-4 mr-2" />Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="pb-16 md:pb-0">
        <RouteTransition>{children}</RouteTransition>
      </main>

      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} cart={cart} onUpdateQuantity={updateQuantity} onRemoveItem={removeItem} />
      <DeleteAccountModal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} />
      <BottomTabBar />

      {/* Footer */}
      <footer className="hidden md:block bg-primary text-primary-foreground mt-16" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="container mx-auto px-4 py-12">
          <div className="grid md:grid-cols-4 gap-8 mb-10">
            <div>
              <img
                src="https://bxsdajpldrdesnvjiubt.supabase.co/storage/v1/object/public/storefront-assets/legacy/8498fd234f415ff5_4bf10d633_1.png"
                alt="HC Apparel"
                className="h-10 w-auto brightness-0 invert mb-4"
              />
              <p className="text-primary-foreground/60 text-sm leading-relaxed">
                Premium apparel and custom print services for brands, creators, and businesses.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-sm uppercase tracking-wider mb-3 text-accent">Shop</h4>
              <ul className="space-y-2 text-sm text-primary-foreground/70">
                <li><Link to="/ShopGarments" className="hover:text-primary-foreground transition-colors">All Garments</Link></li>
                <li><Link to="/CustomPrinting" className="hover:text-primary-foreground transition-colors">Custom Printing</Link></li>
                <li><Link to="/PrintSupport" className="hover:text-primary-foreground transition-colors">Print Support</Link></li>
                <li><Link to="/RequestQuote" className="hover:text-primary-foreground transition-colors">Bulk Quote 50+</Link></li>
                <li><Link to="/TrackOrder" className="hover:text-primary-foreground transition-colors">Track Order</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-sm uppercase tracking-wider mb-3 text-accent">Company</h4>
              <ul className="space-y-2 text-sm text-primary-foreground/70">
                <li><Link to="/About" className="hover:text-primary-foreground transition-colors">About HC Apparel</Link></li>
                <li><Link to="/FAQ" className="hover:text-primary-foreground transition-colors">FAQ</Link></li>
                <li><Link to="/Contact" className="hover:text-primary-foreground transition-colors">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-sm uppercase tracking-wider mb-3 text-accent">Contact</h4>
              <p className="text-sm text-primary-foreground/70">support@ilovehcapparel.net</p>
              <p className="text-sm text-primary-foreground/70 mt-1">www.ilovehcapparel.net</p>
            </div>
          </div>
          <div className="border-t border-primary-foreground/20 pt-6 text-center text-primary-foreground/50 text-sm">
            <p>&copy; 2026 HeartCrafted Apparel. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function Layout({ children }) {
  return (
    <CartProvider>
      <WishlistProvider>
        <LayoutInner>{children}</LayoutInner>
      </WishlistProvider>
    </CartProvider>
  );
}
