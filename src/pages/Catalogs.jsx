import React, { useEffect } from 'react';
import { ExternalLink, HelpCircle, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const CATALOGS = [
  {
    title: '2026 Fall & Winter Catalog',
    url: 'https://www.zoomcats.com/catalog/2026-hc-apparel-fallwinter-catalog',
  },
];

const upsertMeta = (name, content) => {
  let element = document.head.querySelector(`meta[name="${name}"]`);
  const created = !element;
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('name', name);
    document.head.appendChild(element);
  }
  const previous = element.getAttribute('content');
  element.setAttribute('content', content);
  return () => {
    if (created) element.remove();
    else if (previous === null) element.removeAttribute('content');
    else element.setAttribute('content', previous);
  };
};

export default function Catalogs() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Explore Our Catalogs | HC Apparel';
    const restoreRobots = upsertMeta('robots', 'noindex, nofollow');
    const restoreDescription = upsertMeta(
      'description',
      'Browse an HC Apparel product catalog and ask us about availability and ordering.'
    );
    return () => {
      document.title = previousTitle;
      restoreRobots();
      restoreDescription();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#faf7ef] text-[#1b2b20]">
      <header className="border-b border-[#c9a94f]/35 bg-[#25431f] text-[#fffaf0]">
        <div className="container mx-auto max-w-6xl px-4 py-10 sm:py-14">
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-[#e4bd55]">HC Apparel</p>
          <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">Explore Our Catalogs</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#fffaf0]/85 sm:text-lg">
            Discover more styles for your next project. Send us the catalog name, item number, color, sizes, and quantities you’re interested in, and we’ll help with availability and ordering.
          </p>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl space-y-8 px-4 py-8 sm:py-12">
        <aside className="flex items-start gap-3 rounded-2xl border border-[#c9a94f]/45 bg-[#f3ead5] p-4 text-sm leading-6 text-[#3c4b37] sm:p-5">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#4d6b2b]" />
          <p>
            Catalog items are product references. Availability, pricing, and ordering are confirmed after you contact HC Apparel; browsing a catalog does not reserve an item or place an order.
          </p>
        </aside>

        {CATALOGS.map((catalog) => {
          const inquiryUrl = `/Contact?mode=catalog-product&catalog=${encodeURIComponent(catalog.title)}`;
          return (
            <section key={catalog.url} className="overflow-hidden rounded-3xl border border-[#d9c79b] bg-[#fffdf7] shadow-[0_18px_50px_rgba(37,67,31,0.10)]">
              <div className="flex flex-col gap-4 border-b border-[#d9c79b] bg-[#f3ead5] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8b6a18]">Product catalog</p>
                  <h2 className="mt-1 font-serif text-2xl font-bold text-[#25431f] sm:text-3xl">{catalog.title}</h2>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button asChild variant="outline" className="min-h-11 border-[#4d6b2b] bg-[#fffdf7] text-[#25431f] hover:bg-[#eef1e5]">
                    <a href={catalog.url} target="_blank" rel="noopener noreferrer">
                      Open Catalog in a New Tab <ExternalLink aria-hidden="true" className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                  <Button asChild className="min-h-11 bg-[#4d6b2b] text-white hover:bg-[#3f5924]">
                    <Link to={inquiryUrl}>
                      Ask About a Product <HelpCircle aria-hidden="true" className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="p-2 sm:p-4">
                <iframe
                  src={catalog.url}
                  title={`${catalog.title} interactive catalog`}
                  className="block h-[72vh] min-h-[560px] w-full rounded-2xl border-0 bg-white sm:h-[780px]"
                  frameBorder="0"
                  marginHeight="0"
                  marginWidth="0"
                  scrolling="auto"
                  loading="lazy"
                />
              </div>
            </section>
          );
        })}

        <section className="rounded-2xl bg-[#25431f] p-6 text-[#fffaf0] sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-8">
          <div>
            <h2 className="font-serif text-2xl font-bold">Found something you like?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#fffaf0]/80 sm:text-base">
              Share the catalog name, item number, color, sizes, and quantities. We’ll confirm availability and next steps. Formal quotes remain available for orders of 50 or more items.
            </p>
          </div>
          <Button asChild className="mt-5 min-h-12 w-full bg-[#e4bd55] font-bold text-[#1b2b20] hover:bg-[#efca68] sm:mt-0 sm:w-auto">
            <Link to="/Contact?mode=catalog-product&catalog=2026%20Fall%20%26%20Winter%20Catalog">Ask About a Product</Link>
          </Button>
        </section>
      </main>
    </div>
  );
}
