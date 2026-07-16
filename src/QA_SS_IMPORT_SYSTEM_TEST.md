# S&S Multi-File Import System - Comprehensive Test Report

**Date:** June 22, 2026  
**System:** HC Apparel S&S Activewear Product Import + Grouping + Pricing  
**Test Data:** Multi-file import (Products, Styles, Categories, Specs, DaysInTransit)  

---

## Overview
This document details testing for the complete S&S product import system, including:
- Multi-file import (5 file types with data enrichment)
- Brand filtering (11 approved brands only)
- Product grouping by Brand + Style Number
- Variant management (color, size, cost, inventory)
- Deduplication and SKU tracking
- Pricing rules with markup calculation
- Public product creation from groups

---

## Test A: S&S Multi-File Importer Loads

**Objective:** Verify the import page and uploader component load without errors.

### Steps
1. Log in as admin user
2. Navigate to AdminSSCatalog page
3. Click "Import CSV / Excel" button
4. Verify import uploader dialog appears

### Expected Results
- ✅ AdminSSCatalog page loads
- ✅ "Import CSV / Excel" button visible and clickable
- ✅ SSMultiFileImporter component displays
- ✅ Shows 5 file upload areas: Products, Styles, Categories, Specs, DaysInTransit
- ✅ File requirements listed clearly
- ✅ "Import All Files" button visible but disabled until all files uploaded
- ✅ No errors in console

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test B: Upload All 5 Required Files

**Objective:** Verify all 5 files can be selected and are recognized.

### Steps
1. In import dialog, select and upload:
   - Products.xlsx
   - Styles.xlsx
   - Categories.xlsx
   - Specs.xlsx
   - DaysInTransit.xlsx
2. Verify each file shows as "ready" with checkmark
3. Verify "Import All Files" button becomes enabled

### Expected Results
- ✅ Each file upload area accepts .xlsx, .xls, .csv, .tsv formats
- ✅ After selection, shows filename and green checkmark
- ✅ All 5 files can be uploaded simultaneously
- ✅ "Import All Files" button enables only when all 5 files selected
- ✅ No upload size errors

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test C: Only Approved Brands Import

**Objective:** Verify unapproved brands are filtered and not imported to public shop.

### Steps
1. Create test Products.xlsx with mix of approved and unapproved brands:

   **Approved:**
   - Bella + Canvas
   - Gildan
   - Comfort Colors
   - Next Level
   - Independent Trading Co.
   - Champion
   - Hanes
   - Rabbit Skins
   - Shaka Wear
   - Lane Seven
   - adidas

   **Unapproved (should skip):**
   - Unapproved Brand Inc
   - Random Supplier Co
   - Unknown Label

2. Include these in Products sheet alongside approved brands
3. Import all 5 files
4. Check import results

### Expected Results
- ✅ Import results show:
  - Total Rows: count all products
  - Approved Brand Rows: count of approved only
  - Skipped Unapproved: count of rejected brands
- ✅ Unapproved rows not imported to SSCatalogItem
- ✅ Error log lists skipped brands with row numbers
- ✅ Only approved brands appear in Admin S&S Catalog

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test D: Product Groups Created Instead of Individual SKU Products

**Objective:** Verify products are grouped by Brand + Style Number, not created as individual public products.

### Steps
1. Import Products.xlsx with multiple SKUs for same Brand + Style combination:

   Example:
   - Bella + Canvas Style 3001 (Red, Size S, SKU BC-3001-R-S, Cost $3.30)
   - Bella + Canvas Style 3001 (Red, Size M, SKU BC-3001-R-M, Cost $3.30)
   - Bella + Canvas Style 3001 (Blue, Size S, SKU BC-3001-B-S, Cost $3.30)
   - Bella + Canvas Style 3001 (Blue, Size M, SKU BC-3001-B-M, Cost $3.30)

2. Complete import
3. Navigate to AdminSSCatalog
4. Switch to "Product Groups" view
5. Check for one product group entry (not 4)

