import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Mail, Smartphone, Trash2, Archive, ChevronRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Delete your account — BarberHero",
  description:
    "How customers and barbers can request deletion of their BarberHero account and personal data.",
};

// Public account-deletion page. Required by Google Play's Data deletion policy:
// a web URL where users can request account + data deletion without the app.
// This URL is what goes in the Play Console Data safety form.

export default function AccountDeletion() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl bg-linear-to-br from-[#D42B2B] to-[#a81e1e] px-6 py-9 text-white sm:px-9 sm:py-11">
        <div className="flex items-center gap-4">
          <Image
            src="/logo-red.png"
            alt="BarberHero"
            width={64}
            height={64}
            className="rounded-2xl shadow-lg ring-1 ring-white/20"
            priority
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Delete your account
            </h1>
            <p className="mt-1 text-white/85">
              For BarberHero and BarberHero Pro.
            </p>
          </div>
        </div>
      </section>

      <p className="text-neutral-700">
        You can request deletion of your BarberHero account and personal data at
        any time, using either of the options below. This applies to both
        customers (BarberHero) and barbers (BarberHero Pro).
      </p>

      {/* Option 1: in-app */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#D42B2B]/10 text-[#D42B2B]">
            <Smartphone className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-semibold">Option 1 — In the app (fastest)</h2>
        </div>
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-neutral-700">
          <li>Open the app and sign in.</li>
          <li>
            Go to <strong>Profile</strong>.
          </li>
          <li>
            Tap <strong>Delete account</strong> and confirm.
          </li>
        </ol>
        <p className="mt-3 text-sm text-neutral-500">
          Your account is closed immediately and your personal data is removed
          or anonymised.
        </p>
      </section>

      {/* Option 2: email */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#D42B2B]/10 text-[#D42B2B]">
            <Mail className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-semibold">
            Option 2 — By email (no app needed)
          </h2>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-neutral-700">
          If you can&apos;t access the app, email us from the address registered
          to your account and we&apos;ll process the request:
        </p>
        <a
          href="mailto:support@barberhero.app?subject=Delete%20my%20account"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#D42B2B] px-5 py-3 font-semibold text-white transition-colors hover:bg-[#bb2424]"
        >
          <Mail className="h-5 w-5" />
          support@barberhero.app
        </a>
        <p className="mt-3 text-sm text-neutral-500">
          Use the subject <strong>&ldquo;Delete my account&rdquo;</strong>. We
          verify ownership and action verified requests within 30 days.
        </p>
      </section>

      {/* What is deleted */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#D42B2B]/10 text-[#D42B2B]">
            <Trash2 className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-semibold">What is deleted</h2>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-neutral-700">
          Your personal data is permanently removed or anonymised, including:
          name, email address, phone number, profile photo, saved
          address/postcode, and — for barbers — bio, portfolio images and bank
          payout details.
        </p>
      </section>

      {/* What is retained */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#D42B2B]/10 text-[#D42B2B]">
            <Archive className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-semibold">What may be retained</h2>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-neutral-700">
          Some records may be kept where reasonably necessary for legal
          obligations, fraud prevention, dispute handling, unpaid balances, and
          accounting purposes — for example transaction references — retained in
          line with our{" "}
          <Link href="/privacy" className="font-medium text-[#D42B2B] underline">
            Privacy Policy
          </Link>{" "}
          (see section 14). Any active bookings, outstanding wallet funds or
          pending payouts must be resolved before an account can be deleted.
        </p>
      </section>

      {/* Legal links */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Related</h2>
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {[
            { href: "/privacy", label: "Privacy Policy" },
            { href: "/support", label: "Support" },
          ].map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center justify-between px-5 py-4 text-neutral-800 transition-colors hover:bg-neutral-50"
              >
                <span>{label}</span>
                <ChevronRight className="h-4 w-4 text-neutral-400" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
