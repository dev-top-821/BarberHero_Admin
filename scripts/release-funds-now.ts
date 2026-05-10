// One-shot: forcibly release held funds for the test barber's most recent
// STARTED booking. Equivalent to running the release-held-payments cron
// without waiting the 24h `heldUntil` window. Use ONLY in test mode.
//
// What it does, mirroring lib/api/v1/cron/release-held-payments/route.ts:
//   1. Wallet.pendingInPence -= barberAmount
//   2. Wallet.availableInPence += barberAmount
//   3. Payment.status: PENDING_RELEASE → RELEASED  (sets releasedAt = now)
//   4. Booking.status: STARTED → COMPLETED
//   5. Writes EARNING + PLATFORM_FEE wallet transactions
//
// After this, the barber's wallet should show the funds as `available`
// and the instant-withdrawal button should be enabled.
//
// Usage: npx tsx scripts/release-funds-now.ts [--email tb1@test.com]
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx > -1 ? process.argv[idx + 1] : fallback;
}

const TARGET_EMAIL = arg("email", "tb1@test.com");

async function main() {
  const barberUser = await prisma.user.findUnique({
    where: { email: TARGET_EMAIL },
    select: { id: true, fullName: true, barberProfile: { select: { id: true } } },
  });
  if (!barberUser) throw new Error(`No user with email ${TARGET_EMAIL}`);
  if (!barberUser.barberProfile) throw new Error("User is not a barber");

  // Find the most recent payment in PENDING_RELEASE for this barber's bookings.
  // We don't filter by heldUntil — that's the whole point of running this manually.
  const payment = await prisma.payment.findFirst({
    where: {
      status: "PENDING_RELEASE",
      booking: { barberId: barberUser.barberProfile.id },
    },
    orderBy: { createdAt: "desc" },
    include: {
      booking: {
        select: { id: true, status: true, customerId: true, barberId: true },
      },
    },
  });

  if (!payment) {
    console.log(
      `No PENDING_RELEASE payment found for ${TARGET_EMAIL}. ` +
        `The barber needs to have entered the customer's verification code ` +
        `for at least one booking (booking should be in STARTED state).`
    );
    process.exit(0);
  }

  console.log("Will release:");
  console.log(`  bookingId:           ${payment.booking.id}`);
  console.log(`  paymentId:           ${payment.id}`);
  console.log(`  barberAmountInPence: ${payment.barberAmountInPence}`);
  console.log(`  platformFeeInPence:  ${payment.platformFeeInPence}`);
  console.log(`  bookingStatus:       ${payment.booking.status}`);
  console.log(`  paymentStatus:       ${payment.status}`);
  console.log("");

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Mirror the cron's wallet upsert exactly.
    const wallet = await tx.wallet.upsert({
      where: { barberProfileId: payment.booking.barberId },
      create: {
        barberProfileId: payment.booking.barberId,
        pendingInPence: 0,
        availableInPence: payment.barberAmountInPence,
      },
      update: {
        pendingInPence: { decrement: payment.barberAmountInPence },
        availableInPence: { increment: payment.barberAmountInPence },
      },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "EARNING",
        amountInPence: payment.barberAmountInPence,
        bookingId: payment.booking.id,
        description: "Booking completed — funds released (manual)",
      },
    });
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "PLATFORM_FEE",
        amountInPence: payment.platformFeeInPence,
        bookingId: payment.booking.id,
        description: "Platform fee",
      },
    });

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "RELEASED", releasedAt: now },
    });

    await tx.booking.update({
      where: { id: payment.booking.id },
      data: { status: "COMPLETED" },
    });
  });

  // Print the resulting wallet state so the script's effect is visible.
  const wallet = await prisma.wallet.findUnique({
    where: { barberProfileId: barberUser.barberProfile.id },
    select: {
      availableInPence: true,
      pendingInPence: true,
    },
  });
  console.log("DONE.");
  console.log(`Wallet now: ${JSON.stringify(wallet, null, 2)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
