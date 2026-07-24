import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ShoppingCart, Settings, LogOut, User, Package, BarChart3, Search, Archive, Truck, Tag, Calculator, MessageSquare, Mail, DollarSign, CheckCircle2, Inbox } from "lucide-react";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
    <div className="min-h-screen bg-background">
      <MobileHeader />

      {/* Desktop header */}
      <header className="hidden md:block bg-primary text-primary-foreground sticky top-0 z-40 shadow-md">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16 gap-6">
            <Link to="/" className="flex-shrink-0">
              <img
                src="https://bxsdajpldrdesnvjiubt.supabase.co/storage/v1/object/public/storefront-assets/legacy/8498fd234f415ff5_4bf10d633_1.png"
                alt="HC Apparel"
                className="h-10 w-auto brightness-0 invert"
              />
            </Link>

            <nav className="hidden lg:flex items-center gap-0.5">
              {NAV_LINKS.map(({ to, label }) => {
                const active = location.pathname === to || location.pathname.startsWith(to + '/');
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
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

            <div className="flex items-center gap-2 ml-auto">
              <div className="hidden lg:flex items-center relative">
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

              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/15">
                      <User className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem disabled className="text-xs">{user.email}</DropdownMenuItem>
                    {user.role === 'admin' && (
                      <>
                        <DropdownMenuSeparator />
                        <Link to="/AdminDashboard"><DropdownMenuItem><BarChart3 className="w-4 h-4 mr-2" />Admin Dashboard</DropdownMenuItem></Link>
                        <Link to="/AdminProducts"><DropdownMenuItem><Settings className="w-4 h-4 mr-2" />Products</DropdownMenuItem></Link>
                        <Link to="/AdminDigitalArchive"><DropdownMenuItem><Archive className="w-4 h-4 mr-2" />Design Archive</DropdownMenuItem></Link>
                        <Link to="/AdminOrders"><DropdownMenuItem><Package className="w-4 h-4 mr-2" />Orders</DropdownMenuItem></Link>
                        <Link to="/AdminVendorOrders"><DropdownMenuItem><Truck className="w-4 h-4 mr-2" />Vendor Order Drafts</DropdownMenuItem></Link>
                        <Link to="/AdminVendors"><DropdownMenuItem><Tag className="w-4 h-4 mr-2" />Vendors</DropdownMenuItem></Link>
                        <Link to="/AdminQuotes"><DropdownMenuItem><MessageSquare className="w-4 h-4 mr-2" />Quotes</DropdownMenuItem></Link>
                        <Link to="/AdminQuoteRequests"><DropdownMenuItem><MessageSquare className="w-4 h-4 mr-2" />Quote Requests</DropdownMenuItem></Link>
                        <Link to="/AdminSSCatalog"><DropdownMenuItem><Archive className="w-4 h-4 mr-2" />S&S Catalog</DropdownMenuItem></Link>
                        <Link to="/AdminSSPricingRules"><DropdownMenuItem><DollarSign className="w-4 h-4 mr-2" />S&S Pricing Rules</DropdownMenuItem></Link>
                        <Link to="/AdminSSImportAudit"><DropdownMenuItem><CheckCircle2 className="w-4 h-4 mr-2" />S&S Import Audit</DropdownMenuItem></Link>
                        <Link to="/AdminSSDraftProductTest"><DropdownMenuItem><CheckCircle2 className="w-4 h-4 mr-2" />S&S Draft Test</DropdownMenuItem></Link>
                        <Link to="/AdminProfitCalc"><DropdownMenuItem><Calculator className="w-4 h-4 mr-2" />Profit Calc</DropdownMenuItem></Link>
                        <Link to="/AdminQATestReport"><DropdownMenuItem><Package className="w-4 h-4 mr-2" />QA Test Report</DropdownMenuItem></Link>
                        <Link to="/AdminVendorOrderTest"><DropdownMenuItem><Package className="w-4 h-4 mr-2" />Vendor Order Tests</DropdownMenuItem></Link>
                        <Link to="/AdminPaymentSettings"><DropdownMenuItem><Settings className="w-4 h-4 mr-2" />Payment Settings</DropdownMenuItem></Link>
                        <Link to="/AdminCustomerNotifications"><DropdownMenuItem><Mail className="w-4 h-4 mr-2" />Customer Notifications</DropdownMenuItem></Link>
                        <Link to="/AdminContactMessages"><DropdownMenuItem><MessageSquare className="w-4 h-4 mr-2" />Contact Messages</DropdownMenuItem></Link>
                        <Link to="/AdminOperationsDashboard"><DropdownMenuItem><BarChart3 className="w-4 h-4 mr-2" />Operations Dashboard</DropdownMenuItem></Link>
                        <DropdownMenuSeparator />
                        <Link to="/AdminInbox">
                          <DropdownMenuItem className="font-semibold">
                            <Inbox className="w-4 h-4 mr-2 text-primary" />
                            Inbox
                            {inboxBadge > 0 && (
                              <span className="ml-auto bg-blue-100 text-blue-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{inboxBadge}</span>
                            )}
                          </DropdownMenuItem>
                        </Link>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <Link to="/TrackOrder"><DropdownMenuItem><Package className="w-4 h-4 mr-2" />Track Order</DropdownMenuItem></Link>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => base44.auth.logout()}>
                      <LogOut className="w-4 h-4 mr-2" />Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                  onClick={() => base44.auth.redirectToLogin()}
                >
                  Login
                </Button>
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
