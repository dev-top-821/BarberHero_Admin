// Clears stored photo URLs that point to files which no longer exist
// on disk (e.g. left over from when PHOTOS_DIR was on Render's ephemeral
// filesystem). Run AFTER mounting the persistent disk and BEFORE
// re-uploading — otherwise it will wipe the freshly uploaded photos too.
//
// Usage:
//   npx tsx scripts/clear-dead-photos.ts          # dry-run (counts only)
//   npx tsx scripts/clear-dead-photos.ts --apply  # actually delete
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const APPLY = process.argv.includes("--apply");

async function main() {
  const userCount = await prisma.user.count({
    where: { profilePhoto: { not: null } },
  });
  const photoCount = await prisma.barberPhoto.count();

  console.log(`Found:`);
  console.log(`  ${userCount} users with profilePhoto set`);
  console.log(`  ${photoCount} BarberPhoto rows`);

  if (!APPLY) {
    console.log(
      `\nDry run. Re-run with --apply to clear them. ` +
        `Make sure no fresh photos have been uploaded since the disk was mounted!`
    );
    return;
  }

  const u = await prisma.user.updateMany({
    where: { profilePhoto: { not: null } },
    data: { profilePhoto: null },
  });
  const p = await prisma.barberPhoto.deleteMany({});

  console.log(`\nCleared:`);
  console.log(`  ${u.count} user.profilePhoto values reset to null`);
  console.log(`  ${p.count} BarberPhoto rows deleted`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
