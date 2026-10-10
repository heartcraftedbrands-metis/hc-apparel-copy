import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

const HERO_CARDS = [
  {
    label: 'Together in Love',
    image: '/images/home-hero/womens-red-team-apparel.jpg',
    alt: 'Women wearing coordinated red team apparel',
    href: '/brand/adidas',
    cta: 'Explore adidas blanks',
    position: 'center center',
  },
  {
    label: 'Heart of a Champion',
    image: '/images/home-hero/navy-volleyball-apparel.jpg',
    alt: 'Women in navy volleyball apparel near a net',
    href: '/ShopGarments?type=sportswear',
    cta: 'Shop sportswear blanks',
    position: 'center center',
  },
  {
    label: 'Built for the Team',
    image: '/images/home-hero/mens-white-soccer-apparel.jpg',
    alt: 'Soccer players wearing white performance apparel',
    href: '/brand/adidas',
    cta: 'Explore adidas blanks',
    position: 'center center',
  },
  {
    label: 'Move with Purpose',
    image: '/images/home-hero/burgundy-training-apparel.jpg',
    alt: 'Men training in coordinated burgundy apparel',
    href: '/ShopGarments?type=sportswear',
    cta: 'Shop sportswear blanks',
    position: 'center center',
  },
  {
    label: 'Carry Your Passion',
    image: '/images/home-hero/womens-travel-gear.jpg',
    alt: 'Woman carrying red team travel gear',
    href: '/brand/adidas',
    cta: 'Explore adidas blanks',
    position: '22% center',
  },
  {
    label: 'Ready for What’s Next',
    image: '/images/home-hero/mens-blue-travel-gear.jpg',
    alt: 'Men wearing blue team travel apparel',
    href: '/brand/adidas',
    cta: 'Explore adidas blanks',
    position: 'center center',
  },
];

function getVisibleCount() {
  if (window.matchMedia('(min-width: 1024px)').matches) return 3;
  if (window.matchMedia('(min-width: 768px)').matches) return 2;
  return 1;
}

