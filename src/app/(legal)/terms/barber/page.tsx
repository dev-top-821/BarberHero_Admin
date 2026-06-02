import type { Metadata } from "next";
import { LegalDoc } from "../../_render";

export const metadata: Metadata = {
  title: "Barber Terms & Conditions — BarberHero",
  description: "Terms governing barbers' use of the BarberHero Pro app.",
};

export default function BarberTerms() {
  return <LegalDoc file="barber-terms-and-conditions.md" />;
}
