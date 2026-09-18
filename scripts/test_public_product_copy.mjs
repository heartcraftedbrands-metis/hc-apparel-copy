import assert from 'node:assert/strict';
import { getPublicProductDescription, getPublicProductText, hasInternalProductCopy } from '../src/lib/publicProductCopy.js';

const tultex = {
  name: 'Tultex 202',
  description: 'Private S&S Activewear launch-batch product. Not approved for the public storefront.',
};
const customerCopy = getPublicProductDescription(tultex, 'Tultex T-Shirt');
assert.match(customerCopy, /Tultex T-Shirt/);
assert.match(customerCopy, /blank apparel/);
assert.doesNotMatch(customerCopy, /private|launch-batch|not approved/i);

for (const note of ['Internal QA product', 'Test product', 'Private catalog-batch', 'Not approved for public']) {
  assert.equal(hasInternalProductCopy(note), true);
  assert.equal(getPublicProductText(note), '');
}
assert.equal(getPublicProductText('Cotton blend with a relaxed fit.'), 'Cotton blend with a relaxed fit.');
assert.equal(getPublicProductDescription({ description: 'Soft cotton blank tee.' }, 'Tultex T-Shirt'), 'Soft cotton blank tee.');

console.log('Public product copy safeguards passed.');
