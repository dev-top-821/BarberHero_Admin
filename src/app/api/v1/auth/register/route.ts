import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, generateAccessToken, generateRefreshToken } from "@/lib/auth";
import { registerSchema } from "@/lib/validators/auth";
import { jsonResponse, errorResponse } from "@/lib/api-utils";
import { rateLimit } from "@/lib/redis";
import { geocodePostcode } from "@/lib/geocode";

function clientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: NextRequest) {
  try {
    // Aggressive: 5 registrations / hour / IP. Account creation is
    // expensive (Stripe customer eventually + wallet rows + email
    // verification down the line); abuse here costs us money.
    const limit = await rateLimit(`register:${clientIp(request)}`, {
      limit: 5,
      windowSeconds: 60 * 60,
    });
    if (!limit.allowed) {
      return errorResponse(
        "RATE_LIMITED",
        `Too many sign-up attempts. Try again in ${limit.retryAfterSeconds}s.`,
        429,
      );
    }

    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("INVALID_INPUT", parsed.error.issues[0].message);
    }

    const { email, password, fullName, phone, role, postcode } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return errorResponse("EMAIL_EXISTS", "An account with this email already exists", 409);
    }

    const passwordHash = await hashPassword(password);

    // Resolve the postcode to coordinates up front so the barber is
    // map-eligible the moment they're approved. Best-effort: a failed
    // lookup must never block sign-up — it's backfilled on profile save
    // and gated again at submit-for-review.
    const normalizedPostcode =
      role === "BARBER" ? postcode!.trim().toUpperCase() : null;
    const coords =
      role === "BARBER" ? await geocodePostcode(normalizedPostcode) : null;

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        phone: phone.trim(),
        role,
        ...(role === "BARBER" && {
          barberProfile: {
            create: {
              postcode: normalizedPostcode!,
              ...(coords && {
                latitude: coords.latitude,
                longitude: coords.longitude,
              }),
              settings: { create: {} },
              wallet: { create: {} },
            },
          },
        }),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        barberProfile: role === "BARBER" ? { select: { id: true, status: true } } : false,
      },
    });

    const tokenUser = {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
    };
    const accessToken = generateAccessToken(tokenUser);
    const refreshToken = generateRefreshToken(tokenUser);

    return jsonResponse(
      {
        accessToken,
        refreshToken,
        user,
      },
      201
    );
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
