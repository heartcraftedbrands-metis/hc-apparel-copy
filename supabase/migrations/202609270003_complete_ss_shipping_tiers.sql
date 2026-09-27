-- Complete the verified S&S fallback schedule using observed account freight.
-- 13+ garments: $16.50, based on a $13.45 lowest observed 14-item quote
-- and the highest observed lowest-cost quote of $16.16.
update public.checkout_financial_settings
set
  ss_shipping_enabled = true,
  ss_free_freight_threshold = 200.00,
  ss_tier_1_2 = 13.50,
  ss_tier_3_5 = 16.50,
  ss_tier_6_12 = 16.50,
  ss_tier_13_plus = 16.50,
  ss_shipping_buffer = 0.00,
  ss_admin_note = 'Verified S&S fallback tiers based on observed account checkout freight: 1-2 $13.50; 3-5 $16.50; 6-12 $16.50; 13+ $16.50. Free freight still requires confirmed SKU eligibility.'
where id = 'default';