import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

const HERO_CARDS = [
  {
    label: 'Together in Love',
    detail: 'Women’s team apparel inspiration',
    image: '/images/home-hero/womens-red-team-apparel.jpg',
    alt: 'Women wearing coordinated red team apparel',
    href: '/brand/adidas',
    cta: 'Explore adidas blanks',
    position: 'center center',
  },
  {
    label: 'Heart of a Champion',
    detail: 'Volleyball-ready layers and uniforms',
    image: '/images/home-hero/navy-volleyball-apparel.jpg',
    alt: 'Women in navy volleyball apparel near a net',
    href: '/ShopGarments?type=sportswear',
    cta: 'Shop sportswear blanks',
    position: 'center center',
  },
  {
    label: 'Built for the Team',
    detail: 'Performance looks for every roster',
    image: '/images/home-hero/mens-white-soccer-apparel.jpg',
    alt: 'Soccer players wearing white performance apparel',
    href: '/brand/adidas',
    cta: 'Explore adidas blanks',
    position: 'center center',
  },
  {
    label: 'Move with Purpose',
    detail: 'Training layers for active days',
    image: '/images/home-hero/burgundy-training-apparel.jpg',
    alt: 'Men training in coordinated burgundy apparel',
    href: '/ShopGarments?type=sportswear',
    cta: 'Shop sportswear blanks',
    position: 'center center',
  },
  {
    label: 'Carry Your Passion',
    detail: 'Travel-ready apparel and bags',
    image: '/images/home-hero/womens-travel-gear.jpg',
    alt: 'Woman carrying red team travel gear',
    href: '/brand/adidas',
    cta: 'Explore adidas blanks',
    position: '22% center',
  },
  {
    label: 'Ready for What’s Next',
    detail: 'Team travel essentials in blue',
    image: '/images/home-hero/mens-blue-travel-gear.jpg',
    alt: 'Men wearing blue team travel apparel',
    href: '/brand/adidas',
    cta: 'Explore adidas blanks',
    position: 'center center',
  },
];

const CARD_STAGGER = ['lg:translate-y-5', 'lg:-translate-y-2', 'lg:translate-y-3'];

