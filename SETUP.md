# Bestbite Enterprise — production setup

The public Supabase values are already configured in the website/admin page. The server still needs two **secret** values that must stay on the server.

## 1. Install and run
Node.js 20+ is recommended.

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:3000`.

## 2. Server environment
In `.env`, keep:

- `SUPABASE_URL=https://vilzncccdmegrwvrmadb.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY=...` (public; already shown in example)
- `SUPABASE_SERVICE_ROLE_KEY=...` — server-only Supabase secret
- `PAYSTACK_SECRET_KEY=...` — server-only Paystack test secret while testing
- `SITE_URL=https://YOUR-DOMAIN`

Never put either secret into `index.html`, `admin.html`, GitHub, or chat.

## 3. Database
The six Supabase tables have already been created in your project and the admin Auth user has been linked to `admin_users`.

## 4. Admin
Open `/admin.html` and sign in with the Auth account you created. The dashboard reads orders directly from Supabase using the publishable key and your RLS admin policies.

## 5. Paystack
The browser never receives the Paystack secret. The server initializes and verifies payments. Paystack amount is sent in kobo (`naira × 100`) while the Bestbite database stores order totals in naira.

Set the Paystack webhook to:
`https://YOUR-DOMAIN/api/paystack/webhook`

## 6. WhatsApp
Customers and admins get a WhatsApp click-to-chat order link to 09041130288. Fully automatic server-sent WhatsApp messages require the official WhatsApp Business/Meta Cloud API or another provider; a normal WhatsApp number cannot silently send API messages.

## 7. Important
Do not deploy with placeholder secrets. Use HTTPS in production.
