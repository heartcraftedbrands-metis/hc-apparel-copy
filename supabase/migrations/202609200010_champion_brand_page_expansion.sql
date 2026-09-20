-- Champion catalog presentation only. Product publication remains a separate,
-- explicit admin approval action.
update public.brand_pages
set tagline = 'Champion blanks for teams, businesses, organizations, and everyday wear.',
    description = 'Explore sports, teamwear, staff apparel, corporate-casual layers, and premium everyday Champion blanks through HC Apparel.',
    categories = array[
      'sportswear', 'business_apparel', 'polos', 'quarter_zips', 'outerwear',
      'hoodies', 'crewnecks', 'womens', 'mens'
    ],
    logo_url = coalesce(logo_url, '/brands/champion.jpg'),
    updated_at = now()
where slug = 'champion';
