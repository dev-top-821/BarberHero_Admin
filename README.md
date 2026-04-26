# BarberHero — Server & Admin Panel

Next.js full-stack backend (App Router + API routes) and admin panel for the
BarberHero MVP. Serves the customer and barber Flutter apps and provides
admin tooling for approvals, bookings, disputes, and withdrawals.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stripe — local webhook testing

The webhook handler at `/api/v1/payments/webhook` is a safety net for state we
don't drive ourselves (3DS, async confirmations, disputes, async refunds). To
test it locally without deploying:

### 1. Install the Stripe CLI

- macOS: `brew install stripe/stripe-cli/stripe`
- Windows: `scoop install stripe` *or* download from https://github.com/stripe/stripe-cli/releases
- Linux: https://docs.stripe.com/stripe-cli

### 2. Log in (test mode)

```bash
stripe login
```

Opens a browser, authorises the CLI against your Stripe test account.

### 3. Forward webhooks to localhost

In one terminal:

```bash
npm run stripe:listen
```

The CLI prints a webhook signing secret like `whsec_…`. Copy it into `.env`:

```
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx
```

Restart `npm run dev` so the new env is picked up. Leave `stripe:listen`
running — it forwards every test event to your local route.

### 4. Trigger events

Convenience scripts (run in a second terminal):

```bash
npm run stripe:trigger:succeeded   # payment_intent.succeeded
npm run stripe:trigger:failed      # payment_intent.payment_failed
npm run stripe:trigger:canceled    # payment_intent.canceled
npm run stripe:trigger:refunded    # charge.refunded
npm run stripe:trigger:dispute     # charge.dispute.created
```

Or any event directly: `stripe trigger <event>` — see
`stripe trigger --help` for the full list.

### Test cards

| Card | Behaviour |
|------|-----------|
| `4242 4242 4242 4242` | Charges succeed (no auth) |
| `4000 0027 6000 3184` | Requires 3DS authentication |
| `4000 0000 0000 9995` | Always declines |
| `4000 0000 0000 0341` | Auth succeeds, **capture fails** — exercises the verify route's error path |
| `4000 0000 0000 0259` | Charges succeed but generate a **dispute** the next day — for `charge.dispute.created` |

Use any future expiry, any 3-digit CVC, any postcode.

### Free vs business Stripe account

Everything in MVP scope works on a free **test-mode** Stripe account:
manual-capture PaymentIntents, capture, cancel, refund, webhooks. A business
account is only required for live activation, Stripe Connect (barber payouts),
Apple/Google Pay domain verification, and Instant Payouts.

## Project structure

- `src/app/api/v1/**` — versioned mobile + admin API
- `src/app/admin/**` — admin panel UI
- `prisma/` — schema and migrations
- `src/lib/stripe.ts` — Stripe client + platform fee constant

## Environment variables

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Postgres connection string |
| `STRIPE_SECRET_KEY` | Stripe test/live secret key |
| `STRIPE_WEBHOOK_SECRET` | From `stripe listen` (dev) or webhook endpoint config (prod) |
| `CRON_SECRET` | Shared secret for `/api/v1/cron/*` routes |
| `JWT_SECRET` | App auth signing |