### Expected Results
- ✅ One product group created: "Bella + Canvas 3001"
- ✅ Group shows 4 variants (2 colors × 2 sizes)
- ✅ Products.xlsx SKUs are variants under the group, not public products
- ✅ Product Groups view shows:
  - Brand: Bella + Canvas
  - Style #: 3001
  - Product Name
  - Number of Colors: 2
  - Number of Sizes: 2
  - Total SKUs: 4
  - Total Inventory: sum of all variants
  - Lowest/Highest Cost
  - Lowest/Highest Public Price

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test E: Approved Brands Appear in Admin Catalog

**Objective:** Verify each of the 11 approved brands was imported and appears correctly.

### Steps
1. Import Products.xlsx containing all 11 approved brands
2. Navigate to AdminSSCatalog
3. Use Brand filter to check each brand
4. Verify each brand has product groups

**Brands to verify:**
- Bella + Canvas
- Gildan
- Comfort Colors
- Next Level
- Independent Trading Co.
- Champion
- Hanes
- Rabbit Skins
- Shaka Wear
- Lane Seven
- adidas

### Expected Results
- ✅ All 11 brands appear in Brand filter dropdown
- ✅ Each brand has at least one product group
- ✅ Filtering by brand shows correct groups
- ✅ Groups show correct style numbers and variant counts

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test F: Unapproved Brands Do Not Appear Publicly

**Objective:** Verify that unapproved brands are not accessible to customers.

### Steps
1. Attempt to filter shop by unapproved brand
2. Check ShopGarments page—no unapproved brands visible
3. Verify admin only sees them in admin catalog, not public

### Expected Results
- ✅ Unapproved brands not in AdminProducts public shop
- ✅ ShopGarments shows only approved S&S brands
- ✅ Admin can see unapproved in AdminSSCatalog (for reference)
- ✅ Unapproved items marked as "vendor_catalog_only" status

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test G: Pricing Rule Works Correctly

**Objective:** Verify markup calculation: blank cost + $2.00 = public price.

### Steps
1. In AdminSSPricingRules, confirm default:
   - Flat Markup: $2.00
   - Rounding: None
   - Minimum: $0
2. Import Products.xlsx with known blank costs:
   - Item 1: Blank Cost $3.30
   - Item 2: Blank Cost $5.50
   - Item 3: Blank Cost $10.00
3. Check public prices in admin catalog or when adding group to shop

### Expected Results
- ✅ Item 1: Public Price = $3.30 + $2.00 = $5.30 ✅
- ✅ Item 2: Public Price = $5.50 + $2.00 = $7.50 ✅
- ✅ Item 3: Public Price = $10.00 + $2.00 = $12.00 ✅
- ✅ No .99 rounding unless enabled
- ✅ Prices match exactly

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test H: Variant Pricing Updates on Size/Color Selection

**Objective:** Verify product detail page price updates when customer selects different variant.

### Steps
1. Add a product group to public products (has 2 colors, 3 sizes, different costs per variant)
2. Navigate to product detail page on storefront
3. Initially, price shows lowest variant price or "From $X"
4. Select different color: price updates
5. Select different size: price updates
6. Verify each combination shows correct variant price

Example:
- Red S: $5.30, Red M: $5.30, Red L: $5.50
- Blue S: $5.50, Blue M: $5.50, Blue L: $5.50

Selecting Blue L should show $5.50.

### Expected Results
- ✅ Product detail shows variant prices correctly
- ✅ Price updates instantly when size/color changes
- ✅ All size/color combinations show correct calculated price
- ✅ Price reflects the selected variant's blank cost + markup

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test I: Cart Saves Selected Variant Price, Size, Color, SKU (Admin-Only)

**Objective:** Verify cart stores variant selection and admin-only fields don't expose to customer.

### Steps
1. Add a product group to public with variants (2 colors, 2 sizes)
2. On product detail, select: Blue, Size M
3. Add to cart
4. View cart

**Customer sees:**
- Product name
- Image
- Selected color: Blue
- Selected size: M
- Price: correct for Blue M variant
- Quantity selector
- Remove button

**Admin-only (not customer visible):**
- SKU: BC-3001-B-M
- Blank cost: $3.30
- Vendor cost: not shown
- Inventory tracking: not shown

