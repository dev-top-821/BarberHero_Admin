import type { Metadata } from "next";
import { LegalDoc } from "../../_render";

export const metadata: Metadata = {
  title: "Customer Terms & Conditions — BarberHero",
  description: "Terms governing customers' use of the BarberHero app.",
};

export default function CustomerTerms() {
  return <LegalDoc file="customer-terms-and-conditions.md" />;
}
