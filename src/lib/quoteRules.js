export const BULK_QUOTE_MINIMUM = 50;

export const BULK_QUOTE_MINIMUM_MESSAGE =
  'Bulk quotes are for orders of 50 or more. For smaller orders, please use Request Order Help on the product page.';

export const isBulkQuoteQuantity = (value) => {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity >= BULK_QUOTE_MINIMUM;
};