export default function HomeHero() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const touchStartX = useRef(null);
  const visibleCount = isDesktop ? 3 : 1;
  const maxIndex = Math.max(HERO_CARDS.length - visibleCount, 0);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
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

  return (
    <section className="w-full max-w-full overflow-hidden" aria-label="HC Apparel introduction and team edit">
      <div className="relative isolate overflow-hidden bg-[#263518] text-[#fffdf5]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_18%,rgba(232,169,16,0.20),transparent_30%),linear-gradient(120deg,rgba(255,255,255,0.045),transparent_42%)]" />
        <div className="relative mx-auto grid w-full max-w-[1500px] grid-cols-1 md:min-h-[600px] md:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)] md:items-stretch lg:min-h-[620px] lg:grid-cols-[minmax(0,0.9fr)_minmax(390px,0.62fr)]">
          <div className="min-w-0 px-5 pb-8 pt-8 sm:px-8 sm:pb-10 sm:pt-11 md:flex md:flex-col md:justify-center md:px-8 md:py-12 lg:px-12 lg:py-16 xl:px-16">
            <div className="mb-4 flex items-center gap-3 sm:mb-5">
              <span className="h-px w-9 bg-accent" />
              <p className="text-[11px] font-extrabold uppercase tracking-[0.25em] text-[#f7d779] sm:text-xs">
                HeartCrafted Apparel
              </p>
            </div>

            <h1 className="max-w-[10ch] text-[clamp(3.35rem,14vw,5rem)] font-black uppercase leading-[0.8] tracking-[-0.07em] text-[#fffdf5] drop-shadow-[0_8px_28px_rgba(17,25,10,0.28)] md:text-[4.35rem] lg:text-[clamp(5rem,7vw,7.4rem)]">
              HC Apparel
            </h1>
            <p className="mt-5 max-w-xl text-[1.4rem] font-bold leading-[1.08] text-[#f8e9c8] sm:text-3xl lg:mt-7 lg:text-[2rem] xl:text-[2.2rem]">
              HeartCrafted for Champions. Inspired by Love.
            </p>
            <p className="mt-4 max-w-xl text-[0.93rem] leading-6 text-white/78 sm:text-base lg:mt-5 lg:text-lg lg:leading-relaxed">
              <span className="lg:hidden">Everyday essentials and team-ready apparel for creators, champions, and the communities they love.</span>
              <span className="hidden lg:inline">From everyday essentials to team-ready apparel, find your next favorite look—made for creators, champions, and the communities they love.</span>
            </p>

            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap lg:mt-8 lg:gap-3">
              <Button asChild size="lg" className="min-h-12 min-w-0 gap-1.5 bg-accent px-3 text-sm font-extrabold text-accent-foreground shadow-[0_12px_30px_rgba(0,0,0,0.22)] hover:bg-[#f0ba31] sm:px-7 sm:text-base">
                <Link to="/ShopGarments">
                  Shop Apparel <ArrowRight className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="min-h-12 min-w-0 border-white/50 bg-white/5 px-3 text-sm font-bold text-white hover:bg-white/12 hover:text-white sm:px-7 sm:text-base">
                <Link to="/brand/champion">Explore Champion</Link>
              </Button>
            </div>

            <p className="mt-4 max-w-md text-[10px] font-medium leading-4 text-white/55 sm:text-[11px]">
              Brand-name apparel is curated and sold by HC Apparel; third-party brands manufacture their garments.
            </p>
          </div>

          <div className="relative min-h-[255px] overflow-hidden border-t border-white/10 bg-[#eee8db] sm:min-h-[340px] md:min-h-0 md:border-l md:border-t-0">
            <div className="absolute inset-x-0 top-0 z-10 h-14 bg-gradient-to-b from-[#263518]/16 to-transparent lg:hidden" />
            <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[#e8a910]/22 blur-3xl" />
            <img
              src="/images/home-hero/champion-rw01w-white.jpg"
              alt="Woman wearing a white Champion cropped hoodie"
              width={500}
              height={625}
              loading="eager"
              decoding="async"
              className="absolute inset-0 h-full w-full object-contain object-center lg:object-bottom"
            />
            <div className="absolute bottom-4 left-4 rounded-full border border-[#263518]/15 bg-[#fffdf5]/88 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#263518] shadow-sm backdrop-blur-sm sm:bottom-5 sm:left-5">
              Champion · White crop hoodie
            </div>
          </div>
        </div>
      </div>

      <div className="relative border-y border-[#263518]/12 bg-[#f4efe4] py-8 text-[#263518] sm:py-10 lg:py-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(232,169,16,0.14),transparent_28%)]" />
        <div className="relative mx-auto w-full max-w-[1500px] px-4 sm:px-8 lg:px-10 xl:px-16">
          <div className="mb-4 flex items-end justify-between gap-4 sm:mb-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#8a6500] sm:text-xs">The team edit</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.035em] sm:text-3xl">Ideas made to move</h2>
              <p className="mt-1 text-xs text-[#4f5d45] sm:text-sm">Editorial inspiration · shop undecorated apparel</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={showPrevious}
                disabled={activeIndex === 0}
                aria-label="Show previous apparel story"
                className="grid h-10 w-10 place-items-center rounded-full border border-[#263518]/25 bg-white/75 text-[#263518] shadow-sm transition hover:border-accent hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-35 sm:h-11 sm:w-11"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={showNext}
                disabled={activeIndex === maxIndex}
                aria-label="Show next apparel story"
                className="grid h-10 w-10 place-items-center rounded-full border border-[#263518]/25 bg-white/75 text-[#263518] shadow-sm transition hover:border-accent hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-35 sm:h-11 sm:w-11"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div
            role="region"
            aria-label="Apparel inspiration carousel"
            aria-roledescription="carousel"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onTouchStart={event => { touchStartX.current = event.touches[0].clientX; }}
            onTouchEnd={handleTouchEnd}
            className="hc-hero-carousel relative overflow-hidden py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-[#f4efe4] sm:py-3"
          >
            <div className="hc-hero-track" data-slide={activeIndex}>
              {HERO_CARDS.map((card, index) => {
                const isVisible = index >= activeIndex && index < activeIndex + visibleCount;
                return (
                  <div key={card.label} className={`hc-hero-card-shell ${CARD_STAGGER[index % CARD_STAGGER.length]}`} aria-hidden={!isVisible}>
                    <Link
                      to={card.href}
                      tabIndex={isVisible ? 0 : -1}
                      aria-label={`${card.label}: ${card.cta}`}
                      className="hc-hero-card group relative block h-full overflow-hidden rounded-[1.35rem] border border-white/70 bg-[#eee5d2] shadow-[0_20px_42px_-22px_rgba(15,24,8,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:rounded-[1.6rem]"
                    >
                      <img
                        src={card.image}
                        alt={card.alt}
                        loading={index < 3 ? 'eager' : 'lazy'}
                        decoding="async"
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.035]"
                        style={{ objectPosition: card.position }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#15200d]/95 via-[#1e2d13]/10 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                        <span className="inline-flex rounded-full border border-white/25 bg-black/20 px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.16em] text-white/80 backdrop-blur-sm sm:text-[9px]">
                          Editorial inspiration
                        </span>
                        <h3 className="mt-2.5 text-xl font-black leading-[0.98] text-white drop-shadow-md sm:mt-3 sm:text-2xl">{card.label}</h3>
                        <p className="mt-1.5 text-[11px] font-semibold leading-snug text-white/75 sm:mt-2 sm:text-xs">{card.detail}</p>
                        <span className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#f7d779] sm:mt-4 sm:text-xs">
                          {card.cta} <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>

            <p className="sr-only" aria-live="polite">
              Showing {isDesktop ? `stories ${activeIndex + 1} through ${Math.min(activeIndex + 3, HERO_CARDS.length)}` : `story ${activeIndex + 1}`} of {HERO_CARDS.length}
            </p>
          </div>

          <div className="mt-3 flex items-center justify-center gap-2" aria-hidden="true">
            {Array.from({ length: maxIndex + 1 }, (_, index) => (
              <span key={index} className={`h-1.5 rounded-full transition-all ${index === activeIndex ? 'w-8 bg-[#9d7200]' : 'w-2 bg-[#263518]/25'}`} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