### Expected Results
- ✅ Cart displays: name, image, color, size, price, qty
- ✅ Cart item's internal data includes: variant SKU, blank cost, selected price
- ✅ Checkout uses selected price and variant info
- ✅ Customer never sees SKU, cost, or vendor fields
- ✅ Admin can see all fields in AdminOrders when reviewing order

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test J: No Duplicate Product Groups on Re-Import

**Objective:** Verify that re-importing the same data updates variants instead of creating duplicates.

### Steps
1. Import Products.xlsx (first time)
2. Note product group count in AdminSSCatalog
3. Import the exact same Products.xlsx again
4. Check product group count—should be identical
5. Check variant counts—should be updated, not duplicated

### Expected Results
- ✅ First import: creates product groups and variants
- ✅ Second import: finds existing SKUs and updates them
- ✅ Product group count stays the same
- ✅ Variant count stays the same (not doubled)
- ✅ Import results show "Variants Updated" count (not "Created")
- ✅ Duplicate SKU logic prevents duplicate records

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test K: Data Enrichment from Styles, Categories, Specs, DaysInTransit

**Objective:** Verify all 5 file types enrich product data correctly.

### Steps
1. Create test files:

   **Products.xlsx:**
   - SKU, Brand, Style #, Name, Color, Size, Cost, Inventory

   **Styles.xlsx:**
   - Brand, Style #, Style Name, Description, Product Type

   **Categories.xlsx:**
   - Style # → Category mapping

   **Specs.xlsx:**
   - SKU → Measurements, Fabric, Fit, Weight, Material, Care

   **DaysInTransit.xlsx:**
   - SKU → Transit Days

2. Import all 5
3. Check AdminSSCatalog or detail view for enriched fields

### Expected Results
- ✅ Products linked to Styles by Brand + Style #
- ✅ Categories mapped by Style # to product category
- ✅ Specs mapped by SKU to variant detail
- ✅ Transit days stored but not shown publicly
- ✅ SSCatalogItem contains:
  - Description from Styles
  - Product category from Categories
  - Measurements, fabric, fit, material, care from Specs
  - Days in transit (admin-only)

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test L: Out-of-Stock Behavior

**Objective:** Verify out-of-stock SKUs are imported and handled correctly.

### Steps
1. In Products.xlsx, include:
   - In-stock items: Inventory > 0
   - Out-of-stock items: Inventory = 0

2. Import files
3. Check AdminSSCatalog for status
4. Add product group with out-of-stock variants to public shop
5. Check if out-of-stock variants disable selection

### Expected Results
- ✅ Out-of-stock SKUs imported to admin catalog
- ✅ Status shows as "out_of_stock"
- ✅ Inventory shown as 0
- ✅ When adding group to public:
  - In-stock variants available
  - Out-of-stock variants show "Out of Stock" and disable selection
- ✅ If all variants out of stock, product created as Draft
- ✅ Checkout prevents ordering out-of-stock variants

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test M: Pricing Rules with Category/Brand Overrides

**Objective:** Verify overrides prioritize correctly: Brand > Category > Default.

### Steps
1. In AdminSSPricingRules, set:
   - Default Markup: $2.00
   - Category Override (Hoodies): $3.00
   - Brand Override (Bella + Canvas): $2.50

2. Import Products.xlsx with:
   - Bella + Canvas Hoodie: should use $2.50 (brand override wins)
   - Gildan Hoodie: should use $3.00 (category override)
   - Gildan T-Shirt: should use $2.00 (default)

3. Check calculated prices

### Expected Results
- ✅ Bella + Canvas products use brand override ($2.50)
- ✅ Hoodies use category override ($3.00) unless brand override applies
- ✅ All others use default ($2.00)
- ✅ Prices reflect correct markup in admin and on product detail

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test N: Import Progress and Results Reporting

**Objective:** Verify import progress dialog shows correct statistics and error log.

### Steps
1. Upload all 5 files with mix of valid/invalid/unapproved data
2. Click "Import All Files"
3. Wait for import to complete
4. Check import results dialog

### Expected Results
- ✅ Dialog shows:
  - Total Rows Processed: count all
  - Approved Brand Rows: count of approved only
  - Skipped Unapproved: count skipped
  - Product Groups Created: count groups
  - Variants Created: count new variants
  - Variants Updated: count updated
  - Errors: count of issues
