export const isQaTestInboxItem = (item) =>
  item?.is_sample === true || /^\s*(qa|test)(?:\s+message)?\s*$/i.test(item?.subject || '');

export const isArchivedInboxItem = (item) => item?.status === 'archived' || isQaTestInboxItem(item);
export const isActiveInboxItem = (item) => !isArchivedInboxItem(item);

export const isActiveInboxOrder = (order) =>
  !order?.is_sample &&
  !['archived', 'canceled', 'cancelled', 'refunded'].includes(order?.status) &&
  order?.payment_status !== 'demo';
