# HC Apparel Payment System - Stripe + PayPal Only

## Overview
HC Apparel checkout now only supports **Stripe** and **PayPal** online payments. All payment processing fees are **embedded into advertised product prices** — customers never see separate fees.

## Architecture

### Payment Methods
1. **Stripe** (Primary)
   - Card payments
   - Apple Pay
   - Google Pay
   - Status: Test mode active (demo enabled)

2. **PayPal** (Fallback)
   - PayPal account
   - PayPal Balance
   - Status: Placeholder ready (integration coming)

### Removed Payment Options
- Manual payment / bank transfer
- Pay later by email
- Payment instructions
- ACH
- Any delayed payment method

## Fee Structure

### Payment Fee Settings (Editable Admin)
Located at `/AdminPaymentFeeSettings`:

```
Stripe Fee Buffer:
  - Percentage: 3.5% (default)
  - Fixed: $0.50 (default)

PayPal Fee Buffer:
  - Percentage: 4.0% (default)
  - Fixed: $0.50 (default)

Extra Profit Buffer: 0% (optional, default)

Price Rounding: Nearest $X.99 (default)
```

### Price Calculation Formula
```
Final Customer Price = 
  (Blank Cost + Base Markup) × (1 + (Fee% + Profit%)) + Fixed Fee
  → Rounded per admin rule
```

**Example:**
- Blank cost: $8.00
- Base markup: $4.00
- Subtotal: $12.00
- Stripe fee buffer (3.5% + $0.50): +$0.92
- **Final advertised price: $12.99**

*Stripe processing cost (~2.2% + $0.30) is automatically covered by the $0.92 fee buffer.*

## Implementation Details

### Frontend

#### Checkout Page (`pages/Checkout`)
- Displays only Stripe and PayPal options
- Shows availability status for each payment method
- Handles payment method validation
- Creates order with `payment_status = "awaiting_payment"` before redirect
- Redirects to Stripe Checkout or PayPal (when ready)

#### Track Order Page (`pages/TrackOrder`)
- Shows "Awaiting Payment" status for unpaid orders
- Hides balance due for paid orders
- Shows "Payment Received" when `payment_status = 'paid'`
- Timeline progresses through fulfillment once payment is confirmed

#### Price Display
- Product prices shown are final customer prices (fees embedded)
- No separate processing fee shown anywhere
- Admin-only views show fee breakdown

### Backend

#### Order Creation (`functions/createOrder`)
- Accepts order data with `payment_status` field
- Sets `payment_status = "awaiting_payment"` for online payment orders
- Creates order before payment processing

#### Stripe Checkout Session (`functions/createStripeCheckoutSession`)
- Creates Stripe Checkout session
- Stores `stripe_session_id` on order
- Redirects customer to Stripe-hosted checkout

#### Payment Verification (`functions/verifyStripePayment`)
- Called from OrderConfirmation page
- Checks Stripe session status
- On successful payment:
  - `payment_status = "paid"`
  - `payment_method = "Stripe"`
  - `amount_paid = order_total`
  - `balance_due = 0`
  - `fulfillment_status = "awaiting_fulfillment"`

#### Fee Settings Initialization (`functions/ensurePaymentFeeSettings`)
- Automatically creates default PaymentFeeSettings if none exist
- Can be called on app startup

### Admin Dashboard

#### Payment Provider Status
- Shows Stripe: Test/Live mode
- Shows PayPal: Status (placeholder)
- Shows when each payment method is ready

#### AdminPaymentFeeSettings Page
- Full UI for editing all fee buffers
- Real-time updates to stored settings
- Automatically applied to new orders

#### Order Detail Pages
- Shows payment method used
- Shows payment status progression
- Shows Stripe/PayPal transaction IDs
- Shows amount paid vs balance due

## Testing Checklist

```
✓ Open Shop Garments
✓ Advertised prices show final customer prices (no separate fee)
✓ Add product to cart
✓ Open Checkout
✓ Only Stripe and PayPal options visible
✓ No manual payment option
✓ No bank transfer wording
✓ Select Stripe payment
✓ Complete test card (4242 4242 4242 4242)
✓ Order marked as Paid immediately
✓ Order moves to Awaiting Fulfillment
✓ Track Order shows Paid status
✓ No duplicate orders created
✓ Launch QA shows Ready for Monday
```

## Stripe Test Mode

**Test Card:** `4242 4242 4242 4242`
**Expiry:** Any future date
**CVC:** Any 3 digits

Admin only: Yellow banner shows during Stripe test mode

## Configuration

### PaymentSettings Entity (Legacy)
⚠️ Deprecated. Use `PaymentFeeSettings` for all fee configuration.

### PaymentFeeSettings Entity (Active)
- `stripe_fee_buffer_percent`: Stripe fee buffer %
- `stripe_fixed_fee_buffer`: Stripe fixed fee ($)
- `paypal_fee_buffer_percent`: PayPal fee buffer %
- `paypal_fixed_fee_buffer`: PayPal fixed fee ($)
- `additional_profit_buffer_percent`: Extra profit margin %
- `price_rounding_mode`: Rounding rule (none, nearest_99, nearest_49, whole_dollar)
- `last_updated`: Timestamp

## FAQ

**Q: Why are payment fees built into prices?**
A: Customers expect transparent pricing. Revealing fees at checkout increases cart abandonment. Building fees into prices creates a single clear total.

**Q: Can customers see the fee breakdown?**
A: No. Only admins can see the breakdown in product detail and order pages.

**Q: What if Stripe is down?**
A: Customer sees "Card checkout temporarily unavailable. Use PayPal."

**Q: What if both payment methods are down?**
A: Checkout is disabled with message to contact support.

**Q: How are existing orders affected?**
A: Orders placed before this update keep their original payment_status. Only new orders use the online-payment-only flow.

## Migration Path

1. ✓ Created PaymentFeeSettings entity
2. ✓ Updated Checkout to Stripe/PayPal only
3. ✓ Updated order creation to use online payment status
4. ✓ Updated payment verification to update order correctly
5. ✓ Updated Track Order to show appropriate statuses
6. ✓ Hidden manual payment fallback from customers
7. ⏳ Enable live mode testing when ready
8. ⏳ Switch from test Stripe keys to live keys

## Next Steps

1. Test Stripe checkout with test card
2. Verify payment fee settings are initialized
3. Confirm prices display correctly with embedded fees
4. Load test with multiple orders
5. When ready for live: Switch Stripe secret/publishable keys to live