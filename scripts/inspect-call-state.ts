import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const u = await prisma.user.findUnique({
    where: { email: "tb1@test.com" },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      role: true,
    },
  });
  console.log("barber:", JSON.stringify(u, null, 2));

  if (!u) return;
  const bookings = await prisma.booking.findMany({
    where: { barber: { userId: u.id } },
    select: {
      id: true,
      status: true,
      customer: { select: { email: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  console.log("recent bookings:", JSON.stringify(bookings, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
