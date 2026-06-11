import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  Mail,
  CreditCard,
  CalendarCheck,
  UserCog,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Support — BarberHero",
  description: "Get help with the BarberHero and BarberHero Pro apps.",
};

// Minimal public support page — used as the App Store "Support URL".
// (The full marketing/landing site will live on a separate domain.)

const FAQS = [
  {
    icon: CreditCard,
    title: "Payments",
    body: "Your card is authorised when you book and charged once the barber arrives and the appointment is started using the verification code provided by the customer.",
  },
  {
    icon: CalendarCheck,
    title: "Bookings",
    body: "Track your booking in the app as it moves from confirmed, to on the way, to completed.",
  },
  {
    icon: UserCog,
    title: "Account & profile",
    body: "Manage your details in the app. You can also request deletion of your account and data either from inside the app or by contacting our support team via email.",
  },
  {
    icon: ShieldCheck,
    title: "Problems & disputes",
    body: "If something goes wrong with a booking, please report it in the app or contact our support team. We will review the case and, where appropriate, refunds or resolutions may be provided according to our policies.",
  },
];

const LEGAL = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms/customer", label: "Customer Terms & Conditions" },
  { href: "/terms/barber", label: "Barber Terms & Conditions" },
  { href: "/account-deletion", label: "Delete your account" },
];

export default function Support() {
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
              How can we help?
            </h1>
            <p className="mt-1 text-white/85">
              Support for BarberHero and BarberHero Pro.
            </p>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Contact our team</h2>
            <p className="mt-1 text-neutral-600">
              We usually reply within 1–2 business days.
            </p>
          </div>
          <a
            href="mailto:support@barberhero.app"
            className="inline-flex items-center gap-2 rounded-lg bg-[#D42B2B] px-5 py-3 font-semibold text-white transition-colors hover:bg-[#bb2424]"
          >
            <Mail className="h-5 w-5" />
            Email support
          </a>
        </div>
        <p className="mt-3 text-sm text-neutral-500">
          Or write to{" "}
          <a
            href="mailto:support@barberhero.app"
            className="font-medium text-[#D42B2B] underline"
          >
            support@barberhero.app
          </a>
        </p>
      </section>

      {/* Common questions */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Common questions</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {FAQS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-xl border border-neutral-200 bg-white p-5"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#D42B2B]/10 text-[#D42B2B]">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="font-semibold text-neutral-900">{title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Legal */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Legal</h2>
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {LEGAL.map(({ href, label }) => (
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
