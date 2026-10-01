import fs from 'node:fs';
import path from 'node:path';

const read = relativePath => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
const feature = read('src/config/storefrontFeatures.js');
const app = read('src/App.jsx');
const layout = read('src/Layout.jsx');
const mobileTabs = read('src/components/mobile/BottomTabBar.jsx');
const homepageCategories = read('src/components/home/HomeFeaturedCategories.jsx');

const checks = [
  ['custom printing is disabled by one reversible flag', /customPrinting:\s*false/.test(feature)],
  ['route redirects to blank apparel shop while disabled', app.includes('<Navigate to="/ShopGarments" replace />')],
  ['page component remains available for restoration', app.includes("import CustomPrintingPage from './pages/CustomPrinting';")],
  ['desktop navigation obeys feature flag', layout.includes("...(STOREFRONT_FEATURES.customPrinting ? [{ to: '/CustomPrinting'")],
  ['desktop footer obeys feature flag', layout.includes('STOREFRONT_FEATURES.customPrinting && <li><Link to="/CustomPrinting"')],
  ['mobile tab obeys feature flag', mobileTabs.includes("...(STOREFRONT_FEATURES.customPrinting ? [{ label: 'Print'")],
  ['homepage card obeys feature flag', homepageCategories.includes("category.link !== '/CustomPrinting' || STOREFRONT_FEATURES.customPrinting")],
  ['shop route is unchanged', app.includes('path="/ShopGarments"')],
  ['bulk quote route is unchanged', app.includes('path="/RequestQuote"')],
  ['checkout route is unchanged', app.includes('path="/Checkout"')],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'}: ${label}`);
if (failed.length) process.exit(1);
console.log('\nCustom Printing storefront visibility and redirect checks passed.');
