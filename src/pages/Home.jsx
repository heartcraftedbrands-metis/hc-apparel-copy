import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { base44 } from '@/api/base44Client';
import HomeHero from '../components/home/HomeHero';
import HomeFeaturedCategories from '../components/home/HomeFeaturedCategories';
import HomeFeaturedBrands from '../components/home/HomeFeaturedBrands';
import HomeHowItWorks from '../components/home/HomeHowItWorks';
import HomeWhyUs from '../components/home/HomeWhyUs';
import HomeQuoteRequest from '../components/home/HomeQuoteRequest';
import ReviewsSection from '../components/home/ReviewsSection';
import { filterPublicProducts } from '@/lib/productVisibility';

export default function Home() {
  const { data: products = [] } = useQuery({
    queryKey: ['home-editorial-products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, '-created_date'),
  });
  const publicProducts = useMemo(() => filterPublicProducts(products), [products]);

  return (
    <div className="max-w-full overflow-x-clip bg-background">
      <HomeHero products={publicProducts} />
      <HomeFeaturedCategories products={publicProducts} />
      <HomeFeaturedBrands products={publicProducts} />
      <HomeHowItWorks />
      <HomeWhyUs />
      <ReviewsSection />
      <HomeQuoteRequest />
    </div>
  );
}
