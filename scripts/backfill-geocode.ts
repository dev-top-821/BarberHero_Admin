// Backfills latitude/longitude for existing barbers who have a postcode
// but no coordinates (registered before postcode geocoding existed, or
// whose sign-up lookup failed). Without coords they can never appear on
// the customer map (GET /api/v1/barbers/nearby).
//
// Usage:
//   npx tsx scripts/backfill-geocode.ts          # dry-run (report only)
//   npx tsx scripts/backfill-geocode.ts --apply  # write resolved coords
//
// Idempotent: only touches rows still missing coords, so rerunning after
// a partial/transient geocoder outage just resolves the stragglers.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { geocodePostcodesBulk } from "../src/lib/geocode";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const APPLY = process.argv.includes("--apply");
const BULK_CHUNK = 100; // postcodes.io bulk endpoint cap

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const candidates = await prisma.barberProfile.findMany({
    where: {
      postcode: { not: null },
      OR: [{ latitude: null }, { longitude: null }],
    },
    select: { id: true, postcode: true, status: true },
  });

  console.log(
    `Found ${candidates.length} barber(s) with a postcode but no coordinates.`
  );
  if (candidates.length === 0) return;

  let resolved = 0;
  const unresolved: Array<{ id: string; postcode: string; status: string }> =
    [];

  for (const batch of chunk(candidates, BULK_CHUNK)) {
    const postcodes = batch.map((b) => b.postcode!.trim());
    const coordsByPostcode = await geocodePostcodesBulk(postcodes);

    for (const b of batch) {
      const coords = coordsByPostcode.get(b.postcode!.trim());
      if (!coords) {
        unresolved.push({
          id: b.id,
          postcode: b.postcode!,
          status: b.status,
        });
        continue;
      }
      resolved++;
      if (APPLY) {
        await prisma.barberProfile.update({
          where: { id: b.id },
          data: { latitude: coords.latitude, longitude: coords.longitude },
        });
      }
      console.log(
        `${APPLY ? "UPDATED" : "WOULD UPDATE"} ${b.id} (${b.postcode}) → ` +
          `${coords.latitude}, ${coords.longitude}`
      );
    }
  }

  console.log(
    `\nResolved ${resolved}/${candidates.length}. ` +
      `${APPLY ? "Wrote" : "Would write"} coordinates for ${resolved}.`
  );

  if (unresolved.length > 0) {
    console.log(
      `\n${unresolved.length} postcode(s) could NOT be geocoded ` +
        `(invalid/unrecognised — fix the postcode manually or have the ` +
        `barber correct it):`
    );
    for (const u of unresolved) {
      console.log(`  - ${u.id} | "${u.postcode}" | status=${u.status}`);
    }
  }

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to write changes.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
