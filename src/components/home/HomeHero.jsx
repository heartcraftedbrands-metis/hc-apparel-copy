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

const CARD_STAGGER = ['lg:translate-y-10', 'lg:-translate-y-2', 'lg:translate-y-6'];

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
    <section className="relative isolate min-h-[760px] w-full max-w-full overflow-hidden bg-primary text-primary-foreground lg:min-h-[720px] xl:min-h-[780px]">
      <img
        src="/images/home-hero/champion-cropped-hoodie-hero.jpg"
        alt=""
        width={722}
        height={376}
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-[54%_top] lg:object-[50%_center]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(48,61,31,0.9)_0%,rgba(48,61,31,0.72)_48%,rgba(27,37,17,0.94)_100%)] lg:bg-[linear-gradient(90deg,rgba(41,55,25,0.97)_0%,rgba(55,72,34,0.86)_38%,rgba(48,63,29,0.36)_68%,rgba(29,40,18,0.74)_100%)]" />
      <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_78%_18%,rgba(232,169,16,0.6),transparent_27%),repeating-linear-gradient(115deg,rgba(255,255,255,0.08)_0,rgba(255,255,255,0.08)_1px,transparent_1px,transparent_18px)]" />

      <div className="relative z-10 mx-auto grid min-h-[760px] w-full max-w-[1600px] grid-cols-1 gap-9 px-5 pb-12 pt-12 sm:px-8 sm:pt-16 lg:min-h-[720px] lg:grid-cols-[minmax(0,0.86fr)_minmax(590px,1.14fr)] lg:items-center lg:gap-4 lg:px-10 lg:py-16 xl:min-h-[780px] xl:grid-cols-[minmax(0,0.9fr)_minmax(650px,1.1fr)] xl:px-16 2xl:px-20">
        <div className="relative min-w-0 lg:pb-8">
          <div className="mb-7 flex items-center gap-3">
            <span className="h-px w-10 bg-accent" />
            <p className="text-xs font-extrabold uppercase tracking-[0.28em] text-[#f7d779] sm:text-sm">
              HeartCrafted Apparel
            </p>
          </div>

          <h1 className="max-w-[10ch] text-[clamp(4rem,15vw,6rem)] font-black uppercase leading-[0.78] tracking-[-0.075em] text-[#fffdf5] drop-shadow-[0_8px_28px_rgba(17,25,10,0.35)] lg:text-[clamp(5.1rem,7.2vw,8rem)]">
            HC Apparel
          </h1>
          <p className="mt-7 max-w-xl text-2xl font-bold leading-tight text-[#f8e9c8] sm:text-3xl lg:text-[2rem] xl:text-[2.2rem]">
            HeartCrafted for Champions. Inspired by Love.
          </p>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
            From everyday essentials to team-ready apparel, find your next favorite look—made for creators, champions, and the communities they love.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild size="lg" className="min-h-12 w-full gap-2 bg-accent px-7 text-base font-extrabold text-accent-foreground shadow-[0_12px_30px_rgba(0,0,0,0.22)] hover:bg-[#f0ba31] sm:w-auto">
              <Link to="/ShopGarments">
                Shop Apparel <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="min-h-12 w-full border-white/55 bg-[#233315]/40 px-7 text-base font-bold text-white backdrop-blur-sm hover:bg-white/15 hover:text-white sm:w-auto">
              <Link to="/brand/champion">Explore Champion</Link>
            </Button>
          </div>

          <p className="mt-5 max-w-md text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
            Brand-name apparel curated and sold by HC Apparel
          </p>
        </div>

        <div className="min-w-0 lg:pl-4 xl:pl-8">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#f7d779]">The team edit</p>
              <p className="mt-1 text-sm text-white/70">Style inspiration · shop undecorated apparel</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={showPrevious}
                disabled={activeIndex === 0}
                aria-label="Show previous apparel story"
                className="grid h-11 w-11 place-items-center rounded-full border border-white/35 bg-[#253516]/65 text-white shadow-lg backdrop-blur-md transition hover:border-accent hover:bg-[#344820] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={showNext}
                disabled={activeIndex === maxIndex}
                aria-label="Show next apparel story"
                className="grid h-11 w-11 place-items-center rounded-full border border-white/35 bg-[#253516]/65 text-white shadow-lg backdrop-blur-md transition hover:border-accent hover:bg-[#344820] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-35"
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
            className="hc-hero-carousel relative overflow-hidden py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-primary"
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
                      className="hc-hero-card group relative block h-full overflow-hidden rounded-[1.75rem] border border-white/35 bg-[#eee5d2] shadow-[0_28px_55px_rgba(15,24,8,0.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <img
                        src={card.image}
                        alt={card.alt}
                        loading={index < 3 ? 'eager' : 'lazy'}
                        decoding="async"
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.035]"
                        style={{ objectPosition: card.position }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#15200d]/95 via-[#1e2d13]/15 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-5">
                        <span className="inline-flex rounded-full border border-white/25 bg-black/20 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/80 backdrop-blur-sm">
                          Editorial inspiration
                        </span>
                        <h2 className="mt-3 text-2xl font-black leading-[0.95] text-white drop-shadow-md">{card.label}</h2>
                        <p className="mt-2 text-xs font-semibold leading-snug text-white/75">{card.detail}</p>
                        <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.08em] text-[#f7d779]">
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

          <div className="mt-4 flex items-center justify-center gap-2" aria-hidden="true">
            {Array.from({ length: maxIndex + 1 }, (_, index) => (
              <span key={index} className={`h-1.5 rounded-full transition-all ${index === activeIndex ? 'w-8 bg-accent' : 'w-2 bg-white/35'}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 h-1.5 bg-gradient-to-r from-transparent via-accent to-transparent" />
    </section>
  );
}
