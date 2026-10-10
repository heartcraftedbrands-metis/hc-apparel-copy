begin;

-- Existing promotions may retain copy created before supplier branding was
-- removed from the customer experience. Operational source fields stay intact.
alter table public.homepage_specials disable trigger validate_homepage_special_before_write;

update public.homepage_specials
set subtitle = 'Available at a special price while supplies last.',
    updated_at = now()
where subtitle is null
   or subtitle ~* '(s\s*&\s*s|s&amp;s|zerotouch|sale style available through hc apparel)';

update public.homepage_specials
set badge_label = 'Current Pick',
    updated_at = now()
where badge_label ~* '(s\s*&\s*s|s&amp;s|zerotouch)';

alter table public.homepage_specials enable trigger validate_homepage_special_before_write;

commit;
