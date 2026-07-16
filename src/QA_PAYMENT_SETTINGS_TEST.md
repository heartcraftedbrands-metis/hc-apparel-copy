# Payment Settings Test Report

**Test Date:** 2026-06-22  
**Tested By:** QA  
**Status:** Ready for Testing

---

## A. Payment Settings Test

### A1. Open Payment Settings
- [ ] Navigate to Admin Dashboard → Payment Settings menu
- [ ] Payment Settings page loads without errors

### A2. Verify Default Configuration
- [ ] Default payment mode is: **Manual Payment / Invoice**
- [ ] Stripe status shows: **Not Connected**
- [ ] Test Mode is: **Off**
- [ ] Invoice Instructions field is visible (empty or with text)
- [ ] Payment Notes (Customer Visible) field is visible
- [ ] Internal Payment Notes field is visible

### A3. Verify Payment Modes Available
- [ ] Can select: Demo / Test Mode
- [ ] Can select: Manual Payment / Invoice (default)
- [ ] Can select: Pay Later
- [ ] Can select: Stripe Checkout (shows "Not Connected")

### A4. Save Payment Settings
- [ ] Change payment mode to "Demo / Test Mode"
- [ ] Click "Save Payment Settings"
- [ ] Toast shows: "Payment settings saved!"
- [ ] Navigate away and return
- [ ] Demo mode is still selected (persisted)

---

## B. Checkout Test (Manual Payment Mode)

### B1. Prepare Cart
- [ ] Add "Bella + Canvas 0990" to cart (or any available product)
- [ ] Set Color: Deep Heather (or available color)
- [ ] Set Size: S (or available size)
- [ ] Set Qty: 1
- [ ] Cart shows 1 item

### B2. Proceed to Checkout
- [ ] Click "Checkout" button
- [ ] Checkout page loads (Step 1: Contact & Shipping)
- [ ] No 404 errors in console

### B3. Fill Contact & Shipping Info
- [ ] Enter Name: "Test Customer"
- [ ] Enter Email: "test@example.com"
- [ ] Enter Street: "123 Test St"
- [ ] Enter City: "Test City"
- [ ] Enter State: "NY"
- [ ] Enter ZIP: "10001"
- [ ] Click "Continue to Payment"

### B4. Select Payment Method
- [ ] Step 2: Payment displays
- [ ] Payment method options are visible:
  - Test Payment (Demo)
  - Pay Later / Invoice
  - Manual Payment
- [ ] Select "Manual Payment"
- [ ] Click "Place Order"

### B5. Verify Order Creation
- [ ] No errors displayed
- [ ] Order is created (takes 2-5 seconds)
- [ ] Cart clears (empty cart message appears)

### B6. Verify Order Confirmation Page
- [ ] Order Confirmation page loads (stays visible, not redirected)
- [ ] Order ID displays: `Order #XXXXXXXX`
- [ ] **Payment Status Message shows:**
  - "Your order has been received."
  - "HC Apparel will review it and send payment instructions to test@example.com"
- [ ] Customer Information section shows:
  - Name: Test Customer
  - Email: test@example.com
  - Order Date
- [ ] Order Status section shows:
  - Payment Status: **Awaiting Payment**
  - Order Status: Awaiting Payment
  - Fulfillment Status: Not Started
- [ ] Order Items section shows:
  - Product name
  - Color: Deep Heather
  - Size: S
  - Qty: 1
  - Price (calculated correctly)
- [ ] Order Total shows correct amount
- [ ] "Continue Shopping" button is clickable

---

## C. Customer Order Test

### C1. Open Customer Orders
- [ ] Navigate to Admin Dashboard → Orders
- [ ] Customer Orders page loads

### C2. Find Test Order
- [ ] Find order with customer "Test Customer"
- [ ] Click "View Details" or the order row
- [ ] Order detail page opens

### C3. Verify Order Data Persistence
- [ ] Order displays all entered data:
  - [ ] Customer Name: "Test Customer"
  - [ ] Email: "test@example.com"
  - [ ] Shipping Address: 123 Test St, Test City, NY 10001
- [ ] Order Items section shows:
  - [ ] Product Name: "Bella + Canvas 0990" (or product name)
  - [ ] Color: "Deep Heather"
  - [ ] Size: "S"
  - [ ] Quantity: 1
  - [ ] Price: Correct (total_amount in order)
- [ ] Order Total matches what was entered

### C4. Verify Payment Status
- [ ] Payment Status shows: **Awaiting Payment**
- [ ] Order Status shows: **Awaiting Payment**
- [ ] Fulfillment Status shows: **Not Started**

