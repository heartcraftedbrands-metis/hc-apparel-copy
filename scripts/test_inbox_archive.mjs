import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isActiveInboxItem, isArchivedInboxItem, isActiveInboxOrder } from '../src/lib/inboxFilters.js';

const messages = [
  { id: 'king-1', status: 'archived', subject: 'Test' },
  { id: 'king-2', status: 'archived', subject: 'Test' },
  { id: 'new', status: 'new' },
  { id: 'qa', status: 'new', is_sample: true },
  { id: 'legacy-test', status: 'new', subject: 'TEst' },
];
assert.deepEqual(messages.filter(isActiveInboxItem).map(({ id }) => id), ['new']);
assert.deepEqual(messages.filter(isArchivedInboxItem).map(({ id }) => id), ['king-1', 'king-2', 'qa', 'legacy-test']);
assert.equal(messages.filter(item => isActiveInboxItem(item) && item.status === 'new').length, 1);

const orders = [
  { id: 'live', status: 'awaiting_payment', payment_status: 'unpaid' },
  { id: 'qa', is_sample: true, status: 'awaiting_payment', payment_status: 'unpaid' },
  { id: 'canceled', status: 'canceled', payment_status: 'unpaid' },
  { id: 'demo', status: 'awaiting_payment', payment_status: 'demo' },
];
assert.deepEqual(orders.filter(isActiveInboxOrder).map(({ id }) => id), ['live']);

const inbox = readFileSync(new URL('../src/pages/AdminInbox.jsx', import.meta.url), 'utf8');
assert.match(inbox, /No active contact messages\./);
assert.match(inbox, /Restore to Inbox/);
assert.match(inbox, /activeMessages\.map\(msg/);
assert.match(inbox, /archivedItems\.map/);
assert.doesNotMatch(inbox, /\.delete\(/);

console.log('PASS: active inbox, QA archive, order counts, and restore controls');
