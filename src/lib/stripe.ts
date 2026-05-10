import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-03-31.basil",
});

// Per client decision 8 May 2026, VAT-inclusive: £4.99 = £4.16 net + 83p VAT @ 20%.
// Customer-facing price is one clean line; HMRC accounting derived from this constant.
export const PLATFORM_FEE_PENCE = 499;

// Minimum service total (barber's price, not the £4.99-inclusive charge).
// Per client decision 8 May 2026: £10 floor keeps Stripe's 1.5% + 20p fee from
// eating the platform fee on cheap services.
export const MIN_BOOKING_PENCE = 1000;
