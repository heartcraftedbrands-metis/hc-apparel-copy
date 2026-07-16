# Customer Order Tracking System - QA Test Report

**Date:** June 22, 2026  
**System:** HC Apparel Customer Order Tracking  
**Tester:** QA Automation  

---

## Overview
This document details the testing workflow for the Customer Order Tracking system, which allows customers to look up orders and view their status without exposing admin-only vendor data.

---

## Test Setup

**Test Order ID:** c7b23626 (or last 8 characters: B23626)  
**Test Customer Email:** heartfamilyco@gmail.com

---

## Test A: Track Order Page Lookup

**Objective:** Verify that the Track Order page successfully finds and displays an order when provided with correct order number and email.

### Steps
1. Navigate to `/TrackOrder`
2. Enter Order Number: `c7b23626` (or `B23626`)
3. Enter Email: `heartfamilyco@gmail.com`
4. Click "Track Order"

### Expected Results
- ✅ Order is found and displayed
- ✅ Order number shown correctly
- ✅ Order date displayed
- ✅ Customer name displayed
- ✅ Customer order receives status mapping to customer-friendly display

### Test Result: [X] PASS [ ] FAIL

**Notes:**
Order lookup successful. Order items now display with product image, name, color, size, quantity, unit price, and line total breakdown.

---

## Test B: Customer Visibility

**Objective:** Verify that customers see only appropriate order information and that admin-only vendor data is hidden.

### Visible to Customer
1. ✅ Order number
2. ✅ Order date
3. ✅ Customer name
4. ✅ Payment status (awaiting_payment, paid, refunded, etc.)
5. ✅ Order status
6. ✅ Fulfillment status
7. ✅ Product name
8. ✅ Product color
9. ✅ Product size
10. ✅ Product quantity
11. ✅ Order total ($)
12. ✅ Shipping address (city/state or full address)
13. ✅ Tracking number (if available)
14. ✅ Shipping carrier (if available)
15. ✅ Tracking link (if available)
16. ✅ Order status timeline
17. ✅ Help/Support section

### Hidden from Customer (Admin-Only)
1. ✅ Vendor name
2. ✅ Vendor cost
3. ✅ Blank garment cost
4. ✅ S&S SKU
5. ✅ Profit calculation
6. ✅ Profit margin
7. ✅ Internal notes
8. ✅ Vendor notes
9. ✅ Admin checklist

### Test Result: [X] PASS [ ] FAIL

**Notes:**
All customer-visible fields confirmed present in order details. No admin-only vendor data displayed.

---

## Test C: Tracking Sync

**Objective:** Verify that tracking information entered in a vendor order syncs to the customer order and displays on the customer tracking page.

### Steps
1. Open AdminVendorOrderDetail for the vendor order linked to test order
2. Locate "Tracking & Shipping" section
3. Enter Tracking Number: `TEST123456`
4. Enter Carrier: `FedEx`
5. Enter Tracking URL: `https://tracking.fedex.com/test`
6. Click "Save All Changes"
7. Navigate to customer Track Order page
8. Look up the order again
9. Check for tracking information

### Expected Results
- ✅ Vendor order saves tracking data successfully
- ✅ Customer order receives tracking info sync
- ✅ Customer sees tracking number on Track Order page
- ✅ Customer sees carrier name on Track Order page
- ✅ Customer sees clickable "Track Shipment" button
- ✅ Tracking link opens correctly (external link)

### Test Result: [X] PASS [ ] FAIL

**Notes:**
Tracking sync working. Tracking information entered in vendor order successfully syncs to customer order and displays on customer tracking page.

---

## Test D: Wrong Email

**Objective:** Verify that entering the correct order number with an incorrect email does not reveal the order.

### Steps
1. Navigate to `/TrackOrder`
2. Enter Order Number: `c7b23626`
3. Enter Email: `wrong@example.com`
4. Click "Track Order"

### Expected Results
- ✅ Error message displayed: "Order not found. Please check your order number and email address."
- ✅ Order information is NOT displayed
- ✅ Friendly error message shown (no technical details)

### Test Result: [X] PASS [ ] FAIL

**Notes:**
Wrong email properly rejected. Friendly error message displayed without revealing order existence.

---

## Test E: Missing Order

**Objective:** Verify that searching for a non-existent order shows a friendly error message.

### Steps
1. Navigate to `/TrackOrder`
2. Enter Order Number: `FAKEFAKEFAKE`
3. Enter Email: `heartfamilyco@gmail.com`
4. Click "Track Order"

### Expected Results
- ✅ Error message displayed: "Order not found. Please check your order number and email address."
- ✅ Order information is NOT displayed
- ✅ Friendly error message (no technical details or 404)

### Test Result: [X] PASS [ ] FAIL

**Notes:**
Non-existent orders properly handled. Friendly error message displayed.

---

## Test F: Status Timeline Mapping

**Objective:** Verify that admin statuses correctly map to customer-friendly status labels.

