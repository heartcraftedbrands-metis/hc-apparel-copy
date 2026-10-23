import assert from 'node:assert/strict';
import fs from 'node:fs';

const makeStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

global.window = {
  location: { origin: 'https://www.ilovehcapparel.net' },
  sessionStorage: makeStorage(),
  localStorage: makeStorage(),
};
global.sessionStorage = global.window.sessionStorage;

const auth = await import('../src/lib/customerAuth.js');
assert.equal(auth.safeInternalDestination('/AdminBusinessIntelligence?period=7#orders'), '/AdminBusinessIntelligence?period=7#orders');
assert.equal(auth.safeInternalDestination('https://evil.example/steal'), '/Profile');
assert.equal(auth.safeInternalDestination('/Checkout'), '/Profile');
assert.equal(auth.rememberAuthDestination('/AdminOrderDetail?order_id=abc'), '/AdminOrderDetail?order_id=abc');
assert.equal(window.localStorage.getItem('hc_login_return_to'), '/AdminOrderDetail?order_id=abc');
window.sessionStorage.removeItem('hc_login_return_to');
assert.equal(auth.destinationAfterAuth(), '/AdminOrderDetail?order_id=abc');
assert.equal(window.localStorage.getItem('hc_login_return_to'), null);

const login = fs.readFileSync(new URL('../src/pages/Login.jsx', import.meta.url), 'utf8');
const reset = fs.readFileSync(new URL('../src/pages/ResetPassword.jsx', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../src/api/base44Client.js', import.meta.url), 'utf8');
const edge = fs.readFileSync(new URL('../supabase/functions/operations-onboarding/index.ts', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/202610230009_yho_auth_recovery.sql', import.meta.url), 'utf8');

assert.match(client, /rememberAuthDestination\(returnTo\)/, 'Protected routes must preserve a safe destination in cross-tab storage');
assert.match(client, /Login\?returnTo=/, 'The approved destination must survive a direct login URL');
assert.match(login, /rememberRecoveryEmail/, 'Recovery should persist the account email across Safari tabs');
assert.match(login, /redirectTo: authRedirect\('\/ResetPassword'\)/, 'Recovery must use the allow-listed production reset URL');
assert.match(reset, /exchangeCodeForSession\(code\)/, 'PKCE recovery codes must be exchanged explicitly');
assert.match(reset, /event === 'PASSWORD_RECOVERY' \|\| event === 'SIGNED_IN'/, 'Both recovery event variants must unlock the form');
assert.match(reset, /expired or was already used/i, 'Expired or consumed links must explain the failure');
assert.match(reset, /Request another password link/, 'Expired-link recovery must be available on the same page');
assert.match(reset, /AdminBusinessIntelligence/, 'Operations managers must return to the Business Action Center');
assert.doesNotMatch(reset, /temporary password/i, 'The UI must never assign or display a temporary password');
assert.match(edge, /generateLink\(\{\s*type: 'recovery'/s, 'The approved email must contain a supported recovery link');
assert.match(edge, /CONTROLLED_TEST_EMAIL/, 'A distinct controlled account must be used for the end-to-end auth test');
assert.match(edge, /recovered_password_sign_in_confirmed: true/, 'The controlled test must verify sign-in with the recovered password');
assert.match(migration, /has_password_credential/, 'The account diagnostic must verify a usable password credential without exposing it');
assert.match(migration, /profile_role.*operations_manager/s, 'The diagnostic must preserve the restricted operations role');

console.log('Auth recovery safeguards verified.');
