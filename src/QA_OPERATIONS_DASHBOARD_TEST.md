# Operations Dashboard - System Test Report

**Date:** June 22, 2026  
**System:** HC Apparel Operations Dashboard  
**Admin User:** test admin  
**Test Data:** Existing records including order #C7B23626  

---

## Overview
This document details testing for the Operations Dashboard, a consolidated admin view for monitoring daily operations, action items, financial status, and fulfillment metrics.

---

## Test A: Dashboard Page Loads

**Objective:** Verify Operations Dashboard loads without errors and displays all main sections.

### Steps
1. Log in as admin user
2. Navigate to Admin menu dropdown
3. Click "Operations Dashboard"
4. Wait for page to fully load

### Expected Results
- ✅ Page loads successfully without 404 or errors
- ✅ Header displays: "Operations Dashboard" + "Real-time overview of what needs attention"
- ✅ Period filter dropdown visible (Today, This Week, This Month, All Time)
- ✅ Six quick action buttons visible:
  - View Customer Orders
  - View Vendor Orders
  - View Quote Requests
  - View Notifications
  - View S&S Catalog
  - View Payment Settings
- ✅ All sections render:
  - Today's Snapshot (cards)
  - Action Needed Queue
  - Fulfillment Snapshot
  - Quote Snapshot
  - Notification Snapshot
  - Recent Activity (if events exist)
  - Financial Snapshot
- ✅ No console errors

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test B: Today's Snapshot Cards Display Correct Data

**Objective:** Verify snapshot cards populate with correct counts from existing data.

### Steps
1. Open Operations Dashboard with period filter set to "Today"
2. Verify each card shows the expected count:

   **Card Values to Check:**
   - New Orders: Count of orders created today
   - Awaiting Payment: Count of orders with payment_status = unpaid/awaiting_payment
   - Ready for Fulfillment: Count of paid orders with fulfillment_status = not_started
   - Vendor Orders (Draft): Count of VendorOrders with status = draft
   - Ready to Place: Count with status = ready_to_place
   - In Production: Count with status = in_production
   - Shipped: Count with status = shipped
   - New Quote Requests: Count of QuoteRequests with status = new
   - Notification Drafts: Count with sent_status = draft
   - Low Margin Orders: Count with profit_margin_pct < 15%
   - Out of Stock (S&S): Count with inventory_qty = 0 and catalog_status = added_to_shop

### Expected Results
- ✅ All 11 cards display without errors
- ✅ Counts match actual database records
- ✅ Test order #C7B23626 is counted correctly in relevant cards (e.g., Awaiting Payment if unpaid, or Ready for Fulfillment if paid)
- ✅ Cards show appropriate icons and colors
- ✅ No negative numbers displayed

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test C: Period Filter Works (Today/Week/Month/All)

**Objective:** Verify period filter correctly adjusts data shown.

### Steps
1. Open Dashboard with "Today" filter selected
2. Note counts on snapshot cards
3. Change filter to "This Week"
4. Verify counts increase or stay same (should not decrease)
5. Change to "This Month"
6. Verify counts reflect monthly data
7. Change to "All Time"
8. Verify counts are comprehensive

### Expected Results
- ✅ Filter dropdown works without errors
- ✅ Snapshot cards update when filter changes
- ✅ Date-based sections (New Orders, New Quotes) filter correctly by created_date
- ✅ Period change is immediate (no page reload needed)
- ✅ Filter persists across page interactions

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test D: Vendor Orders Appear in Fulfillment Snapshot

**Objective:** Verify vendor order status breakdown is accurate.

### Steps
1. Open Dashboard with "All Time" filter
2. Navigate to "Fulfillment Snapshot" section
3. Verify each status row shows:
   - Not Started: Orders needing fulfillment
   - Created: Draft + Ready to Place vendor orders
   - Sent to Vendor: status = sent_to_vendor
   - In Production: status = in_production
   - Shipped: status = shipped
   - Delivered: status = delivered

### Expected Results
- ✅ All 6 fulfillment status cards display
- ✅ Counts match actual VendorOrder records by status
- ✅ Totals are logical (should add up reasonably)
- ✅ Cards show correct color coding

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test E: Quote Requests Appear in Quote Snapshot

**Objective:** Verify quote request status breakdown is accurate.

### Steps
1. Open Dashboard
2. Navigate to "Quote Snapshot" section
3. Verify each card shows count for status:
   - New
   - Reviewing
   - Waiting Vendor
   - Quote Sent
   - Approved
   - Converted

