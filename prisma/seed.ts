import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const TEST_PASSWORD = "ChangeMe123!";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_NAME ?? "Admin";

  if (!email || !password) {
    throw new Error(
      "ADMIN_EMAIL and ADMIN_PASSWORD must be set in the environment"
    );
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  try {
    const hash = await bcrypt.hash(password, 12);
    const testHash = await bcrypt.hash(TEST_PASSWORD, 12);

    // ── Admin ──
    const admin = await prisma.user.upsert({
      where: { email },
      update: { passwordHash: hash, role: "ADMIN", isBlocked: false, fullName },
      create: { email, passwordHash: hash, fullName, role: "ADMIN" },
    });
    console.log(`Admin ready: ${admin.email}`);

    // ── Test Customer ──
    const customer = await prisma.user.upsert({
      where: { email: "customer@barberhero.com" },
      update: { passwordHash: testHash, isBlocked: false },
      create: {
        email: "customer@barberhero.com",
        passwordHash: testHash,
        fullName: "James Wilson",
        phone: "+44 7700 900001",
        role: "CUSTOMER",
      },
    });
    console.log(`Customer ready: ${customer.email}`);

    // ── Test Barber ──
    const barber = await prisma.user.upsert({
      where: { email: "barber@barberhero.com" },
      update: { passwordHash: testHash, isBlocked: false },
      create: {
        email: "barber@barberhero.com",
        passwordHash: testHash,
        fullName: "Marcus Johnson",
        phone: "+44 7700 900002",
        role: "BARBER",
        barberProfile: {
          create: {
            bio: "Professional barber with 5 years of experience specialising in fades, skin fades, and classic cuts. Mobile service across Central London.",
            experience: "5 years",
            status: "APPROVED",
            isOnline: true,
            latitude: 51.5074,
            longitude: -0.1278,
            address: "Central London, UK",
            termsAcceptedAt: new Date(),
            termsVersion: "1.0",
            settings: {
              create: {
                serviceRadiusMiles: 5.0,
                minBookingNoticeHours: 2,
              },
            },
            wallet: {
              create: {
                availableInPence: 0,
                pendingInPence: 0,
              },
            },
            services: {
              create: [
                {
                  name: "Classic Haircut",
                  durationMinutes: 30,
                  priceInPence: 2500,
                },
                {
                  name: "Skin Fade",
                  durationMinutes: 45,
                  priceInPence: 3000,
                },
                {
                  name: "Beard Trim",
                  durationMinutes: 20,
                  priceInPence: 1500,
                },
                {
                  name: "Haircut + Beard",
                  durationMinutes: 50,
                  priceInPence: 4000,
                },
                {
                  name: "Kids Cut (Under 12)",
                  durationMinutes: 25,
                  priceInPence: 1800,
                },
              ],
            },
            availability: {
              create: [
                { dayOfWeek: "MONDAY", startTime: "09:00", endTime: "17:00", isActive: true },
                { dayOfWeek: "TUESDAY", startTime: "09:00", endTime: "17:00", isActive: true },
                { dayOfWeek: "WEDNESDAY", startTime: "09:00", endTime: "17:00", isActive: true },
                { dayOfWeek: "THURSDAY", startTime: "09:00", endTime: "18:00", isActive: true },
                { dayOfWeek: "FRIDAY", startTime: "09:00", endTime: "18:00", isActive: true },
                { dayOfWeek: "SATURDAY", startTime: "10:00", endTime: "16:00", isActive: true },
                { dayOfWeek: "SUNDAY", startTime: "00:00", endTime: "00:00", isActive: false },
              ],
            },
          },
        },
      },
    });
    console.log(`Barber ready: ${barber.email}`);

    // ── Sample portfolio photos for barber ──
    const barberProfile = await prisma.barberProfile.findUnique({
      where: { userId: barber.id },
      select: { id: true, services: { take: 2 }, photos: { select: { id: true } } },
    });

    if (barberProfile && barberProfile.photos.length === 0) {
      const samplePhotos = [
        { url: "https://picsum.photos/seed/fade1/400/400", order: 0 },
        { url: "https://picsum.photos/seed/fade2/400/400", order: 1 },
        { url: "https://picsum.photos/seed/buzz1/400/400", order: 2 },
        { url: "https://picsum.photos/seed/classic1/400/400", order: 3 },
        { url: "https://picsum.photos/seed/beard1/400/400", order: 4 },
        { url: "https://picsum.photos/seed/style1/400/400", order: 5 },
      ];

      for (const photo of samplePhotos) {
        await prisma.barberPhoto.create({
          data: {
            barberProfileId: barberProfile.id,
            url: photo.url,
            order: photo.order,
          },
        });
      }
      console.log(`Portfolio photos ready: ${samplePhotos.length} photos`);
    }

    // ── Test Booking (customer → barber) ──

    if (barberProfile) {
      const totalInPence = barberProfile.services.reduce(
        (sum, s) => sum + s.priceInPence,
        0
      );
      const totalDuration = barberProfile.services.reduce(
        (sum, s) => sum + s.durationMinutes,
        0
      );
      const startMin = 10 * 60;
      const endMin = startMin + totalDuration;
      const endTime = `${Math.floor(endMin / 60).toString().padStart(2, "0")}:${(endMin % 60).toString().padStart(2, "0")}`;

      const booking = await prisma.booking.create({
        data: {
          customerId: customer.id,
          barberId: barberProfile.id,
          date: new Date(),
          startTime: "10:00",
          endTime,
          status: "CONFIRMED",
          address: "42 Baker Street, London, W1U 3BU",
          latitude: 51.5237,
          longitude: -0.1585,
          totalInPence,
          services: {
            create: barberProfile.services.map((s) => ({
              serviceId: s.id,
              priceInPence: s.priceInPence,
            })),
          },
        },
      });
      console.log(`Booking ready: ${booking.id.slice(0, 8)} (CONFIRMED)`);
    }

    // ── Pending Barber (for approval testing) ──
    const pendingBarber = await prisma.user.upsert({
      where: { email: "pending@barberhero.com" },
      update: { passwordHash: testHash, isBlocked: false },
      create: {
        email: "pending@barberhero.com",
        passwordHash: testHash,
        fullName: "Sofia Martinez",
        phone: "+44 7700 900003",
        role: "BARBER",
        barberProfile: {
          create: {
            bio: "Specialising in modern textured cuts, colour work, and precision fading. 3 years experience across East London salons.",
            experience: "3 years",
            status: "PENDING",
            isOnline: false,
            latitude: 51.5155,
            longitude: -0.0922,
            address: "Shoreditch, London, UK",
            settings: {
              create: {
                serviceRadiusMiles: 3.0,
                minBookingNoticeHours: 1,
              },
            },
            wallet: { create: { availableInPence: 0, pendingInPence: 0 } },
            services: {
              create: [
                { name: "Textured Crop", durationMinutes: 35, priceInPence: 2800 },
                { name: "Skin Fade", durationMinutes: 40, priceInPence: 3200 },
                { name: "Buzz Cut", durationMinutes: 20, priceInPence: 1500 },
              ],
            },
            availability: {
              create: [
                { dayOfWeek: "MONDAY", startTime: "10:00", endTime: "18:00", isActive: true },
                { dayOfWeek: "TUESDAY", startTime: "10:00", endTime: "18:00", isActive: true },
                { dayOfWeek: "WEDNESDAY", startTime: "10:00", endTime: "18:00", isActive: true },
                { dayOfWeek: "THURSDAY", startTime: "10:00", endTime: "20:00", isActive: true },
                { dayOfWeek: "FRIDAY", startTime: "10:00", endTime: "20:00", isActive: true },
                { dayOfWeek: "SATURDAY", startTime: "09:00", endTime: "17:00", isActive: true },
                { dayOfWeek: "SUNDAY", startTime: "00:00", endTime: "00:00", isActive: false },
              ],
            },
          },
        },
      },
    });
    console.log(`Pending barber ready: ${pendingBarber.email}`);

    // Add portfolio photos for pending barber
    const pendingProfile = await prisma.barberProfile.findUnique({
      where: { userId: pendingBarber.id },
      select: { id: true, photos: { select: { id: true } } },
    });
    if (pendingProfile && pendingProfile.photos.length === 0) {
      for (let i = 0; i < 4; i++) {
        await prisma.barberPhoto.create({
          data: {
            barberProfileId: pendingProfile.id,
            url: `https://picsum.photos/seed/pending${i}/400/400`,
            order: i,
          },
        });
      }
      console.log("Pending barber photos ready: 4 photos");
    }

    // ── Test Dispute ──
    const existingReports = await prisma.report.count();
    if (existingReports === 0) {
      const bookings = await prisma.booking.findMany({
        take: 1,
        orderBy: { createdAt: "desc" },
        select: { id: true, customerId: true },
      });
      if (bookings.length > 0) {
        const report = await prisma.report.create({
          data: {
            bookingId: bookings[0].id,
            raisedById: bookings[0].customerId,
            category: "SERVICE_QUALITY",
            description:
              "The barber arrived 30 minutes late and the haircut quality was significantly below what was shown in their portfolio. The fade was uneven and I had to visit another barber to fix it. I would like a full refund.",
            status: "OPEN",
            images: {
              create: [
                { url: "https://picsum.photos/seed/evidence1/400/400" },
                { url: "https://picsum.photos/seed/evidence2/400/400" },
              ],
            },
          },
        });
        console.log(`Dispute ready: ${report.id.slice(0, 8)} (OPEN)`);
      }
    }

    console.log("\nTest credentials:");
    console.log(`  Customer:        customer@barberhero.com / ${TEST_PASSWORD}`);
    console.log(`  Barber:          barber@barberhero.com   / ${TEST_PASSWORD}`);
    console.log(`  Pending barber:  pending@barberhero.com  / ${TEST_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
