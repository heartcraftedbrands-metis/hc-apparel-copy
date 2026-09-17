# HC Apparel customer authentication (production)

Supabase Auth → URL Configuration:

- Site URL: `https://www.ilovehcapparel.net`
- Currently configured exact redirects: `https://www.ilovehcapparel.net/Login?confirmed=1` and `https://www.ilovehcapparel.net/ResetPassword`.
- If broad redirects are needed later, review the security implications before adding `https://www.ilovehcapparel.net/**` and `https://ilovehcapparel.net/**`. Do not use localhost for production emails.

Supabase Auth → Sign In / Providers: email signup and email confirmation should remain enabled.

Supabase Auth → Emails currently uses the default mailer. Supabase requires **custom SMTP** before these subjects/bodies can be saved in the dashboard. Configure a transactional SMTP provider with credentials kept only in Supabase; a Brevo marketing list/API key is not an SMTP credential. Review deliverability/rate limits before launch. Do not disable confirmation merely to make signup appear successful.

Once custom SMTP is configured, set the **Confirm sign up** subject to `Confirm your HC Apparel account` and body to:

```text
Welcome to HC Apparel.

Please confirm your email to finish setting up your account.

Once confirmed, you’ll be able to save your order information, track purchases, request bulk quotes, and shop apparel blanks and printing options.

Confirm your account:
{{ .ConfirmationURL }}

Thank you,
HC Apparel
www.ilovehcapparel.net
```

Set the **Reset password** subject to `Reset your HC Apparel password` and body to:

```text
Hi,

We received a request to reset the password for your HC Apparel account.

Click the link below to create a new password:
{{ .ConfirmationURL }}

If you did not request this, you can ignore this email.

Thank you,
HC Apparel
www.ilovehcapparel.net
```

Validate with a user-controlled test inbox: signup → confirm email → log out → log in → request reset → open link → choose a new password → log in again. Password entry/reset must be done by the account owner, not shared with support. Verify the resulting `public.profiles.role` is `customer` and admin routes reject it. Do not create orders or send campaigns during this test.
