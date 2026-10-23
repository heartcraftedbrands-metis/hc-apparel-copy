import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const actionCenter = read('src/pages/AdminBusinessIntelligence.jsx');
const orderDetail = read('src/pages/AdminOrderDetail.jsx');
const app = read('src/App.jsx');
const auth = read('src/api/base44Client.js');
const login = read('src/lib/customerAuth.js');

assert.match(actionCenter, /AdminOrderDetail\?order_id=\$\{encodeURIComponent\(o\.id\)\}/, 'Every owner-control link must use the route parameter consumed by AdminOrderDetail');
assert.doesNotMatch(actionCenter, /AdminOrderDetail\?id=/, 'The broken legacy card parameter must not remain');
assert.match(actionCenter, /Order #\{orderReference\(o\.id\)\} · \{date\(o\.created_date\)\}/, 'Cards must display an order reference and Eastern date');
assert.match(orderDetail, /searchParams\.get\('order_id'\) \|\| searchParams\.get\('id'\)/, 'Direct links and legacy links must resolve an order ID');
assert.match(orderDetail, /navigate\(`\/AdminOrderDetail\?order_id=/, 'Legacy links must be normalized without losing the selected order');
assert.match(orderDetail, /Order unavailable/, 'Missing, inaccessible, and deleted orders need a useful state');
assert.match(orderDetail, /Return to orders/, 'Order error states need a working return action');
assert.match(app, /<Route element=\{<ProtectedRoute requiredRole="admin" \/>\}>[\s\S]*AdminOrderDetail/, 'Owner controls must remain admin-only');
assert.match(auth, /sessionStorage\.setItem\('hc_login_return_to', returnTo\)/, 'Sign-in redirects must preserve the full selected-order URL');
assert.match(login, /url\.pathname\}\$\{url\.search\}\$\{url\.hash\}/, 'Post-login navigation must restore query parameters and hash');

console.log('Owner order link, direct-link, refresh, and access safeguards verified.');
