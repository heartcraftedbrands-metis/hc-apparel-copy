import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

const HOME_PATHS = ['/'];

export default function MobileHeader() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isHome = HOME_PATHS.includes(pathname);

  return (
    <div
      className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 bg-primary text-primary-foreground border-b border-primary-foreground/10"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {!isHome ? (
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-primary-foreground/80 select-none"
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">Back</span>
        </button>
      ) : (
        <div className="w-16" />
      )}

      <Link to="/" className="absolute left-1/2 -translate-x-1/2">
        <img
          src="https://bxsdajpldrdesnvjiubt.supabase.co/storage/v1/object/public/storefront-assets/legacy/8498fd234f415ff5_4bf10d633_1.png"
          alt="HC Apparel"
          className="h-9 w-auto brightness-0 invert"
        />
      </Link>

      <div className="w-16" />
    </div>
  );
}
