import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support — BarberHero",
  description: "Get help with the BarberHero and BarberHero Pro apps.",
};

// Minimal public support page — used as the App Store "Support URL".
// (The full marketing/landing site will live on a separate domain.)
export default function Support() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Support</h1>

      <p className="text-neutral-700">
        BarberHero connects customers with independent, vetted barbers who come to
        your home, office or hotel. There are two apps:{" "}
        <strong>BarberHero</strong> for customers and{" "}
        <strong>BarberHero Pro</strong> for barbers.
      </p>

      <div className="rounded-lg border border-neutral-200 bg-white px-5 py-4">
        <h2 className="text-lg font-semibold">Need help?</h2>
        <p className="mt-1 text-neutral-700">
          Email us and we&apos;ll get back to you, usually within 1–2 business days.
        </p>
        <p className="mt-2">
          <a
            href="mailto:info@barberhero.co.uk"
            className="font-semibold text-[#D42B2B] underline"
          >
            info@barberhero.co.uk
          </a>
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Common questions</h2>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-neutral-700">
          <li>
            <strong>Payments:</strong> your card is authorised when you book and
            only charged once the barber completes the service and you share your
            verification code.
          </li>
          <li>
            <strong>Bookings:</strong> track your booking status in the app, from
            confirmed through to completed.
          </li>
          <li>
            <strong>Account or a problem with a booking:</strong> email us at the
            address above and we&apos;ll help.
          </li>
        </ul>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Legal</h2>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-neutral-700">
          <li>
            <Link href="/privacy" className="text-[#D42B2B] underline">
              Privacy Policy
            </Link>
          </li>
          <li>
            <Link href="/terms/customer" className="text-[#D42B2B] underline">
              Customer Terms &amp; Conditions
            </Link>
          </li>
          <li>
            <Link href="/terms/barber" className="text-[#D42B2B] underline">
              Barber Terms &amp; Conditions
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