export default function HomeHero() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(1);
  const touchStartX = useRef(null);
  const maxIndex = Math.max(HERO_CARDS.length - visibleCount, 0);

  useEffect(() => {
    const sync = () => setVisibleCount(getVisibleCount());
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  useEffect(() => {
    setActiveIndex(current => Math.min(current, maxIndex));
  }, [maxIndex]);

  const showPrevious = () => setActiveIndex(current => Math.max(0, current - 1));
  const showNext = () => setActiveIndex(current => Math.min(maxIndex, current + 1));

  const handleKeyDown = event => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      showPrevious();
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      showNext();
    }
  };

  const handleTouchEnd = event => {
    if (touchStartX.current === null) return;
    const distance = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) < 48) return;
    if (distance < 0) showNext();
    else showPrevious();
  };

  const storyStatus = visibleCount === 1
    ? `Showing story ${activeIndex + 1} of ${HERO_CARDS.length}`
    : `Showing stories ${activeIndex + 1} through ${Math.min(activeIndex + visibleCount, HERO_CARDS.length)} of ${HERO_CARDS.length}`;

  return (
    <section className="hc-immersive-hero relative isolate w-full max-w-full overflow-hidden bg-[#1d2d14] text-[#fffdf5]" aria-label="HC Apparel introduction and apparel inspiration">
      <img
        src="/images/home-hero/champion-cropped-hoodie-hero.jpg"
        alt=""
        aria-hidden="true"
        width={722}
        height={398}
        loading="eager"
        decoding="async"
        className="hc-immersive-background pointer-events-none absolute inset-x-0 top-0 h-[235px] w-full object-cover object-[50%_center] md:inset-0 md:h-full md:object-cover md:object-center"
      />
      <div className="hc-immersive-overlay pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(232,169,16,0.13),transparent_28%)]" />

      <div className="relative mx-auto w-full max-w-[1600px] md:min-h-[620px] lg:min-h-[650px] xl:min-h-[680px]">
        <div className="relative z-20 px-5 pb-0 pt-[178px] sm:px-8 sm:pt-[190px] md:flex md:min-h-[620px] md:w-[48%] md:flex-col md:justify-center md:px-9 md:py-20 lg:min-h-[650px] lg:w-[46%] lg:px-12 xl:min-h-[680px] xl:px-16">
          <div className="mb-3 flex items-center gap-3 md:mb-5">
            <span className="h-px w-8 bg-accent md:w-10" />
            <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-[#f7d779] md:text-xs">
              HeartCrafted Apparel
            </p>
          </div>

          <h1 className="max-w-[9ch] text-[3.35rem] font-black uppercase leading-[0.82] tracking-[-0.07em] text-[#fffdf5] drop-shadow-[0_8px_30px_rgba(10,18,7,0.5)] sm:text-[4rem] md:text-[4.75rem] lg:max-w-none lg:whitespace-nowrap lg:text-[clamp(4.5rem,6.1vw,6.5rem)]">
            HC Apparel
          </h1>
          <p className="mt-4 max-w-lg text-[1.35rem] font-bold leading-[1.08] text-[#f8e9c8] sm:text-2xl md:mt-6 md:text-[1.75rem] lg:text-[2rem]">
            HeartCrafted for Champions. Inspired by Love.
          </p>
          <p className="mt-3 max-w-lg text-sm leading-5 text-white/82 sm:text-[0.95rem] md:mt-4 md:text-base md:leading-7">
            Everyday essentials and team-ready apparel for creators, champions, and the communities they love.
          </p>

          <div className="mt-5 grid max-w-md grid-cols-2 gap-2.5 sm:flex sm:flex-wrap md:mt-7 md:gap-3">
            <Button asChild size="lg" className="min-h-11 min-w-0 gap-1.5 bg-accent px-3 text-sm font-extrabold text-accent-foreground shadow-[0_12px_30px_rgba(0,0,0,0.25)] hover:bg-[#f0ba31] sm:px-7 sm:text-base md:min-h-12">
              <Link to="/ShopGarments">
                Shop Apparel <ArrowRight className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="min-h-11 min-w-0 border-white/50 bg-[#17240f]/35 px-3 text-sm font-bold text-white backdrop-blur-sm hover:bg-white/12 hover:text-white sm:px-7 sm:text-base md:min-h-12">
              <Link to="/brand/champion">Explore Champion</Link>
            </Button>
          </div>

          <p className="mt-3 max-w-md text-[9px] font-medium leading-4 text-white/58 sm:text-[10px] md:mt-4">
            Brand-name apparel is curated and sold by HC Apparel; third-party brands manufacture their garments.
          </p>
        </div>

        <div
          role="region"
          aria-label="Apparel inspiration carousel"
          aria-roledescription="carousel"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onTouchStart={event => { touchStartX.current = event.touches[0].clientX; }}
          onTouchEnd={handleTouchEnd}
          className="hc-immersive-carousel relative z-30 mx-5 mt-5 overflow-hidden pb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:mx-8 md:absolute md:inset-y-[12%] md:left-[46%] md:right-[-7%] md:mx-0 md:mt-0 md:pb-0 lg:inset-y-[13%] lg:left-[51%] lg:right-[-6%]"
        >
          <div className="hc-immersive-track" data-slide={activeIndex}>
            {HERO_CARDS.map((card, index) => {
              const isVisible = index >= activeIndex && index < activeIndex + visibleCount;
              return (
                <div key={card.label} className="hc-immersive-card-shell" aria-hidden={!isVisible}>
                  <Link
                    to={card.href}
                    tabIndex={isVisible ? 0 : -1}
                    aria-label={`${card.label}: ${card.cta}`}
                    className="hc-immersive-card group flex h-full flex-col gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="block truncate text-[10px] font-extrabold tracking-[0.01em] text-[#fff7dc] drop-shadow-md sm:text-[11px] md:text-xs lg:text-sm">
                      {card.label}
                    </span>
                    <span className="hc-immersive-card-visual relative block min-h-0 flex-1 overflow-hidden rounded-[0.85rem] border border-white/35 bg-[#314124] shadow-[0_24px_52px_-22px_rgba(8,15,5,0.9)]">
                      <img
                        src={card.image}
                        alt={card.alt}
                        loading={index < 4 ? 'eager' : 'lazy'}
                        decoding="async"
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.025]"
                        style={{ objectPosition: card.position }}
                      />
                      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#17220f]/28 via-transparent to-white/5" />
                    </span>
                  </Link>
                </div>
              );
            })}
          </div>

          <p className="sr-only" aria-live="polite">{storyStatus}</p>
        </div>

        <div className="hc-immersive-controls relative z-30 mx-5 mb-[calc(1rem+env(safe-area-inset-bottom))] mt-4 flex items-center justify-center gap-3 pb-1 sm:mx-8 md:absolute md:bottom-7 md:left-[52%] md:mx-0 md:mb-0 md:mt-0 md:pb-0 lg:left-[57%]">
          <button
            type="button"
            onClick={showPrevious}
            disabled={activeIndex === 0}
            aria-label="Show previous apparel story"
            className="grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-[#f7f0de]/18 text-white shadow-lg backdrop-blur-md transition hover:border-accent hover:bg-[#f7f0de]/28 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-1.5" aria-hidden="true">
            {Array.from({ length: maxIndex + 1 }, (_, index) => (
              <span key={index} className={`h-1.5 rounded-full transition-all ${index === activeIndex ? 'w-7 bg-accent' : 'w-1.5 bg-white/35'}`} />
            ))}
          </div>

          <button
            type="button"
            onClick={showNext}
            disabled={activeIndex === maxIndex}
            aria-label="Show next apparel story"
            className="grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-[#f7f0de]/18 text-white shadow-lg backdrop-blur-md transition hover:border-accent hover:bg-[#f7f0de]/28 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
