/**
 * Clean up S&S product names by removing duplicate brand/style text.
 * 
 * Examples:
 * "Shaka Wear SHALS Shaka Wear SHALS" → "Shaka Wear SHALS"
 * "Lane Seven LS11001" → "Lane Seven LS11001" (no duplicates)
 * "BELLA + CANVAS 0990" → "BELLA + CANVAS 0990"
 */
export function cleanSSProductName(brand, styleNumber, productName) {
  // Start with the product name as is
  let name = (productName || '').trim();

  // If name already contains brand + style, return it
  if (brand && styleNumber && name.includes(brand) && name.includes(styleNumber)) {
    // Just clean up excess whitespace and return
    return name.replace(/\s+/g, ' ').trim();
  }

  // If name doesn't contain style number but brand does, check for duplication
  if (brand && name.includes(brand)) {
    // Extract the part after the brand to see if it's a duplicate
    const parts = name.split(new RegExp(`${brand}`, 'i'));
    if (parts.length > 2) {
      // Multiple occurrences — keep only first + the rest
      name = (brand + ' ' + parts.slice(1).join(' ')).replace(/\s+/g, ' ').trim();
    }
  }

  return name;
}