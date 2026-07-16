# Customer Notifications System - QA Test Report

**Date:** June 22, 2026  
**System:** HC Apparel Customer Notifications  
**Test Order:** #C7B23626  
**Test Email:** heartfamilyco@gmail.com  

---

## Overview
This document details testing for the Customer Notifications system, which allows admins to create, manage, and track customer order updates without sending real emails.

---

## Test A: Create Notification Draft

**Objective:** Verify admins can create a custom notification draft from AdminOrderDetail.

### Steps
1. Navigate to AdminOrderDetail for order #C7B23626
2. Scroll to "Customer Notifications" section
3. Click "Create Notification" button
4. Fill form:
   - Notification Type: "Custom Update"
   - Subject: "Test Update"
   - Customer Message: "This is a test notification."
   - Customer Visible: ✓ (checked)
5. Click "Create Notification"

### Expected Results
- ✅ Notification draft saves successfully
- ✅ Toast message: "Notification created"
- ✅ New notification appears in Customer Notifications list
- ✅ Notification shows: subject, type, status "Draft", created date
- ✅ Copy and Delete buttons visible for draft

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test B: Admin-Only Notification

**Objective:** Verify admin-only notifications do not show to customers on Track Order page.

### Steps
1. In AdminOrderDetail, create a notification with:
   - Subject: "Internal Review"
   - Message: "This is for internal use only."
   - Customer Visible: ☐ (unchecked)
2. Save notification
3. Open Track Order page
4. Search for order #C7B23626 with email
5. Scroll to Status Timeline

### Expected Results
- ✅ Notification saves with Customer Visible = false
- ✅ Notification appears in AdminOrderDetail list (shows "Admin only" badge)
- ✅ "Internal Review" does NOT appear on customer Track Order page
- ✅ Customer can only see previous "Test Update" notification

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test C: Copy Notification Message

**Objective:** Verify copy button works for notification message.

### Steps
1. In AdminOrderDetail Customer Notifications section
2. Find the "Test Update" notification
3. Click copy button (clipboard icon)
4. Verify button shows checkmark for 2 seconds

### Expected Results
- ✅ Copy button shows checkmark after click
- ✅ Message text is copied to clipboard (subject + newlines + message)
- ✅ Can paste message: "Test Update\n\nThis is a test notification."
- ✅ Checkmark disappears after 2 seconds

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test D: Mark Notification as Sent

**Objective:** Verify status changes from Draft to Sent when admin marks it.

### Steps
1. In AdminOrderDetail, find a Draft notification
2. Click "Mark Sent" button
3. Observe status change
4. Refresh the page (F5)

### Expected Results
- ✅ Notification status changes to "Sent" immediately
- ✅ Status persists after page refresh
- ✅ sent_date is recorded
- ✅ "Mark Sent" button disappears
- ✅ Copy button still available

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test E: Customer Notification on Track Order Timeline

**Objective:** Verify customer-visible notifications appear in Track Order Status Timeline.

### Steps
1. Open Track Order page
2. Search: Order #C7B23626, Email heartfamilyco@gmail.com
3. Scroll to "Status Timeline" section
4. Verify timeline entries

### Expected Results
- ✅ Customer-visible notifications appear in timeline
- ✅ Notifications show: title, message, date/time
- ✅ Green checkmark icons visible
- ✅ Timeline displays chronologically (oldest to newest OR newest first consistently)
- ✅ Admin-only notifications are NOT visible
- ✅ "Internal Review" notification does not appear

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test F: AdminCustomerNotifications Page

**Objective:** Verify admin dashboard for managing all notifications.

### Steps
1. Navigate to AdminCustomerNotifications page (from admin menu)
2. Verify page loads and shows notifications list
3. Use search to filter by order number or customer name
4. Use status filter (Draft, Sent, etc.)

### Expected Results
- ✅ Page shows all notifications across all orders
- ✅ Stats cards show: Total, Drafts, Sent, Failed counts
- ✅ Notifications table displays: Order #, Customer, Type, Subject, Status, Created date
- ✅ Search filter works by order number/customer/email
- ✅ Status filter works (Draft, Ready, Sent, Failed)
- ✅ Copy button works in table
- ✅ Mark as Sent works
- ✅ Delete draft button works

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test G: Notification Type Accuracy

**Objective:** Verify different notification types are selectable and save correctly.

### Steps
1. Create notifications with each type:
   - Order Received
   - Payment Confirmed
   - Shipped
   - Delivered
2. Verify each saves with correct type

### Expected Results
- ✅ All notification types available in dropdown
- ✅ Each type saves correctly
- ✅ Type displays in notification list/table
- ✅ Type matches selected value

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test H: Support Contact Info

**Objective:** Verify support contact box appears on Track Order page.

### Steps
1. Open Track Order page
2. Scroll to bottom

### Expected Results
- ✅ "Need help with this order?" section visible
- ✅ Support email link displays: support@ilovehcapparel.net
- ✅ Email link is clickable (opens mail client)
- ✅ Formatted clearly with blue background

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Test I: Notification Data Integrity

**Objective:** Verify all notification fields save and persist correctly.

### Steps
1. Create notification with all fields:
   - Type: Custom Update
   - Subject: "Full Test"
   - Message: "Testing all fields"
   - Admin Note: "Internal note"
   - Customer Visible: ✓
2. Refresh page
3. Check notification persists with exact same data

### Expected Results
- ✅ order_id saved correctly
- ✅ order_number saved correctly
- ✅ customer_name saved correctly
- ✅ customer_email saved correctly
- ✅ notification_type saved correctly
- ✅ subject saved correctly
- ✅ customer_message saved correctly
- ✅ customer_visible flag saved correctly
- ✅ admin_note saved correctly
- ✅ sent_status = "draft" by default
- ✅ created_date recorded
- ✅ auto_generated = false for manual

### Test Result: [ ] PASS [ ] FAIL

**Notes:**
_____________________________________________________________________

---

## Summary

| Test | Result | Status |
|---|---|---|
| A. Create Notification Draft | [ ] PASS [ ] FAIL | — |
| B. Admin-Only Notification | [ ] PASS [ ] FAIL | — |
| C. Copy Notification Message | [ ] PASS [ ] FAIL | — |
| D. Mark Notification as Sent | [ ] PASS [ ] FAIL | — |
| E. Customer Timeline Visibility | [ ] PASS [ ] FAIL | — |
| F. AdminCustomerNotifications Page | [ ] PASS [ ] FAIL | — |
| G. Notification Type Accuracy | [ ] PASS [ ] FAIL | — |
| H. Support Contact Info | [ ] PASS [ ] FAIL | — |
| I. Notification Data Integrity | [ ] PASS [ ] FAIL | — |

**Total Tests:** 9  
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