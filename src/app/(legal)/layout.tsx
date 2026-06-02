import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

// Public legal pages (Privacy Policy + Terms). Served at /privacy and /terms.
// The (legal) folder is a route group, so it does NOT appear in the URL.
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/support" className="flex items-center gap-2.5">
            <Image
              src="/logo-red.png"
              alt="BarberHero"
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="text-lg font-bold tracking-tight">
              <span style={{ color: "#D42B2B" }}>Barber</span>Hero
            </span>
          </Link>
          <nav className="flex gap-4 text-sm text-neutral-600">
            <Link href="/support" className="hover:text-neutral-900">
              Support
            </Link>
            <Link href="/privacy" className="hover:text-neutral-900">
              Privacy
            </Link>
            <Link href="/terms/customer" className="hover:text-neutral-900">
              Customer Terms
            </Link>
            <Link href="/terms/barber" className="hover:text-neutral-900">
              Barber Terms
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">{children}</main>
      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto max-w-3xl px-5 py-6 text-sm text-neutral-500">
          © BarberHero. Questions about your data?{" "}
          <a className="underline" href="mailto:info@barberhero.co.uk">
            info@barberhero.co.uk
          </a>
        </div>
      </footer>
    </div>
  );
}
