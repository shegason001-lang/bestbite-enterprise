# Bestbite Enterprise — Multi-page v2

## Pages
- `/` or `/index.html` — Home
- `/menu.html` — Menu
- `/about.html` — About Us
- `/orders.html` — My Orders / real-time order lookup
- `/categories.html` — Categories
- `/contact.html` — Contact
- `/cart.html` — Cart
- `/checkout.html` — Checkout
- `/payment-complete.html` — Paystack callback
- `/admin.html` — keep your existing admin page when merging

## Environment
Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, and `SITE_URL` in Render. Never put secret keys in browser code.

## Paystack webhook
Set the Paystack webhook URL to `https://YOUR-RENDER-DOMAIN/api/paystack/webhook`.


## Legal pages
The site now includes `privacy.html` and `terms.html`. Review these policies with your local legal adviser before relying on them as your final legal documents.

## Requested menu prices
Run `PRICE-UPDATE.sql` in the Supabase SQL Editor to add/update the requested items and prices. Delivery is intended to be ₦1,500–₦2,000 depending on location.