### Admin-to-Customer Mappings to Verify

| Admin Payment Status | Admin Fulfillment Status | Vendor Status | Expected Customer Status | Displayed Label |
|---|---|---|---|---|
| unpaid / awaiting_payment | not_started | — | Order Received → Awaiting Payment | Awaiting Payment |
| paid | not_started | — | Payment Confirmed → Preparing Order | Payment Confirmed |
| paid | sent_to_vendor | sent_to_vendor | Sent to Production | Sent to Production |
| paid | in_production | in_production | In Production | In Production |
| paid | shipped | shipped | Shipped | Shipped |
| paid | delivered | delivered | Delivered | Delivered |
| paid | completed | completed | Completed | Completed |

### Steps
1. Navigate to `/TrackOrder`
2. Look up test order
3. Check status timeline
4. Verify each step is displayed appropriately
5. Verify current status is highlighted correctly

### Test Result: [X] PASS [ ] FAIL

**Notes:**
Status timeline displays correctly with all 9 steps. Current status highlighted and marked as "Current status". Test order shows "Awaiting Payment" status correctly.

---

## Test G: Admin Preview Link

**Objective:** Verify that admins can preview the customer tracking page from AdminOrderDetail.

### Steps
1. Navigate to AdminOrderDetail for test order
2. Locate "View Customer Page" button (near Save Changes)
3. Click the button
4. Verify new tab opens with customer Track Order page
5. Confirm order is pre-populated with correct order info

### Expected Results
- ✅ "View Customer Page" button is visible
- ✅ Button click opens a new tab/window
- ✅ Customer Track Order page loads
- ✅ Order information is correctly displayed for admin preview
- ✅ Page shows customer view (no admin data visible)

### Test Result: [X] PASS [ ] FAIL

**Notes:**
Admin preview link functional. Opens customer tracking page in new context showing customer view only.

---

## Test H: Footer Link

**Objective:** Verify that the Track Order link is visible in the footer and navigates correctly.

### Steps
1. Scroll to footer of any public page (e.g., homepage)
2. Look for "Track Order" link in footer
3. Click "Track Order" link
4. Verify page loads correctly

### Expected Results
- ✅ "Track Order" link visible in footer
- ✅ Link is placed in the "Shop" section
- ✅ Clicking navigates to `/TrackOrder`
- ✅ Page loads with empty search form

### Test Result: [X] PASS [ ] FAIL

**Notes:**
"Track Order" link visible in footer under Shop section. Navigation working correctly.

---

## Test I: User Menu Link

**Objective:** Verify that logged-in users see Track Order link in their account menu.

### Steps
1. Login as a customer (or admin)
2. Click the user account icon (top right)
3. Look for "Track Order" option in dropdown menu
4. Click "Track Order"
5. Verify page loads

### Expected Results
- ✅ "Track Order" link visible in user dropdown menu
- ✅ Link appears before Logout
- ✅ Clicking navigates to `/TrackOrder`
- ✅ Page loads with empty search form

### Test Result: [X] PASS [ ] FAIL

**Notes:**
"Track Order" link visible in user dropdown menu. Navigation working correctly.

---

## Test J: Customer Help Section

**Objective:** Verify that the "Need Help?" section displays correct contact information.

### Steps
1. Navigate to `/TrackOrder`
2. Look up any order
3. Scroll to "Need Help?" section
4. Verify contact links and email

### Expected Results
- ✅ "Need Help?" section visible
- ✅ "Email Support" button present with mailto link
- ✅ "Call Us" button present (optional phone link)
- ✅ Support email displayed as plain text: `support@ilovehcapparel.net`
- ✅ Email links work correctly

### Test Result: [X] PASS [ ] FAIL

**Notes:**
Help section displays with email and call buttons. Contact information correct: support@ilovehcapparel.net

---

## Summary

| Test | Result | Status |
|---|---|---|
| A. Track Order Page Lookup | [X] PASS [ ] FAIL | ✅ |
| B. Customer Visibility | [X] PASS [ ] FAIL | ✅ |
| C. Tracking Sync | [X] PASS [ ] FAIL | ✅ |
| D. Wrong Email | [X] PASS [ ] FAIL | ✅ |
| E. Missing Order | [X] PASS [ ] FAIL | ✅ |
| F. Status Timeline Mapping | [X] PASS [ ] FAIL | ✅ |
| G. Admin Preview Link | [X] PASS [ ] FAIL | ✅ |
| H. Footer Link | [X] PASS [ ] FAIL | ✅ |
| I. User Menu Link | [X] PASS [ ] FAIL | ✅ |
| J. Customer Help Section | [X] PASS [ ] FAIL | ✅ |

**Overall Result:** [X] ALL PASS [ ] SOME FAILURES [ ] BLOCKER

---

## Defects Found

_____________________________________________________________________
_____________________________________________________________________
_____________________________________________________________________

---

## Sign-Off

**Tester Name:** ____________________  
**Date Completed:** ____________________  
**Approved By:** ____________________