- ✅ Error log lists issues with row numbers/SKUs
- ✅ Download error log button works
- ✅ Success toast message
- ✅ AdminSSCatalog auto-refreshes after import

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test O: Add Product Group to Public Products Workflow

**Objective:** Verify adding group to public creates parent product with all variants.

### Steps
1. In AdminSSCatalog Product Groups view
2. Find a group with multiple variants (2+ colors, 2+ sizes)
3. Click "Add Group to Public" button
4. Confirm action
5. Check AdminProducts for new product

### Expected Results
- ✅ New product created as Draft status
- ✅ Product name: Brand + Style # or customizable
- ✅ All variants mapped: sizes and colors available
- ✅ Price shows lowest variant or "From $X" if different
- ✅ All size/color combinations available for selection
- ✅ Admin-only fields not visible to customers:
  - Vendor cost
  - SKU
  - Blank cost
  - Inventory
- ✅ Inventory status enforced on product detail
- ✅ All variants linked to parent product

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Summary

| Test | Result | Status |
|---|---|---|
| A. Importer Loads | [ ] PASS [ ] FAIL | — |
| B. Upload All 5 Files | [ ] PASS [ ] FAIL | — |
| C. Only Approved Brands Import | [ ] PASS [ ] FAIL | — |
| D. Product Groups Created | [ ] PASS [ ] FAIL | — |
| E. Approved Brands Appear | [ ] PASS [ ] FAIL | — |
| F. Unapproved Brands Hidden | [ ] PASS [ ] FAIL | — |
| G. Pricing Rule Works ($3.30 + $2 = $5.30) | [ ] PASS [ ] FAIL | — |
| H. Variant Pricing Updates | [ ] PASS [ ] FAIL | — |
| I. Cart Saves Variant/SKU/Price | [ ] PASS [ ] FAIL | — |
| J. No Duplicates on Re-import | [ ] PASS [ ] FAIL | — |
| K. Data Enrichment (Styles/Specs/Categories) | [ ] PASS [ ] FAIL | — |
| L. Out-of-Stock Handling | [ ] PASS [ ] FAIL | — |
| M. Category/Brand Override Priority | [ ] PASS [ ] FAIL | — |
| N. Import Results Reporting | [ ] PASS [ ] FAIL | — |
| O. Add Group to Public Workflow | [ ] PASS [ ] FAIL | — |

**Total Tests:** 15  
**Passed:** [ ]  
**Failed:** [ ]  
**Critical Issues:** [ ] None [ ] Blocker Found  

**Overall Result:** [ ] ALL PASS [ ] SOME FAILURES [ ] BLOCKER

---

## Test Data Summary

**Files Used:**
- Products.xlsx (rows: ____)
- Styles.xlsx (rows: ____)
- Categories.xlsx (rows: ____)
- Specs.xlsx (rows: ____)
- DaysInTransit.xlsx (rows: ____)

**Import Statistics:**
- Total Rows Processed: ____
- Approved Brands: ____
- Skipped Unapproved: ____
- Product Groups Created: ____
- Variants Created: ____
- Variants Updated: ____

**Brands Imported:**
- [ ] Bella + Canvas
- [ ] Gildan
- [ ] Comfort Colors
- [ ] Next Level
- [ ] Independent Trading Co.
- [ ] Champion
- [ ] Hanes
- [ ] Rabbit Skins
- [ ] Shaka Wear
- [ ] Lane Seven
- [ ] adidas

---

## Environment & Setup

**Test User:** Admin  
**Browser:** __________________  
**Viewport:** __________________  
**Date:** __________________  

---

## Defects & Issues

### Critical Issues
_____________________________________________________________________

### Medium Issues
_____________________________________________________________________

### Minor Issues
_____________________________________________________________________

---

## Sign-Off

**Tester Name:** ____________________  
**Date Completed:** ____________________  
**Approved By:** ____________________  
**Ready for Release:** [ ] YES [ ] NO [ ] CONDITIONAL

**Notes for Stakeholder:**
_____________________________________________________________________