const hasValue = (value) => Array.isArray(value)
  ? value.some(hasValue)
  : Boolean(String(value ?? '').trim());

export function isBlankGarmentOrder(order, quoteRequest) {
  const items = order?.order_items;
  if (!Array.isArray(items) || items.length === 0 || quoteRequest?.needs_artwork_help) return false;
  if (hasValue(order?.artwork_file_url) || hasValue(order?.artwork_link)
    || hasValue(order?.print_method) || hasValue(order?.print_placement)
    || hasValue(order?.what_to_print)) return false;
  return items.every((item) => item?.purchase_mode !== 'customized'
    && item?.is_customized !== true
    && !hasValue(item?.artwork_file_url)
    && !hasValue(item?.artwork_link)
    && !hasValue(item?.decoration_method)
    && !hasValue(item?.print_method)
    && !hasValue(item?.print_placement)
    && !hasValue(item?.print_size_option));
}
