insert into public.brand_pages (slug, name, tagline, description, categories, is_active, sort_order) values
('dri-duck', 'DRI DUCK', 'Built for work, weather, and everyday wear.', 'Outdoor-ready blanks, jackets, fleece, headwear, and workwear options for teams, brands, and businesses.', array['fleece','outerwear','hats','womens'], true, 1),
('comfort-colors', 'Comfort Colors', 'Garment-dyed blanks with a soft, lived-in feel.', 'Tees, long sleeves, sweatshirts, and casual blanks for brands, creators, events, and everyday apparel.', array['t_shirts','long_sleeve','crewnecks','hoodies','tank_tops','kids'], true, 2),
('gildan', 'Gildan', 'Everyday blanks for every kind of project.', 'Reliable tees, fleece, and more for brands, teams, events, and bulk orders.', array['t_shirts','hoodies','fleece','crewnecks'], true, 3),
('shaka-wear', 'Shaka Wear', 'Streetwear-ready blank essentials.', 'Structured tees and versatile blanks for creators, brands, and teams.', array['t_shirts','long_sleeve','hoodies'], true, 4),
('champion', 'Champion', 'Sport-rooted apparel blanks.', 'Shop fleece, tees, and activewear-ready pieces for teams and brands.', array['t_shirts','hoodies','fleece','sportswear'], true, 5),
('columbia', 'Columbia', 'Ready for colder days and outdoor work.', 'Explore fleece, outerwear, and everyday gear for teams and businesses.', array['outerwear','fleece','sportswear'], true, 6),
('bella-canvas', 'Bella + Canvas', 'Versatile blanks for creative projects.', 'Shop tees and other apparel blanks for brands, creators, and events.', array['t_shirts','tank_tops','womens'], true, 7),
('next-level', 'Next Level', 'Modern blanks for your next idea.', 'Explore tees and everyday apparel for teams, businesses, and creators.', array['t_shirts','tank_tops','womens'], true, 8),
('hanes', 'Hanes', 'Dependable everyday apparel blanks.', 'Find approachable tees, fleece, and basics for groups and bulk orders.', array['t_shirts','hoodies','fleece','kids'], true, 9),
('rabbit-skins', 'Rabbit Skins', 'Little sizes for big ideas.', 'Explore youth and family-friendly apparel blanks for schools, events, creators, and teams.', array['kids','t_shirts','hoodies'], true, 10),
('port-company', 'Port & Company', 'Practical blanks for groups and teams.', 'Browse apparel options for uniforms, events, schools, and businesses.', array['t_shirts','hoodies','polos','hats'], true, 10),
('independent-trading-co', 'Independent Trading Co.', 'Fleece and layers made for the everyday.', 'Shop hoodie, sweatshirt, and outerwear blanks for brands and teams.', array['hoodies','fleece','crewnecks','outerwear'], true, 11),
('adidas', 'adidas', 'Sport-minded apparel for active teams.', 'Explore activewear and versatile apparel blanks for groups and organizations.', array['sportswear','polos','outerwear'], true, 12),
('oakley', 'Oakley', 'Performance-inspired everyday gear.', 'Shop apparel and accessories for active teams and businesses.', array['sportswear','polos','hats','bags'], true, 13)
on conflict (slug) do nothing;
