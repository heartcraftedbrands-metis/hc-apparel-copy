import React from 'react';
import HomeHero from '../components/home/HomeHero';
import HomeFeaturedCategories from '../components/home/HomeFeaturedCategories';
import HomeFeaturedBrands from '../components/home/HomeFeaturedBrands';
import HomeHowItWorks from '../components/home/HomeHowItWorks';
import HomeWhyUs from '../components/home/HomeWhyUs';
import HomeQuoteRequest from '../components/home/HomeQuoteRequest';
import ReviewsSection from '../components/home/ReviewsSection';

export default function Home() {
  return (
    <div className="bg-background">
      <HomeHero />
      <HomeFeaturedCategories />
      <HomeFeaturedBrands />
      <HomeHowItWorks />
      <HomeWhyUs />
      <ReviewsSection />
      <HomeQuoteRequest />
    </div>
  );
}
