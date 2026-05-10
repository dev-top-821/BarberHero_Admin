// One-shot location update for the test barber `tb1@test.com`. Reads
// current state, applies the override, prints before/after. Run with:
//   npx tsx scripts/update-barber-location.ts
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TARGET_EMAIL = "tb1@test.com";
const NEW_LAT = 17.912512;
const NEW_LNG = 102.618090;
const NEW_ADDRESS = "Vientiane, Laos (test)";

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: TARGET_EMAIL },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      barberProfile: {
        select: {
          id: true,
          latitude: true,
          longitude: true,
          address: true,
          postcode: true,
          status: true,
        },
      },
    },
  });

  if (!user) throw new Error(`No user with email ${TARGET_EMAIL}`);
  if (!user.barberProfile) throw new Error("User has no BarberProfile");

  console.log("BEFORE:", JSON.stringify(user, null, 2));

  const updated = await prisma.barberProfile.update({
    where: { id: user.barberProfile.id },
    data: {
      latitude: NEW_LAT,
      longitude: NEW_LNG,
      address: NEW_ADDRESS,
    },
    select: {
      id: true,
      latitude: true,
      longitude: true,
      address: true,
      postcode: true,
    },
  });

  console.log("AFTER:", JSON.stringify(updated, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
