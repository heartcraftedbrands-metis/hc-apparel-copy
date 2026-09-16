import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../supabase/functions/social-media-studio/index.ts', import.meta.url), 'utf8');
const start = source.indexOf('function websiteLink(');
const end = source.indexOf('function env(', start);
assert.ok(start >= 0 && end > start, 'Website CTA helpers must exist in the Edge Function');

const compiled = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const context = vm.createContext({
  URL,
  limited: (value, max) => String(value ?? '').trim().slice(0, max),
  fail: message => { throw new Error(message); },
});
vm.runInContext(`${compiled}\nglobalThis.helpers = { websiteLink, withWebsiteCta };`, context);
const { websiteLink, withWebsiteCta } = context.helpers;

assert.equal(websiteLink(undefined), 'www.ilovehcapparel.net');
assert.equal(websiteLink('https://ilovehcapparel.net/CustomPrinting'), 'www.ilovehcapparel.net/CustomPrinting');
assert.throws(() => websiteLink('https://another-site.example'), /HC Apparel site URL/);

const base = 'HC Apparel carries apparel blanks for brands and teams. Custom printing is optional. Shop Blanks';
const line = 'Shop blanks and printing: www.ilovehcapparel.net';
assert.equal(withWebsiteCta(base, websiteLink(undefined)), `${base}\n\n${line}`);
const alreadyLinked = `${base}\n\nShop blanks and printing: [www.ilovehcapparel.net](http://www.ilovehcapparel.net)`;
const result = withWebsiteCta(alreadyLinked, websiteLink(undefined));
assert.equal(result, `${base}\n\n${line}`);
assert.equal((result.match(/ilovehcapparel\.net/g) || []).length, 1);
assert.match(source, /const finalCaption = withWebsiteCta\(/);
console.log('Social Studio website CTA checks passed.');