### Expected Results
- ✅ All 6 quote status cards display
- ✅ Counts match QuoteRequest records by status
- ✅ New quote requests from test data appear correctly
- ✅ Color coding is consistent

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test F: Notification Drafts Appear in Notification Snapshot

**Objective:** Verify customer notification status breakdown is accurate.

### Steps
1. Open Dashboard
2. Navigate to "Notification Snapshot" section
3. Verify each card shows:
   - Draft: sent_status = draft
   - Ready to Send: sent_status = ready_to_send
   - Sent: sent_status = sent
   - Failed: sent_status = failed

### Expected Results
- ✅ All 4 notification status cards display
- ✅ Draft count reflects unsent notifications
- ✅ Test notifications from previous tests appear in correct status
- ✅ Counts are accurate

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test G: Low Margin Vendor Order Appears in Action Needed Queue

**Objective:** Verify action queue prioritizes and displays low-margin orders.

### Steps
1. Open Dashboard with "All Time" filter
2. Navigate to "Action Needed Queue" section
3. Look for vendor orders with profit_margin_pct < 15%
4. Verify each low-margin order appears as an action item

### Expected Results
- ✅ Low margin orders appear in action queue
- ✅ Each item shows:
  - Priority badge (LOW for margin items)
  - Type: "Vendor Order"
  - Title with order ID
  - Reason: "Only X.X% margin"
  - Status badge
  - View button links to AdminVendorOrderDetail
- ✅ Items are ordered by priority (HIGH items first)
- ✅ "View" button navigates to correct order detail page

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test H: Action Queue Includes Multiple Item Types

**Objective:** Verify action queue displays all required priority items.

### Steps
1. Open Dashboard with "All Time" filter
2. Examine "Action Needed Queue" for items with:

   **HIGH Priority Items:**
   - Orders awaiting payment
   - Paid orders needing vendor order creation
   - Vendor orders marked Issue/Hold

   **MEDIUM Priority Items:**
   - Vendor orders in Draft (ready to place)
   - Quote requests with status = new
   - Quote requests = waiting_on_vendor

   **LOW Priority Items:**
   - Notification drafts
   - Low margin orders

### Expected Results
- ✅ Action queue displays prioritized items
- ✅ HIGH priority items appear first
- ✅ Each item includes:
  - Colored priority badge (Red=HIGH, Orange=MEDIUM, Blue=LOW)
  - Status badge
  - Type label (Order, Vendor Order, Quote Request, etc.)
  - Customer name (if applicable)
  - Reason for action needed
  - View button
- ✅ No duplicates in action queue
- ✅ Queue handles empty state gracefully if no action items

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test I: Quick Action Buttons Navigate Correctly

**Objective:** Verify all quick action buttons link to correct admin pages.

### Steps
1. Open Dashboard
2. Test each quick action button:
   - Click "View Customer Orders" → should go to /AdminOrders
   - Click "View Vendor Orders" → should go to /AdminVendorOrders
   - Click "View Quote Requests" → should go to /AdminQuoteRequests
   - Click "View Notifications" → should go to /AdminCustomerNotifications
   - Click "View S&S Catalog" → should go to /AdminSSCatalog
   - Click "View Payment Settings" → should go to /AdminPaymentSettings
3. Verify each page loads correctly

### Expected Results
- ✅ All 6 buttons are visible and clickable
- ✅ Each button navigates to correct page
- ✅ Destination pages load without errors
- ✅ Navigation history allows back button to return to dashboard

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test J: Financial Snapshot Calculations are Accurate

**Objective:** Verify money snapshot cards show correct totals.

### Steps
1. Open Dashboard
2. Navigate to "Financial Snapshot" section
3. Verify each card:
   - **Total Revenue:** Sum of all order total_amount values
   - **Awaiting Payment:** Sum of orders with payment_status = unpaid/awaiting_payment
   - **Paid Total:** Sum of orders with payment_status = paid
   - **Est. Vendor Costs:** Sum of (blank_garment_cost + print_cost + setup_fee + shipping_cost) for all VendorOrders
   - **Est. Profit:** Paid Total - Est. Vendor Costs

4. Manually verify sample calculation:
   - If Paid Total = $5,000 and Est. Vendor Costs = $2,000
   - Expected Profit = $3,000

