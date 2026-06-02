import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms & Conditions — BarberHero",
  description: "BarberHero Terms & Conditions for customers and barbers.",
};

// Index: the Terms differ by role, so point each audience to the right document.
export default function TermsIndex() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Terms &amp; Conditions</h1>
      <p className="text-neutral-700">
        BarberHero has separate Terms &amp; Conditions for customers and for
        barbers. Please read the one that applies to you:
      </p>
      <ul className="space-y-3">
        <li>
          <Link
            href="/terms/customer"
            className="block rounded-lg border border-neutral-200 bg-white px-5 py-4 hover:border-neutral-300"
          >
            <span className="font-semibold text-[#D42B2B]">Customer Terms &amp; Conditions</span>
            <span className="block text-sm text-neutral-500">For people booking a barber on the BarberHero app.</span>
          </Link>
        </li>
        <li>
          <Link
            href="/terms/barber"
            className="block rounded-lg border border-neutral-200 bg-white px-5 py-4 hover:border-neutral-300"
          >
            <span className="font-semibold text-[#D42B2B]">Barber Terms &amp; Conditions</span>
            <span className="block text-sm text-neutral-500">For barbers providing services on the BarberHero Pro app.</span>
          </Link>
        </li>
      </ul>
      <p className="text-sm text-neutral-500">
        See also our{" "}
        <Link href="/privacy" className="text-[#D42B2B] underline">
          Privacy Policy
        </Link>
        , which applies to everyone.
      </p>
    </div>
  );
}
