# HC Apparel daily briefing

Approved October 20, 2026 for daily delivery at 9:00 AM America/New_York.

- Scope: HC Apparel and Heart Command Center only.
- Email: Brevo, from `support@ilovehcapparel.net` to `heartfamilyco@gmail.com`.
- Window: activity since the last successfully accepted email; the first run uses the preceding 24 hours.
- Idempotency key: `hc-daily-briefing:<America/New_York date>:email`.
- Report sales separately from Stripe payouts. Label unavailable sources; never treat missing data as zero.
- Monitoring is read-only and must not change products, posts, campaigns, invoices, security settings, or orders.
- Keep the existing Buffer-capacity automation separate.
- SMS stays disabled until a provider, verified owner number, and cost are approved.

Rotate original morning greetings and compare against the previous 30 messages to avoid repetition.
