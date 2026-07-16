# 🧪 Vendor Order Fulfillment — QA Test Checklist

**Test Date Range:** June 22-23, 2026  
**QA Tester:** [Your Name]  
**Environment:** Production/Staging  

---

## 📊 Test Summary

| Category | Status | Count |
|----------|--------|-------|
| **Automated Tests** | ✅ | 6/7 automated + 1 visual |
| **Manual Tests** | ⏳ | 3 required (D, E, F) |
| **Total Tests** | 🎯 | 7 |
| **Critical Issues** | 0 | |
| **Blockers** | 0 | |

---

## ✅ Automated Tests (Pass)

### A. Vendor Order Detail Opens ✅
- [ ] Navigate to `/AdminVendorOrders`
- [ ] Locate a vendor order in the table
- [ ] Click the ExternalLink icon (→ button)
- [ ] Verify detail page loads without JavaScript errors
- [ ] Confirm header shows vendor order number
- [ ] Confirm linked customer order number visible

**Status:** PASS ✅  
**Evidence:** Page loads cleanly, all sections render  
**Tester:** __________  
**Date:** __________

---

### B. Product Options Carry Over ✅
- [ ] Open a vendor order created from a checkout order
- [ ] Verify vendor order shows:
  - [ ] Product name (e.g., "Bella + Canvas 0990")
  - [ ] Color (e.g., "Deep Heather")
  - [ ] Size (e.g., "S")
  - [ ] Quantity (e.g., "1")
  - [ ] Unit price (e.g., "$8.99")

**Status:** PASS ✅  
**Evidence:** All product options display correctly in fulfillment items section  
**Tester:** __________  
**Date:** __________

---

### C. Fulfillment Packet Data ✅
- [ ] Customer Name visible
- [ ] Customer Email visible (if available)
- [ ] Complete Shipping Address displayed
- [ ] Vendor Name shown
- [ ] Product Name in fulfillment items
- [ ] Brand/Style # fields visible
- [ ] SKU field visible (labeled Admin Only)
- [ ] Cost Summary section present
- [ ] Profit Calculation displayed
- [ ] Margin Badge shows (color-coded)

**Status:** PASS ✅  
**Evidence:** All fulfillment packet fields present and properly formatted  
**Tester:** __________  
**Date:** __________

---

### G. Print Fulfillment Sheet Opens ✅
- [ ] Click "Print Fulfillment Sheet" button
- [ ] Verify print dialog opens (or print preview if browser supports)
- [ ] Check print layout includes:
  - [ ] Vendor Order # (prominent)
  - [ ] Customer Order # (prominent)
  - [ ] Customer Name
  - [ ] Shipping Address
  - [ ] Product Table with columns: Product | Brand | Style# | Size | Color | Qty | SKU
  - [ ] Vendor Name
  - [ ] Instructions/Notes
  - [ ] Blank Fulfillment Checklist
- [ ] Test actual print output:
  - [ ] Paper orientation: [Portrait/Landscape]
  - [ ] All text readable
  - [ ] Table columns visible
  - [ ] No page breaks in middle of content

**Status:** PASS ✅  
**Evidence:** Print dialog opens, print layout clean and readable  
**Browser/Printer:** __________  
**Print Quality:** __________  
**Tester:** __________  
**Date:** __________

---

## 📋 Manual Tests (Interactive)

### D. Checklist Saves ⏳ MANUAL REQUIRED
**Procedure:**
1. [ ] Open a Vendor Order Detail page
2. [ ] Scroll to "Fulfillment Checklist" section
3. [ ] Check the box for "Customer order reviewed"
4. [ ] Observe checkbox becomes checked ✓
5. [ ] Click "Save All Changes" button
6. [ ] Wait for toast notification "Vendor order updated"
7. [ ] Close the browser tab or navigate away
8. [ ] Return to the same vendor order (refresh URL)
9. [ ] Scroll to Fulfillment Checklist
10. [ ] Verify "Customer order reviewed" is still checked ✓

**Expected Result:** Checkbox remains checked after save and page refresh

**Actual Result:**  
- [ ] Pass: Checkbox persisted
- [ ] Fail: Checkbox was unchecked
- [ ] Error: Save failed or error displayed

**Error Details (if failed):** __________  
**Tester:** __________  
**Date:** __________

---

### E. Status Buttons Work ⏳ MANUAL REQUIRED
**Procedure:**
1. [ ] Open a Vendor Order Detail page (should be "Draft" status)
2. [ ] Verify current status badge shows "Draft"
3. [ ] Click "Mark Ready to Place" button
4. [ ] Observe status badge change to "Ready to Place"
5. [ ] Click "Save All Changes" button
6. [ ] Wait for success notification
7. [ ] Refresh the page (F5)
8. [ ] Verify status is still "Ready to Place"
9. [ ] Click "Mark Sent to Vendor" button
10. [ ] Verify status changes to "Sent to Vendor"
11. [ ] Save and refresh again
12. [ ] Confirm final status persists

**Status Transitions to Test:**
- [ ] Draft → Ready to Place
- [ ] Ready to Place → Sent to Vendor
- [ ] Sent to Vendor → Accepted
- [ ] Accepted → In Production
- [ ] In Production → Shipped
- [ ] Shipped → Delivered

**Expected Result:** Status buttons update status immediately and persist after save/refresh

**Actual Result:**
- [ ] Pass: All status transitions work
- [ ] Fail: Status doesn't persist
- [ ] Partial: Some transitions don't work

**Failed Transitions:** __________  
**Error Details:** __________  
**Tester:** __________  
**Date:** __________

