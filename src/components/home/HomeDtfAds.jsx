import React from 'react';
import { Link } from 'react-router-dom';

const DTF_ADS = [
  {
    title: 'Make Game Day Spooktacular',
    image: '/images/home-dtf-ads/game-day-spooktacular.jpg',
    alt: 'Make Game Day Spooktacular DTF print ad featuring football ghosts, pumpkins, bats, and fall leaves',
  },
  {
    title: 'Bring the Team Spirit—And the Spooky',
    image: '/images/home-dtf-ads/team-spirit-spooky.jpg',
    alt: 'Bring the Team Spirit and the Spooky DTF print ad featuring soccer ghosts, bats, and pumpkins',
  },
  {
    title: 'Turn Your Boo Crew Into a Craft Crew',
    image: '/images/home-dtf-ads/boo-crew-craft-crew.jpg',
    alt: 'Turn Your Boo Crew Into a Craft Crew DTF print ad featuring reading ghosts, pumpkins, and craft supplies',
  },
];

export default function HomeDtfAds() {
  return (
    <section
      id="dtf-print-inspiration"
      aria-labelledby="dtf-print-inspiration-title"
      className="border-y border-[#ddc98f]/70 bg-[#f7f2e6]"
    >
      <h2 id="dtf-print-inspiration-title" className="sr-only">
        DTF Prints inspiration
      </h2>

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-5 lg:gap-7">
          {DTF_ADS.map(ad => (
            <Link
              key={ad.title}
              to="/DTFTransfers"
              aria-label={`${ad.title}. Shop DTF Prints`}
              className="group block min-w-0 overflow-hidden rounded-2xl border border-[#d8c58d] bg-[#fffdf7] shadow-[0_12px_28px_-18px_rgba(31,55,22,0.55)] motion-safe:transition motion-safe:duration-300 motion-safe:ease-out motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-[0_18px_34px_-16px_rgba(31,55,22,0.5)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#d9ad38] focus-visible:ring-offset-4 focus-visible:ring-offset-[#f7f2e6] motion-reduce:transition-none"
            >
              <img
                src={ad.image}
                alt={ad.alt}
                width={1254}
                height={1254}
                loading="lazy"
                decoding="async"
                className="block aspect-square h-auto w-full object-contain"
              />
              <span className="flex min-h-14 items-center justify-between gap-3 border-t border-[#e5d8b4] bg-[#fffaf0] px-5 py-4 text-sm font-extrabold text-[#28451c] sm:text-base">
                <span>Shop DTF Prints</span>
                <span aria-hidden="true" className="text-lg text-[#b48317] motion-safe:transition-transform motion-safe:duration-300 group-hover:translate-x-1 motion-reduce:transition-none">
                  →
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
