import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const [page,migration,baselineMigration,tracker,cart,checkout,app,dashboard,layout]=await Promise.all([
 readFile(new URL('../src/pages/AdminMarketingCenter.jsx',import.meta.url),'utf8'),readFile(new URL('../supabase/migrations/202609280001_build_organic_marketing_center.sql',import.meta.url),'utf8'),readFile(new URL('../supabase/migrations/202609280002_establish_marketing_analytics_baseline.sql',import.meta.url),'utf8'),readFile(new URL('../src/lib/NavigationTracker.jsx',import.meta.url),'utf8'),readFile(new URL('../src/components/shop/CartContext.jsx',import.meta.url),'utf8'),readFile(new URL('../src/pages/Checkout.jsx',import.meta.url),'utf8'),readFile(new URL('../src/App.jsx',import.meta.url),'utf8'),readFile(new URL('../src/pages/AdminDashboard.jsx',import.meta.url),'utf8'),readFile(new URL('../src/Layout.jsx',import.meta.url),'utf8')]);
for(const tab of ['Overview','Marketing Plan','Action Plan','Performance','SEO & GEO','Social Content','Email Marketing','Google Business','Competitors','Settings'])assert.match(page,new RegExp(tab.replace(/[&]/g,'&')));
assert.match(migration,/monthly_paid_budget numeric\(12,2\) not null default 0/);
assert.match(migration,/marketing_settings_paid_budget_guard/);
assert.match(migration,/paid_advertising_enabled = false/);
assert.match(migration,/Complete Google Business verification/);
assert.match(migration,/Build local outreach prospect categories/);
for(const table of ['marketing_channels','marketing_tasks','marketing_campaigns','marketing_social_content','marketing_email_campaigns','marketing_google_business_items','marketing_competitors','marketing_goals','marketing_seo_pages','marketing_content_ideas'])assert.match(migration,new RegExp(table));
for(const event of ['page_view','product_view','brand_view','category_view','account_signup','login','add_to_cart','remove_from_cart','checkout_started','shipping_quote_success','payment_method_selected','purchase_completed','quote_request_submitted','contact_submitted','email_subscribed','sale_promo_clicked','search_used','track_order_used'])assert.match(`${migration}\n${page}`,new RegExp(event));
assert.match(tracker,/product_view/);assert.match(tracker,/brand_view/);assert.match(tracker,/category_view/);assert.match(tracker,/checkout_started/);assert.match(cart,/remove_from_cart/);assert.match(checkout,/shipping_quote_success/);
assert.match(app,/path="\/AdminMarketingCenter"/);assert.match(dashboard,/Marketing Center/);assert.match(layout,/Marketing Center/);
assert.match(baselineMigration,/analytics_reliable_since/);assert.match(baselineMigration,/marketing_analytics_health/);assert.match(page,/Tracking reliable since:/);assert.match(page,/Historical Analytics/);assert.match(page,/Reliable for funnel/);assert.match(page,/purchases:count\('purchase_completed'\)/);assert.match(page,/m\.checkout>m\.cart/);
assert.doesNotMatch(page,/publish\(|sendEmail|checkout\.sessions|api\.ssactivewear|USPS_CLIENT_SECRET|STRIPE_/i);
console.log('PASS: organic-first Marketing Center, $0 paid guardrail, persistence model, admin navigation, and safe analytics coverage.');
console.log('SAFETY: no post, email, ad, payment, S&S order, or USPS label action is present.');
