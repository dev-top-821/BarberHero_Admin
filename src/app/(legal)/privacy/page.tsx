import type { Metadata } from "next";
import { LegalDoc } from "../_render";

export const metadata: Metadata = {
  title: "Privacy Policy — BarberHero",
  description: "How BarberHero collects, uses and protects your personal data.",
};

// Shared privacy policy — identical for the customer and barber apps.
export default function PrivacyPolicy() {
  return <LegalDoc file="privacy-policy.md" />;
}