---

## D. Admin Payment Update Test

### D1. Open Order Detail
- [ ] Click on the test order to open detail page
- [ ] Admin Order Detail page loads (sticky header + left/right columns)

### D2. Locate Payment Section
- [ ] Right column shows "Payment" section (blue background, "Admin Only" label)
- [ ] Payment Status dropdown visible
- [ ] Payment Method input visible
- [ ] Payment Date input visible
- [ ] Payment Notes textarea visible

### D3. Update Payment Status to Paid
- [ ] Click "Mark Paid" button (green button with $ icon)
- [ ] Toast shows: "Payment status changed to paid"
- [ ] Payment Status dropdown now shows: **Paid**
- [ ] Amount Paid updates to: order total
- [ ] Payment Date auto-fills to today's date

### D4. Verify Persistence
- [ ] Refresh the page (F5)
- [ ] Order re-loads
- [ ] Payment Status still shows: **Paid**
- [ ] Amount Paid persists
- [ ] Payment Date persists

### D5. Test Other Payment Status Changes
- [ ] Click "Awaiting" button
- [ ] Payment Status changes to: **Awaiting Payment**
- [ ] Click "Partial" button
- [ ] Payment Status changes to: **Partially Paid**
- [ ] Click "Refund" button
- [ ] Payment Status changes to: **Refunded**
- [ ] All changes persist after refresh

### D6. Test Payment Notes
- [ ] In Payment Notes textarea, type: "Customer called to confirm - payment received via wire transfer"
- [ ] Click "Save Changes" button
- [ ] Toast shows: "Order saved"
- [ ] Refresh page
- [ ] Payment Notes text persists

---

## E. Demo Mode Test (Optional)

### E1. Change to Demo Mode
- [ ] Open Payment Settings
- [ ] Change payment mode to "Demo / Test Mode"
- [ ] Save settings

### E2. Place Demo Order
- [ ] Go to shop, add product to cart
- [ ] Proceed to checkout
- [ ] Fill info, continue to payment
- [ ] Select "Test Payment (Demo)"
- [ ] Click "Place Order"

### E3. Verify Demo Order Message
- [ ] Order Confirmation page displays:
  - **Blue banner:** "Demo Order: This is a demo order. Payment has not been collected."
- [ ] Payment Status in order: **Demo**

---

## F. Pay Later Mode Test (Optional)

### F1. Change to Pay Later Mode
- [ ] Open Payment Settings
- [ ] Change payment mode to "Pay Later"
- [ ] Save settings

### F2. Place Pay Later Order
- [ ] Go to shop, add product to cart
- [ ] Proceed to checkout
- [ ] Fill info, continue to payment
- [ ] Select "Pay Later / Invoice"
- [ ] Click "Place Order"

### F3. Verify Pay Later Order Message
- [ ] Order Confirmation page displays:
  - **Cyan banner:** "Payment Due Later. Your order is confirmed. You can pay at a later time."
- [ ] Payment Status in order: **Pay Later**

---

## Test Results Summary

| Test | Status | Notes |
|------|--------|-------|
| A1: Open Payment Settings | ⬜ | |
| A2: Verify Default Config | ⬜ | |
| A3: Payment Modes Available | ⬜ | |
| A4: Save Settings | ⬜ | |
| B1: Prepare Cart | ⬜ | |
| B2: Checkout Page Loads | ⬜ | |
| B3: Fill Contact Info | ⬜ | |
| B4: Select Payment Method | ⬜ | |
| B5: Order Creation | ⬜ | |
| B6: Confirmation Page | ⬜ | |
| C1: Open Orders | ⬜ | |
| C2: Find Test Order | ⬜ | |
| C3: Data Persistence | ⬜ | |
| C4: Payment Status | ⬜ | |
| D1: Order Detail | ⬜ | |
| D2: Payment Section | ⬜ | |
| D3: Mark Paid | ⬜ | |
| D4: Persistence | ⬜ | |
| D5: Status Changes | ⬜ | |
| D6: Payment Notes | ⬜ | |
| E1-E3: Demo Mode | ⬜ | Optional |
| F1-F3: Pay Later Mode | ⬜ | Optional |

---

## Known Issues / Notes

- No real Stripe integration yet (shows "Not Connected" as expected)
- Axios errors are not shown to customers (handled server-side)
- Demo/Pay Later modes require Payment Settings to be saved first

---

## Sign-Off

**Tester:** ________________  
**Date:** ________________  
**Status:** ⬜ PASS | ⬜ FAIL | ⬜ INCOMPLETE