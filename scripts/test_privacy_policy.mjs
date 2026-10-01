import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const app = read('src/App.jsx');
const layout = read('src/Layout.jsx');
const policy = read('src/pages/PrivacyPolicy.jsx');

const assertions = [
  ['policy is imported', app.includes("import PrivacyPolicyPage from './pages/PrivacyPolicy';")],
  ['policy route exists', app.includes('path="/PrivacyPolicy"')],
  ['policy route is public', app.indexOf('path="/PrivacyPolicy"') < app.indexOf('<Route element={<ProtectedRoute requiredRole="admin" />}>')],
  ['desktop footer links policy', layout.includes('<li><Link to="/PrivacyPolicy"')],
  ['mobile footer links policy', layout.includes('md:hidden') && layout.includes('to="/PrivacyPolicy"')],
  ['verified contact is present', policy.includes('support@ilovehcapparel.net')],
  ['payment handling is disclosed', policy.includes('Stripe Checkout') && policy.includes('full card or bank-account number')],
  ['customer uploads are disclosed', policy.includes('Customer artwork and files') && policy.includes('Artwork and other files you upload')],
  ['store providers are disclosed', ['Supabase', 'Vercel', 'S&amp;S Activewear', 'USPS', 'Brevo'].every(provider => policy.includes(provider))],
  ['Pinterest connection is disclosed', policy.includes('future Pinterest API connection') && policy.includes('without authorization')],
  ['analytics are disclosed', policy.includes('Google Analytics') && policy.includes('Pinterest Tag')],
  ['mobile-safe layout is used', policy.includes('px-4') && policy.includes('sm:px-6') && policy.includes('min-w-0') && policy.includes('break-words')],
  ['no unverified legal suffix is asserted', !/HC Apparel,? (LLC|Inc\.|Corporation|Ltd\.)/.test(policy)],
  ['no unverified street address is present', !/\b\d{2,6}\s+[A-Z][A-Za-z]+\s+(Street|St\.|Road|Rd\.|Avenue|Ave\.|Boulevard|Blvd\.)\b/.test(policy)],
];

const failed = assertions.filter(([, passed]) => !passed);
for (const [label, passed] of assertions) console.log(`${passed ? 'PASS' : 'FAIL'}: ${label}`);

if (failed.length) {
  console.error(`\n${failed.length} privacy policy check(s) failed.`);
  process.exit(1);
}

console.log('\nPrivacy Policy route, disclosures, footer links, and mobile layout checks passed.');
