// One-off: assign UK test phone numbers to the test barber + customer so
// the "Call" buttons unlock once a booking reaches ON_THE_WAY. The server
// gates phone visibility on status (see lib/booking-privacy.ts) AND on the
// phone field being non-null — so a missing phone shows the same alert
// as "not on the way yet".
//
// Uses Ofcom's reserved test ranges (drama use; never connects to a real
// person):
//   07700 900000 → 07700 900999
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const ASSIGNMENTS: Array<{ email: string; phone: string }> = [
  { email: "tb1@test.com", phone: "+447700900100" },
  { email: "ct1@test.com", phone: "+447700900200" },
];

async function main() {
  for (const a of ASSIGNMENTS) {
    const updated = await prisma.user
      .update({
        where: { email: a.email },
        data: { phone: a.phone },
        select: { email: true, phone: true },
      })
      .catch(() => null);
    if (updated) {
      console.log(`OK  ${updated.email} → ${updated.phone}`);
    } else {
      console.log(`SKIP ${a.email} (no such user)`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
