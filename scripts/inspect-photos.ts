import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const profile = await prisma.barberProfile.findFirst({
    where: { user: { email: "tb1@test.com" } },
    select: {
      user: { select: { profilePhoto: true } },
      photos: { select: { url: true, storagePath: true } },
    },
  });
  console.log(JSON.stringify(profile, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