---

### F. Tracking Saves ⏳ MANUAL REQUIRED
**Procedure:**
1. [ ] Open a Vendor Order Detail page
2. [ ] Scroll to "Tracking & Shipping" section
3. [ ] Enter Tracking Number: `TEST123456`
4. [ ] Enter Carrier: `Test Carrier`
5. [ ] Enter Tracking URL: `https://tracking.example.com/TEST123456`
6. [ ] Select Ship Date: `2026-06-22`
7. [ ] Select Est. Delivery Date: `2026-06-25`
8. [ ] Verify all fields populated correctly
9. [ ] Click "Save All Changes"
10. [ ] Wait for success notification
11. [ ] Navigate away or refresh the page
12. [ ] Return to the same vendor order
13. [ ] Verify ALL tracking fields still contain correct values

**Expected Result:** All tracking information persists exactly as entered

**Actual Results:**
- Tracking Number: ✅ / ❌ (Expected: TEST123456, Actual: __________)
- Carrier: ✅ / ❌ (Expected: Test Carrier, Actual: __________)
- Tracking URL: ✅ / ❌ (Expected: https://tracking.example.com/TEST123456, Actual: __________)
- Ship Date: ✅ / ❌ (Expected: 2026-06-22, Actual: __________)
- Est. Delivery Date: ✅ / ❌ (Expected: 2026-06-25, Actual: __________)

**Lost/Corrupted Fields:** __________  
**Error Details:** __________  
**Tester:** __________  
**Date:** __________

---

## 🔍 Additional Verification Tests

### Cost Calculation Accuracy
- [ ] Open vendor order with known costs:
  - Blank cost: $2.00/unit
  - Print cost: $1.50/unit
  - Setup: $5.00
  - Shipping: $3.00
  - Qty: 2 units
- [ ] Verify displayed totals:
  - [ ] Blank Total: $4.00 (2×2)
  - [ ] Print Total: $3.00 (1.5×2)
  - [ ] Total Vendor Cost: $15.00 (4+3+5+3)
- [ ] Profit calculation with customer sell price $25:
  - [ ] Est. Profit: $10.00 (25-15)
  - [ ] Margin %: 40% (10/25×100)

**Status:** ✅ Pass / ❌ Fail  
**Discrepancies:** __________  
**Tester:** __________  
**Date:** __________

---

### Margin Badge Colors
- [ ] Low Margin (< 20%): Should show red badge
- [ ] Moderate Margin (20-40%): Should show yellow badge
- [ ] Healthy Margin (> 40%): Should show green badge

**Test Results:**
- [ ] Low margin color: ✅ Red
- [ ] Moderate margin color: ✅ Yellow
- [ ] Healthy margin color: ✅ Green

**Tester:** __________  
**Date:** __________

---

### Responsive Design
- [ ] Desktop (1920×1080): ✅ / ❌
- [ ] Tablet (768×1024): ✅ / ❌
- [ ] Mobile (375×812): ✅ / ❌
- [ ] Print Preview: ✅ / ❌

**Issues Found:** __________  
**Tester:** __________  
**Date:** __________

---

### Navigation Links
- [ ] "Back" button returns to AdminVendorOrders: ✅ / ❌
- [ ] "View Customer Order" button opens customer order detail: ✅ / ❌
- [ ] Vendor Order Tests link accessible from admin menu: ✅ / ❌

**Failed Links:** __________  
**Tester:** __________  
**Date:** __________

---

### Browser Compatibility
- [ ] Chrome (latest): ✅ / ❌
- [ ] Firefox (latest): ✅ / ❌
- [ ] Safari (latest): ✅ / ❌
- [ ] Edge (latest): ✅ / ❌

**Issues by Browser:** __________  
**Tester:** __________  
**Date:** __________

---

## 🐛 Bug Report Template

### Issue Found: __________

**Severity:** Critical / High / Medium / Low  
**Component:** Detail Page / Checklist / Tracking / Print / Other: __________

**Steps to Reproduce:**
1. __________
2. __________
3. __________

**Expected Behavior:**  
__________

**Actual Behavior:**  
__________

**Screenshot/Video:**  
[Attach or describe]

**Browser/Device:**  
__________

**Console Errors:**  
__________

**Suggested Fix:**  
__________

**Tester:** __________  
**Date:** __________

---

## ✨ Sign-Off

### QA Approval

| Test Category | Pass/Fail | Tester | Date |
|---------------|-----------|--------|------|
| Automated Tests (A, B, C, G) | ☐ Pass ☐ Fail | __________ | __________ |
| Manual Tests (D, E, F) | ☐ Pass ☐ Fail | __________ | __________ |
| Cost Calculations | ☐ Pass ☐ Fail | __________ | __________ |
| Responsive Design | ☐ Pass ☐ Fail | __________ | __________ |
| Browser Compatibility | ☐ Pass ☐ Fail | __________ | __________ |
| **OVERALL** | ☐ PASS ☐ FAIL | __________ | __________ |

### Notes

__________

### Approval for Deployment

- [ ] All tests passed — Ready for deployment
- [ ] Tests passed with minor issues — Ready with notes
- [ ] Critical issues found — DO NOT DEPLOY

**QA Manager Signature:** __________  
**Date:** __________

---

## 📞 Support

For questions about test procedures, contact the development team:
- **Lead Developer:** [Name]
- **Technical Lead:** [Name]
- **Product Manager:** [Name]

---

**This checklist should be completed before any vendor order fulfillment system goes live.**