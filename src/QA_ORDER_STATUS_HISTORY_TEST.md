# Order Status History System - QA Test Report

**Date:** June 22, 2026  
**System:** HC Apparel Order Status History  
**Test Order:** #C7B23626  
**Test Email:** heartfamilyco@gmail.com  

---

## Overview
This document details the testing workflow for the Order Status History system, which creates a timeline of order progress for both admins and customers.

---

## Test A: Manual Status Update (Admin)

**Objective:** Verify that admins can manually add a status update to the order history.

### Steps
1. Navigate to AdminOrderDetail for order #C7B23626
2. Scroll to "Order History" section
3. Click "Add Status Update" button
4. Fill form:
   - Status Title: `Test Update`
   - Customer Message: `This is a test customer-visible update.`
   - Customer Visible: ✓ (checked)
5. Click "Add Update"

### Expected Results
- ✅ Status update saves successfully
- ✅ Toast message: "Status update added"
- ✅ New entry appears in Order History list
- ✅ Entry shows: date/time, status title, customer message
- ✅ "Customer Visible" badge displayed

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test B: Customer Timeline Visibility

**Objective:** Verify that manual status updates appear on customer Track Order page.

### Steps
1. Open Track Order page
2. Enter Order Number: `c7b23626`
3. Enter Email: `heartfamilyco@gmail.com`
4. Click "Track Order"
5. Scroll to "Status Timeline" section

### Expected Results
- ✅ "Status Timeline" section visible
- ✅ "Test Update" entry appears in timeline
- ✅ Timeline shows customer message: "This is a test customer-visible update."
- ✅ Timeline shows date/time of update
- ✅ Current update is marked with green checkmark icon
- ✅ Status entries flow from top to bottom (newest first in list, or oldest first visually)

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test C: Admin-Only Status Update

**Objective:** Verify that admin-only updates do not appear on customer Track Order page.

### Steps
1. Navigate to AdminOrderDetail for order #C7B23626
2. Click "Add Status Update"
3. Fill form:
   - Status Title: `Internal Review`
   - Admin Note: `This should not show to customer.`
   - Customer Visible: ☐ (unchecked)
4. Click "Add Update"
5. Open Track Order page again
6. Search for order #C7B23626 with email

### Expected Results
- ✅ Status update saves with "Customer Visible" = false
- ✅ "Internal Review" appears in AdminOrderDetail Order History
- ✅ "Internal Review" does NOT appear on customer Track Order page
- ✅ Customer timeline still shows "Test Update" (previous entry)
- ✅ Admin note visible only in AdminOrderDetail

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test D: Payment Confirmed Update

**Objective:** Verify that marking payment as Paid creates appropriate status history entries.

### Steps
1. Navigate to AdminOrderDetail for order #C7B23626
2. Locate "Payment" section
3. Change Payment Status to "Paid"
4. Click "Mark Paid" button or select from dropdown
5. Save changes
6. Scroll to "Order History" section
7. Check for Payment Confirmed entry

### Expected Results
- ✅ Order updates to "Paid" status
- ✅ Order History shows a "Payment Confirmed" entry (if automation triggers)
- ✅ OR manual entry needs to be added for payment confirmation
- ✅ Entry visible on Track Order page (customer visible)
- ✅ Customer message appropriate (e.g., "Your payment has been confirmed")

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test E: Order History Admin-Only Fields

**Objective:** Verify that admin cannot see customer's sensitive data in the history.

### Steps
1. In AdminOrderDetail Order History
2. Review all entries for sensitive information

### Expected Results
- ✅ Admin sees Status Title
- ✅ Admin sees Status Type (payment, order, fulfillment, etc.)
- ✅ Admin sees Customer Message
- ✅ Admin sees Admin Note (internal)
- ✅ Admin sees Created By (admin, system, customer)
- ✅ Admin sees Customer Visible badge
- ✅ NO vendor cost visible
- ✅ NO profit visible
- ✅ NO margin visible
- ✅ NO S&S SKU visible

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test F: Timeline Order and Dates

**Objective:** Verify that status updates are displayed in correct chronological order.

### Steps
1. In AdminOrderDetail, add 3 status updates with different dates:
   - First: "Order Received" (oldest)
   - Second: "Awaiting Payment" (middle)
   - Third: "Preparing Order" (newest)
2. Review order history list
3. Go to Track Order page
4. Verify timeline order

### Expected Results
- ✅ Newest entry appears first in admin list (or oldest first, consistent)
- ✅ Track Order timeline shows logical progression
- ✅ Dates are formatted clearly (MMM d, yyyy h:mm a)
- ✅ Customers see same chronological order

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test G: Empty History State

**Objective:** Verify that orders without history still display properly.

### Steps
1. Create a new test order (or use one with no status updates)
2. Open Track Order page
3. Search for the order

### Expected Results
- ✅ Track Order page loads without errors
- ✅ If no history entries: fallback timeline displays (STATUS_TIMELINE defaults)
- ✅ OR appropriate message: "No status updates yet"
- ✅ No customer-visible information is hidden or broken

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test H: Order History Data Integrity

**Objective:** Verify that status updates include all required fields.

### Steps
1. Add a manual status update with all fields filled
2. Check OrderStatusHistory in database (via AdminOrderDetail list)
3. Verify all required fields are present

### Expected Results
- ✅ Order ID stored
- ✅ Order Number stored
- ✅ Status Title stored
- ✅ Status Type = "manual" (for manually added updates)
- ✅ Customer Message stored
- ✅ Admin Note stored
- ✅ Customer Visible flag stored (true/false)
- ✅ Created By = "admin"
- ✅ Created Date stored (timestamp)

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Summary

| Test | Result | Status |
|---|---|---|
| A. Manual Status Update | [ ] PASS [ ] FAIL | — |
| B. Customer Timeline Visibility | [ ] PASS [ ] FAIL | — |
| C. Admin-Only Update | [ ] PASS [ ] FAIL | — |
| D. Payment Confirmed Update | [ ] PASS [ ] FAIL | — |
| E. Order History Admin Fields | [ ] PASS [ ] FAIL | — |
| F. Timeline Order and Dates | [ ] PASS [ ] FAIL | — |
| G. Empty History State | [ ] PASS [ ] FAIL | — |
| H. Data Integrity | [ ] PASS [ ] FAIL | — |

**Total Tests:** 8  
**Passed:** [ ]  
**Failed:** [ ]  
**Critical Issues:** [ ] None [ ] Blocker Found  

**Overall Result:** [ ] ALL PASS [ ] SOME FAILURES [ ] BLOCKER

---

## Defects Found

_____________________________________________________________________
_____________________________________________________________________

---

## Sign-Off

**Tester Name:** ____________________  
**Date Completed:** ____________________  
**Approved By:** ____________________