### Expected Results
- ✅ All 5 financial cards display
- ✅ Total Revenue matches sum of all order amounts
- ✅ Awaiting Payment shows only unpaid/awaiting orders
- ✅ Paid Total reflects paid orders only
- ✅ Vendor Costs calculation includes all fee types
- ✅ Profit = Paid - Costs (basic math correct)
- ✅ Profit color changes red if negative, green if positive
- ✅ Dollar amounts formatted with commas and .00

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test K: Recent Activity Section Populates Correctly

**Objective:** Verify recent activity feed displays latest events.

### Steps
1. Open Dashboard
2. Scroll to "Recent Activity" section (if visible)
3. Verify activity items are present for:
   - New orders (up to 3 most recent)
   - New vendor orders (up to 3 most recent)
   - New notifications (up to 2 most recent)

### Expected Results
- ✅ Recent Activity section displays (if events exist)
- ✅ Each activity shows:
  - Appropriate icon (Package, Truck, MessageSquare)
  - Activity type label
  - Description with relevant details
  - Timestamp in human-readable format
- ✅ Activities are sorted by most recent first
- ✅ Max 10 activities shown
- ✅ Empty state if no recent events

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test L: Dashboard is Admin-Only

**Objective:** Verify dashboard cannot be accessed by non-admin users.

### Steps
1. Log in as non-admin/customer user
2. Attempt to navigate to /AdminOperationsDashboard
3. OR attempt to access via clicking admin menu (should not be visible)

### Expected Results
- ✅ Non-admin cannot access dashboard
- ✅ Either:
  - Redirects to home page, OR
  - Shows 403 Forbidden error, OR
  - Admin menu items not visible to non-admins
- ✅ No sensitive admin data exposed

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test M: Dashboard Loads Existing Test Data

**Objective:** Verify dashboard correctly displays test order #C7B23626 in relevant sections.

### Steps
1. Verify order #C7B23626 exists in database
2. Check its status fields:
   - payment_status
   - fulfillment_status
   - If it's a vendor order test, check vendor order status
3. Open Dashboard with "All Time" filter
4. Look for order #C7B23626 in relevant snapshot cards and action queue

### Expected Results
- ✅ Order #C7B23626 appears in:
  - Today's Snapshot (if date matches filter)
  - Action Needed Queue (if payment awaiting or needs fulfillment)
  - Fulfillment Snapshot (if vendor order created)
- ✅ Order displays correct status in all sections
- ✅ If payment is awaiting, appears in "Awaiting Payment" card and action queue
- ✅ If ready for fulfillment, appears in "Ready for Fulfillment" card
- ✅ Clicking "View" on order action item navigates to AdminOrderDetail for correct order

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Summary

| Test | Result | Status |
|---|---|---|
| A. Dashboard Page Loads | [ ] PASS [ ] FAIL | — |
| B. Snapshot Cards Display Correct Data | [ ] PASS [ ] FAIL | — |
| C. Period Filter Works | [ ] PASS [ ] FAIL | — |
| D. Vendor Orders in Fulfillment Snapshot | [ ] PASS [ ] FAIL | — |
| E. Quote Requests in Quote Snapshot | [ ] PASS [ ] FAIL | — |
| F. Notification Drafts in Snapshot | [ ] PASS [ ] FAIL | — |
| G. Low Margin Vendor Order in Action Queue | [ ] PASS [ ] FAIL | — |
| H. Action Queue Includes All Item Types | [ ] PASS [ ] FAIL | — |
| I. Quick Action Buttons Navigate Correctly | [ ] PASS [ ] FAIL | — |
| J. Financial Snapshot Calculations Accurate | [ ] PASS [ ] FAIL | — |
| K. Recent Activity Section Populates | [ ] PASS [ ] FAIL | — |
| L. Dashboard is Admin-Only | [ ] PASS [ ] FAIL | — |
| M. Dashboard Loads Test Data (#C7B23626) | [ ] PASS [ ] FAIL | — |

**Total Tests:** 13  
**Passed:** [ ]  
**Failed:** [ ]  
**Critical Issues:** [ ] None [ ] Blocker Found  

**Overall Result:** [ ] ALL PASS [ ] SOME FAILURES [ ] BLOCKER

---

## Test Execution Notes

### Environment
- Browser: __________________
- Resolution: __________________
- Test User Email: __________________

### Test Data Used
- Order #C7B23626 Status: __________________
- Vendor Orders Available: __________________
- Quote Requests Available: __________________
- Notifications Created: __________________

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
**Release Ready:** [ ] YES [ ] NO [ ] CONDITIONAL