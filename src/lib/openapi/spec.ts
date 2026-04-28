import { z } from "zod/v4";
import {
  loginSchema,
  registerSchema,
  refreshSchema,
} from "@/lib/validators/auth";
import { createReportSchema, resolveReportSchema } from "@/lib/validators/reports";
import { buildPaths, type RouteSpec } from "./builder";

// ─── Shared response schemas ─────────────────────────────────

const ErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

const Pagination = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

const UserSummary = z.object({
  id: z.string(),
  email: z.email(),
  fullName: z.string(),
  phone: z.string().nullable().optional(),
  profilePhoto: z.string().nullable().optional(),
  role: z.enum(["CUSTOMER", "BARBER", "ADMIN"]),
  isBlocked: z.boolean(),
  createdAt: z.string(),
});

const TokenResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: UserSummary,
});

const OkResponse = z.object({ ok: z.boolean() });

// Loose catch-all for nested Prisma objects we don't want to fully re-type
const LooseObject = z.record(z.string(), z.unknown());

// ─── Route input schemas ─────────────────────────────────────

const BarberStatusInput = z.object({
  status: z.enum(["APPROVED", "REJECTED", "BLOCKED"]),
});

const UserBlockInput = z.object({
  isBlocked: z.boolean(),
});

// ─── Common response templates ───────────────────────────────

const unauthorized = { description: "Unauthorized", schema: ErrorResponse };
const forbidden = { description: "Forbidden (insufficient role)", schema: ErrorResponse };
const notFound = { description: "Not found", schema: ErrorResponse };
const validationError = { description: "Invalid input", schema: ErrorResponse };

// ─── Routes ──────────────────────────────────────────────────

const routes: RouteSpec[] = [
  // ── Auth (mobile) ──
  {
    method: "post",
    path: "/api/v1/auth/login",
    summary: "Log in (mobile)",
    description:
      "Returns access + refresh tokens. For the admin panel use POST /api/admin/login (cookie-based).",
    tags: ["Auth"],
    body: loginSchema,
    responses: {
      "200": { description: "Logged in", schema: TokenResponse },
      "401": { description: "Invalid credentials", schema: ErrorResponse },
      "403": { description: "Account blocked", schema: ErrorResponse },
    },
  },
  {
    method: "post",
    path: "/api/v1/auth/register",
    summary: "Register a customer or barber",
    tags: ["Auth"],
    body: registerSchema,
    responses: {
      "201": { description: "Account created", schema: TokenResponse },
      "400": validationError,
      "409": { description: "Email already in use", schema: ErrorResponse },
    },
  },
  {
    method: "post",
    path: "/api/v1/auth/refresh",
    summary: "Refresh access token",
    tags: ["Auth"],
    body: refreshSchema,
    responses: {
      "200": {
        description: "New access token",
        schema: z.object({ accessToken: z.string() }),
      },
      "401": { description: "Invalid refresh token", schema: ErrorResponse },
    },
  },
  {
    method: "post",
    path: "/api/v1/auth/logout",
    summary: "Log out (blacklist token)",
    tags: ["Auth"],
    auth: true,
    responses: {
      "200": { description: "Logged out", schema: OkResponse },
      "401": unauthorized,
    },
  },

  // ── Admin Panel auth (cookie-based) ──
  {
    method: "post",
    path: "/api/admin/login",
    summary: "Admin panel login",
    description: "Sets an `admin_session` HttpOnly cookie. Used by the web admin.",
    tags: ["Admin Auth"],
    body: loginSchema,
    responses: {
      "200": { description: "Logged in; cookie set", schema: OkResponse },
      "401": { description: "Invalid credentials", schema: ErrorResponse },
      "403": { description: "Account blocked", schema: ErrorResponse },
    },
  },
  {
    method: "post",
    path: "/api/admin/logout",
    summary: "Admin panel logout",
    tags: ["Admin Auth"],
    responses: {
      "200": { description: "Logged out; cookie cleared", schema: OkResponse },
    },
  },

  // ── Users ──
  {
    method: "get",
    path: "/api/v1/users/me",
    summary: "Get current user",
    tags: ["Users"],
    auth: true,
    responses: {
      "200": { description: "Current user", schema: z.object({ user: UserSummary }) },
      "401": unauthorized,
      "404": notFound,
    },
  },
  {
    method: "patch",
    path: "/api/v1/users/me",
    summary: "Update current user",
    tags: ["Users"],
    auth: true,
    body: z.object({
      fullName: z.string().optional(),
      phone: z.string().nullable().optional(),
      profilePhoto: z.string().nullable().optional(),
    }),
    responses: {
      "200": { description: "Updated", schema: z.object({ user: UserSummary }) },
      "401": unauthorized,
    },
  },
  {
    method: "patch",
    path: "/api/v1/users/me/fcm-token",
    summary: "Register FCM push token",
    tags: ["Users"],
    auth: true,
    body: z.object({ fcmToken: z.string() }),
    responses: {
      "200": { description: "Saved", schema: z.object({ message: z.string() }) },
      "401": unauthorized,
    },
  },

  // ── Barber Profile (BARBER role) ──
  {
    method: "get",
    path: "/api/v1/barber/profile",
    summary: "Get own barber profile",
    tags: ["Barber Profile"],
    auth: true,
    responses: {
      "200": { description: "Own profile", schema: z.object({ profile: LooseObject }) },
      "401": unauthorized,
      "403": forbidden,
      "404": notFound,
    },
  },
  {
    method: "patch",
    path: "/api/v1/barber/profile",
    summary: "Update own barber profile",
    tags: ["Barber Profile"],
    auth: true,
    body: z.object({
      bio: z.string().nullable().optional(),
      experience: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
      latitude: z.number().nullable().optional(),
      longitude: z.number().nullable().optional(),
    }),
    responses: {
      "200": { description: "Updated", schema: z.object({ profile: LooseObject }) },
      "401": unauthorized,
      "403": forbidden,
    },
  },
  {
    method: "patch",
    path: "/api/v1/barber/profile/online",
    summary: "Toggle online status",
    tags: ["Barber Profile"],
    auth: true,
    body: z.object({ isOnline: z.boolean() }),
    responses: {
      "200": { description: "New status", schema: z.object({ isOnline: z.boolean() }) },
      "401": unauthorized,
      "403": forbidden,
    },
  },
  {
    method: "get",
    path: "/api/v1/barber/availability",
    summary: "Get own availability slots",
    tags: ["Barber Profile"],
    auth: true,
    responses: {
      "200": { description: "Slots", schema: z.object({ slots: z.array(LooseObject) }) },
      "401": unauthorized,
      "403": forbidden,
      "404": notFound,
    },
  },
  {
    method: "put",
    path: "/api/v1/barber/availability",
    summary: "Replace availability slots",
    tags: ["Barber Profile"],
    auth: true,
    body: z.object({
      slots: z.array(
        z.object({
          dayOfWeek: z.enum([
            "MONDAY",
            "TUESDAY",
            "WEDNESDAY",
            "THURSDAY",
            "FRIDAY",
            "SATURDAY",
            "SUNDAY",
          ]),
          startTime: z.string(),
          endTime: z.string(),
          isActive: z.boolean(),
        })
      ),
    }),
    responses: {
      "200": { description: "Updated slots", schema: z.object({ slots: z.array(LooseObject) }) },
      "401": unauthorized,
      "403": forbidden,
    },
  },
  {
    method: "get",
    path: "/api/v1/barber/services",
    summary: "List own services",
    tags: ["Barber Profile"],
    auth: true,
    responses: {
      "200": { description: "Active services", schema: z.object({ services: z.array(LooseObject) }) },
      "401": unauthorized,
      "403": forbidden,
    },
  },
  {
    method: "post",
    path: "/api/v1/barber/services",
    summary: "Create a service",
    tags: ["Barber Profile"],
    auth: true,
    body: z.object({
      name: z.string(),
      durationMinutes: z.number().int(),
      priceInPence: z.number().int(),
    }),
    responses: {
      "201": { description: "Created", schema: z.object({ service: LooseObject }) },
      "401": unauthorized,
      "403": forbidden,
    },
  },
  {
    method: "patch",
    path: "/api/v1/barber/services/{id}",
    summary: "Update a service",
    tags: ["Barber Profile"],
    auth: true,
    pathParams: ["id"],
    body: z.object({
      name: z.string().optional(),
      durationMinutes: z.number().int().optional(),
      priceInPence: z.number().int().optional(),
    }),
    responses: {
      "200": { description: "Updated", schema: z.object({ service: LooseObject }) },
      "401": unauthorized,
      "403": forbidden,
    },
  },
  {
    method: "delete",
    path: "/api/v1/barber/services/{id}",
    summary: "Delete a service (soft)",
    tags: ["Barber Profile"],
    auth: true,
    pathParams: ["id"],
    responses: {
      "200": { description: "Deleted", schema: z.object({ message: z.string() }) },
      "401": unauthorized,
      "403": forbidden,
    },
  },
  {
    method: "get",
    path: "/api/v1/barber/photos",
    summary: "List own portfolio photos",
    tags: ["Barber Profile"],
    auth: true,
    responses: {
      "200": { description: "Photos", schema: z.object({ photos: z.array(LooseObject) }) },
      "401": unauthorized,
      "403": forbidden,
    },
  },
  {
    method: "post",
    path: "/api/v1/barber/photos",
    summary: "Add a portfolio photo",
    tags: ["Barber Profile"],
    auth: true,
    body: z.object({ url: z.url(), order: z.number().int().optional() }),
    responses: {
      "201": { description: "Added", schema: z.object({ photo: LooseObject }) },
      "401": unauthorized,
      "403": forbidden,
    },
  },
  {
    method: "delete",
    path: "/api/v1/barber/photos/{id}",
    summary: "Delete a portfolio photo",
    tags: ["Barber Profile"],
    auth: true,
    pathParams: ["id"],
    responses: {
      "200": { description: "Deleted", schema: z.object({ message: z.string() }) },
      "401": unauthorized,
      "403": forbidden,
    },
  },
  {
    method: "get",
    path: "/api/v1/barber/settings",
    summary: "Get own barber settings",
    tags: ["Barber Profile"],
    auth: true,
    responses: {
      "200": {
        description: "Settings",
        schema: z.object({ settings: LooseObject.nullable() }),
      },
      "401": unauthorized,
      "403": forbidden,
    },
  },
  {
    method: "patch",
    path: "/api/v1/barber/settings",
    summary: "Update barber settings",
    tags: ["Barber Profile"],
    auth: true,
    body: z.object({
      serviceRadiusMiles: z.number().optional(),
      minBookingNoticeHours: z.number().int().optional(),
    }),
    responses: {
      "200": { description: "Updated", schema: z.object({ settings: LooseObject }) },
      "401": unauthorized,
      "403": forbidden,
    },
  },
  {
    method: "post",
    path: "/api/v1/barber/accept-terms",
    summary: "Accept barber T&Cs",
    tags: ["Barber Profile"],
    auth: true,
    body: z.object({ version: z.string().optional() }),
    responses: {
      "200": {
        description: "Accepted",
        schema: z.object({
          termsAcceptedAt: z.string(),
          termsVersion: z.string(),
        }),
      },
      "401": unauthorized,
      "403": forbidden,
      "404": notFound,
    },
  },

  // ── Public barbers ──
  {
    method: "get",
    path: "/api/v1/barbers/nearby",
    summary: "Find nearby online barbers",
    tags: ["Barbers"],
    auth: true,
    query: {
      latitude: { schema: z.coerce.number(), required: true },
      longitude: { schema: z.coerce.number(), required: true },
      radiusMiles: { schema: z.coerce.number(), description: "Default 10" },
      service: { schema: z.string(), description: "Filter by service name (TODO)" },
    },
    responses: {
      "200": {
        description: "Nearby barbers with distanceKm",
        schema: z.object({ barbers: z.array(LooseObject) }),
      },
      "400": validationError,
      "401": unauthorized,
    },
  },
  {
    method: "get",
    path: "/api/v1/barbers/{id}",
    summary: "Get public barber detail",
    tags: ["Barbers"],
    auth: true,
    pathParams: ["id"],
    responses: {
      "200": {
        description: "Barber with rating + reviewCount",
        schema: z.object({ barber: LooseObject }),
      },
      "401": unauthorized,
      "404": notFound,
    },
  },
  {
    method: "get",
    path: "/api/v1/barbers/{id}/availability",
    summary: "Available time slots for a date",
    tags: ["Barbers"],
    auth: true,
    pathParams: ["id"],
    query: {
      date: { schema: z.string(), description: "YYYY-MM-DD", required: true },
    },
    responses: {
      "200": {
        description: "Available slots",
        schema: z.object({
          date: z.string(),
          availableSlots: z.array(z.string()),
        }),
      },
      "400": validationError,
      "401": unauthorized,
    },
  },
  {
    method: "get",
    path: "/api/v1/barbers/{id}/services",
    summary: "List barber's active services",
    tags: ["Barbers"],
    auth: true,
    pathParams: ["id"],
    responses: {
      "200": { description: "Services", schema: z.object({ services: z.array(LooseObject) }) },
      "401": unauthorized,
    },
  },
  {
    method: "get",
    path: "/api/v1/barbers/{id}/reviews",
    summary: "List barber's reviews with aggregate",
    tags: ["Barbers"],
    auth: true,
    pathParams: ["id"],
    responses: {
      "200": {
        description: "Reviews",
        schema: z.object({
          reviews: z.array(LooseObject),
          averageRating: z.number(),
          totalReviews: z.number().int(),
        }),
      },
      "401": unauthorized,
    },
  },

  // ── Bookings ──
  {
    method: "get",
    path: "/api/v1/bookings",
    summary: "List my bookings",
    tags: ["Bookings"],
    auth: true,
    query: {
      status: {
        schema: z.enum([
          "PENDING",
          "CONFIRMED",
          "ON_THE_WAY",
          "STARTED",
          "COMPLETED",
          "CANCELLED",
        ]),
      },
    },
    responses: {
      "200": { description: "Bookings", schema: z.object({ bookings: z.array(LooseObject) }) },
      "401": unauthorized,
    },
  },
  {
    method: "post",
    path: "/api/v1/bookings",
    summary: "Create a booking (customer)",
    tags: ["Bookings"],
    auth: true,
    body: z.object({
      barberId: z.string(),
      serviceIds: z.array(z.string()).min(1),
      date: z.string(),
      startTime: z.string(),
      address: z.string(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    }),
    responses: {
      "201": {
        description: "Created with Stripe client secret",
        schema: z.object({
          booking: LooseObject,
          stripeClientSecret: z.string(),
        }),
      },
      "401": unauthorized,
      "403": forbidden,
    },
  },
  {
    method: "get",
    path: "/api/v1/bookings/{id}",
    summary: "Get booking detail",
    tags: ["Bookings"],
    auth: true,
    pathParams: ["id"],
    responses: {
      "200": { description: "Booking", schema: z.object({ booking: LooseObject }) },
      "401": unauthorized,
      "404": notFound,
    },
  },
  {
    method: "post",
    path: "/api/v1/bookings/{id}/cancel",
    summary: "Cancel a booking",
    tags: ["Bookings"],
    auth: true,
    pathParams: ["id"],
    responses: {
      "200": { description: "Cancelled", schema: z.object({ message: z.string() }) },
      "400": { description: "Not cancellable", schema: ErrorResponse },
      "401": unauthorized,
      "403": forbidden,
      "404": notFound,
    },
  },
  {
    method: "post",
    path: "/api/v1/bookings/{id}/complete",
    summary: "Confirm completion (customer)",
    description:
      "Customer-driven early completion of a STARTED booking. Releases the " +
      "barber's pending funds to `available` immediately, flips the booking " +
      "to COMPLETED, and skips the 24h dispute window. After this the " +
      "customer cannot request a refund without admin support.",
    tags: ["Bookings"],
    auth: true,
    pathParams: ["id"],
    responses: {
      "200": {
        description: "Released",
        schema: z.object({
          success: z.boolean(),
          status: z.literal("COMPLETED"),
        }),
      },
      "401": unauthorized,
      "403": forbidden,
      "404": notFound,
      "409": {
        description: "Booking not in STARTED state OR payment not in PENDING_RELEASE",
        schema: ErrorResponse,
      },
    },
  },
  {
    method: "patch",
    path: "/api/v1/bookings/{id}/status",
    summary: "Update booking status (barber)",
    tags: ["Bookings"],
    auth: true,
    pathParams: ["id"],
    body: z.object({
      status: z.enum([
        "CONFIRMED",
        "ON_THE_WAY",
        "STARTED",
        "COMPLETED",
        "CANCELLED",
      ]),
    }),
    responses: {
      "200": { description: "Updated", schema: z.object({ booking: LooseObject }) },
      "400": { description: "Invalid state transition", schema: ErrorResponse },
      "401": unauthorized,
      "403": forbidden,
      "404": notFound,
    },
  },
  {
    method: "post",
    path: "/api/v1/bookings/{id}/verify",
    summary: "Verify completion code (barber)",
    tags: ["Bookings"],
    auth: true,
    pathParams: ["id"],
    body: z.object({ code: z.string() }),
    responses: {
      "200": {
        description: "Verified and marked complete",
        schema: z.object({ success: z.boolean() }),
      },
      "400": { description: "Invalid or used code", schema: ErrorResponse },
      "401": unauthorized,
      "403": forbidden,
      "404": notFound,
    },
  },
  {
    method: "get",
    path: "/api/v1/bookings/{id}/report",
    summary: "List reports on this booking",
    tags: ["Bookings"],
    auth: true,
    pathParams: ["id"],
    responses: {
      "200": { description: "Reports", schema: z.object({ reports: z.array(LooseObject) }) },
      "401": unauthorized,
      "403": forbidden,
      "404": notFound,
    },
  },
  {
    method: "post",
    path: "/api/v1/bookings/{id}/report",
    summary: "Raise a report/dispute (customer)",
    tags: ["Bookings"],
    auth: true,
    pathParams: ["id"],
    body: createReportSchema,
    responses: {
      "201": { description: "Report created", schema: z.object({ report: LooseObject }) },
      "400": { description: "Bad JSON", schema: ErrorResponse },
      "409": { description: "Invalid state or report window expired", schema: ErrorResponse },
      "422": validationError,
      "401": unauthorized,
      "403": forbidden,
      "404": notFound,
    },
  },
  {
    method: "post",
    path: "/api/v1/bookings/{id}/review",
    summary: "Leave a review (customer)",
    tags: ["Bookings"],
    auth: true,
    pathParams: ["id"],
    body: z.object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().optional(),
    }),
    responses: {
      "201": { description: "Review created", schema: z.object({ review: LooseObject }) },
      "400": { description: "Booking not completed", schema: ErrorResponse },
      "401": unauthorized,
      "403": forbidden,
      "404": notFound,
    },
  },

  // ── Chat ──
  {
    method: "get",
    path: "/api/v1/chat/rooms",
    summary: "List chat rooms",
    tags: ["Chat"],
    auth: true,
    responses: {
      "200": {
        description: "Rooms with last message",
        schema: z.object({ rooms: z.array(LooseObject) }),
      },
      "401": unauthorized,
    },
  },
  {
    method: "get",
    path: "/api/v1/chat/rooms/{id}/messages",
    summary: "List messages",
    tags: ["Chat"],
    auth: true,
    pathParams: ["id"],
    query: {
      after: {
        schema: z.string(),
        description: "ISO timestamp — return messages after this",
      },
    },
    responses: {
      "200": { description: "Messages", schema: z.object({ messages: z.array(LooseObject) }) },
      "401": unauthorized,
    },
  },
  {
    method: "post",
    path: "/api/v1/chat/rooms/{id}/messages",
    summary: "Send a message",
    tags: ["Chat"],
    auth: true,
    pathParams: ["id"],
    body: z.object({ content: z.string().min(1) }),
    responses: {
      "201": { description: "Created", schema: z.object({ message: LooseObject }) },
      "401": unauthorized,
    },
  },

  // ── Wallet ──
  {
    method: "get",
    path: "/api/v1/wallet",
    summary: "Get own wallet + recent transactions",
    tags: ["Wallet"],
    auth: true,
    responses: {
      "200": { description: "Wallet", schema: z.object({ wallet: LooseObject.nullable() }) },
      "401": unauthorized,
      "403": forbidden,
      "404": notFound,
    },
  },
  {
    method: "post",
    path: "/api/v1/wallet/withdraw",
    summary: "Instant withdrawal",
    tags: ["Wallet"],
    auth: true,
    body: z.object({ amountInPence: z.number().int().min(1) }),
    responses: {
      "200": {
        description: "Withdrawn",
        schema: z.object({
          success: z.boolean(),
          feeInPence: z.number().int(),
          newBalanceInPence: z.number().int(),
        }),
      },
      "400": { description: "Insufficient funds", schema: ErrorResponse },
      "401": unauthorized,
      "403": forbidden,
      "404": notFound,
    },
  },

  // ── Payments (public; Stripe-signed) ──
  {
    method: "post",
    path: "/api/v1/payments/webhook",
    summary: "Stripe webhook handler",
    description:
      "Stripe posts payment_intent events here. The signature is verified against STRIPE_WEBHOOK_SECRET.",
    tags: ["Payments"],
    responses: {
      "200": { description: "Received", schema: z.object({ received: z.boolean() }) },
      "400": { description: "Missing or invalid signature", schema: ErrorResponse },
    },
  },

  // ── Admin ──
  {
    method: "get",
    path: "/api/v1/admin/dashboard",
    summary: "Dashboard stats",
    tags: ["Admin"],
    auth: true,
    responses: {
      "200": {
        description: "Stats and recent activity",
        schema: z.object({
          stats: z.object({
            totalBarbers: z.number().int(),
            pendingBarbers: z.number().int(),
            totalBookings: z.number().int(),
            totalCustomers: z.number().int(),
          }),
          recentBookings: z.array(LooseObject),
        }),
      },
      "401": unauthorized,
      "403": forbidden,
    },
  },
  {
    method: "get",
    path: "/api/v1/admin/barbers",
    summary: "List barber profiles",
    tags: ["Admin"],
    auth: true,
    query: {
      status: {
        schema: z.enum(["PENDING", "APPROVED", "REJECTED", "BLOCKED"]),
      },
      search: { schema: z.string() },
      page: { schema: z.coerce.number().int().min(1) },
      limit: { schema: z.coerce.number().int().min(1).max(100) },
    },
    responses: {
      "200": {
        description: "Paginated barbers",
        schema: z.object({ barbers: z.array(LooseObject), pagination: Pagination }),
      },
      "401": unauthorized,
      "403": forbidden,
    },
  },
  {
    method: "patch",
    path: "/api/v1/admin/barbers/{id}/status",
    summary: "Approve / reject / block a barber",
    tags: ["Admin"],
    auth: true,
    pathParams: ["id"],
    body: BarberStatusInput,
    responses: {
      "200": { description: "Updated", schema: z.object({ barber: LooseObject }) },
      "400": validationError,
      "401": unauthorized,
      "403": forbidden,
      "404": notFound,
    },
  },
  {
    method: "get",
    path: "/api/v1/admin/users",
    summary: "List customers",
    tags: ["Admin"],
    auth: true,
    query: {
      search: { schema: z.string() },
      page: { schema: z.coerce.number().int().min(1) },
      limit: { schema: z.coerce.number().int().min(1).max(100) },
    },
    responses: {
      "200": {
        description: "Paginated customers",
        schema: z.object({ users: z.array(LooseObject), pagination: Pagination }),
      },
      "401": unauthorized,
      "403": forbidden,
    },
  },
  {
    method: "patch",
    path: "/api/v1/admin/users/{id}/block",
    summary: "Block / unblock a user",
    tags: ["Admin"],
    auth: true,
    pathParams: ["id"],
    body: UserBlockInput,
    responses: {
      "200": {
        description: "Updated",
        schema: z.object({
          user: z.object({
            id: z.string(),
            fullName: z.string(),
            email: z.email(),
            isBlocked: z.boolean(),
          }),
        }),
      },
      "401": unauthorized,
      "403": forbidden,
      "404": notFound,
    },
  },
  {
    method: "get",
    path: "/api/v1/admin/bookings",
    summary: "List bookings",
    tags: ["Admin"],
    auth: true,
    query: {
      status: {
        schema: z.enum([
          "PENDING",
          "CONFIRMED",
          "ON_THE_WAY",
          "STARTED",
          "COMPLETED",
          "CANCELLED",
        ]),
      },
      search: { schema: z.string() },
      page: { schema: z.coerce.number().int().min(1) },
      limit: { schema: z.coerce.number().int().min(1).max(100) },
    },
    responses: {
      "200": {
        description: "Paginated bookings",
        schema: z.object({ bookings: z.array(LooseObject), pagination: Pagination }),
      },
      "401": unauthorized,
      "403": forbidden,
    },
  },
  {
    method: "get",
    path: "/api/v1/admin/bookings/{id}",
    summary: "Booking detail",
    tags: ["Admin"],
    auth: true,
    pathParams: ["id"],
    responses: {
      "200": { description: "Booking", schema: z.object({ booking: LooseObject }) },
      "401": unauthorized,
      "403": forbidden,
      "404": notFound,
    },
  },
  {
    method: "get",
    path: "/api/v1/admin/disputes",
    summary: "List disputes",
    tags: ["Admin"],
    auth: true,
    query: {
      status: {
        schema: z.enum([
          "OPEN",
          "UNDER_REVIEW",
          "RESOLVED_REFUNDED",
          "RESOLVED_NO_REFUND",
          "REJECTED",
        ]),
      },
      page: { schema: z.coerce.number().int().min(1) },
      limit: { schema: z.coerce.number().int().min(1).max(100) },
    },
    responses: {
      "200": {
        description: "Paginated disputes",
        schema: z.object({ reports: z.array(LooseObject), pagination: Pagination }),
      },
      "401": unauthorized,
      "403": forbidden,
    },
  },
  {
    method: "get",
    path: "/api/v1/admin/disputes/{id}",
    summary: "Dispute detail",
    tags: ["Admin"],
    auth: true,
    pathParams: ["id"],
    responses: {
      "200": { description: "Dispute", schema: z.object({ report: LooseObject }) },
      "401": unauthorized,
      "403": forbidden,
      "404": notFound,
    },
  },
  {
    method: "patch",
    path: "/api/v1/admin/disputes/{id}/resolve",
    summary: "Resolve a dispute",
    description:
      "If action is RESOLVE_REFUND, a Stripe refund is attempted against the held payment.",
    tags: ["Admin"],
    auth: true,
    pathParams: ["id"],
    body: resolveReportSchema,
    responses: {
      "200": { description: "Updated dispute", schema: z.object({ report: LooseObject }) },
      "400": { description: "Invalid JSON body", schema: ErrorResponse },
      "409": { description: "Invalid state for action", schema: ErrorResponse },
      "422": validationError,
      "401": unauthorized,
      "403": forbidden,
      "404": notFound,
      "502": { description: "Stripe refund failed", schema: ErrorResponse },
    },
  },
  {
    method: "get",
    path: "/api/v1/admin/storage-diag",
    summary: "Photos disk diagnostic",
    description:
      "Reports the runtime PHOTOS_DIR value, whether the directory exists, " +
      "what files are in it, and (optionally) probes a specific storage path. " +
      "Use to debug 'uploads succeed but reads return 404' (mismatched env vars, " +
      "persistent disk not mounted, etc).",
    tags: ["Admin"],
    auth: true,
    query: {
      path: {
        schema: z.string().optional(),
        description:
          "Optional disk-relative path to probe (e.g. `barber-photos/{userId}/profile-{uuid}.jpg`). " +
          "Returns whether that specific file exists.",
      },
    },
    responses: {
      "200": {
        description: "Diagnostic report",
        schema: z.object({
          env: z.object({ PHOTOS_DIR: z.string().nullable() }),
          cwd: z.string(),
          resolved: z.object({
            path: z.string(),
            exists: z.boolean(),
            isDirectory: z.boolean(),
          }),
          contents: z.object({
            topLevelEntries: z.array(z.string()),
            barberPhotosFileCount: z.number(),
            firstFiveFiles: z.array(z.string()),
          }),
          probe: z
            .object({
              requested: z.string(),
              absolutePath: z.string(),
              insidePhotosDir: z.boolean(),
              exists: z.boolean(),
            })
            .nullable(),
          nodeVersion: z.string(),
        }),
      },
      "401": unauthorized,
      "403": forbidden,
      "500": { description: "Diag failed", schema: ErrorResponse },
    },
  },
];

// ─── Document ────────────────────────────────────────────────

export function buildOpenApiDocument() {
  return {
    openapi: "3.0.3",
    info: {
      title: "BarberHero API",
      version: "1.0.0",
      description: `
Welcome to the **BarberHero** API reference. This document covers both the admin panel and the mobile app endpoints.

## Clients

There are two groups of endpoints, shown separately in the sidebar:

- **Admin Panel** — used by the web admin at \`/admin\`. Authentication is cookie-based (\`admin_session\`, HttpOnly, set by \`POST /api/admin/login\`). You don't paste a token; the browser sends the cookie automatically. Admin-tagged \`/api/v1/admin/*\` endpoints accept either this cookie or a Bearer JWT.
- **Mobile App** — used by the iOS / Android app. Authentication is a bearer JWT obtained from \`POST /api/v1/auth/login\`. Include it as \`Authorization: Bearer <accessToken>\` on every request.

## Trying endpoints from this page

1. Open an endpoint and click **Test Request**.
2. For mobile endpoints, click the **Authentication** section at the top and paste a JWT access token.
3. Path / query / body parameters can be edited inline.

## Response shape

Success responses return JSON with the resource keys listed per endpoint (e.g. \`{ "booking": ... }\`, \`{ "bookings": [...], "pagination": ... }\`).

Error responses use a consistent shape:

\`\`\`json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
\`\`\`

Common error codes: \`UNAUTHORIZED\`, \`FORBIDDEN\`, \`NOT_FOUND\`, \`INVALID_INPUT\`, \`VALIDATION_ERROR\`, \`ACCOUNT_BLOCKED\`, \`SERVER_ERROR\`.

## Conventions

- **Money** is represented as integer pence (\`priceInPence\`, \`amountInPence\`, \`balanceInPence\`). £4.99 = \`499\`.
- **Dates** are ISO-8601 strings (e.g. \`2025-04-16T12:00:00.000Z\`). The daily \`date\` field on bookings is a plain \`YYYY-MM-DD\`; \`startTime\` is \`HH:mm\`.
- **Pagination** on list endpoints uses \`page\` (default 1) and \`limit\` (default 20, max 100). Responses include \`{ pagination: { page, limit, total, totalPages } }\`.
- **IDs** are UUIDs.

## Status codes

- \`200\` OK — request succeeded
- \`201\` Created — resource created
- \`400\` — malformed request or invalid state
- \`401\` — missing or invalid authentication
- \`403\` — authenticated but not authorised (wrong role, blocked account, not your resource)
- \`404\` — resource not found
- \`409\` — conflict (e.g. already refunded, window expired)
- \`422\` — validation failed (Zod schema error)
- \`500\` — server error

## Environments

The current server is whatever host you're viewing this doc on. There is no separate staging host yet.
      `.trim(),
    },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    tags: [
      { name: "Admin Auth", description: "Admin panel authentication (cookie-based)" },
      { name: "Admin", description: "Admin-only endpoints — requires ADMIN role" },
      { name: "Auth", description: "Mobile authentication (bearer tokens)" },
      { name: "Users", description: "Current user profile and device tokens" },
      { name: "Barber Profile", description: "Barber's own profile, services, availability (BARBER role)" },
      { name: "Barbers", description: "Public barber search and detail (any authenticated user)" },
      { name: "Bookings", description: "Booking creation, state changes, reports, reviews" },
      { name: "Chat", description: "In-booking chat between customer and barber" },
      { name: "Wallet", description: "Barber earnings and withdrawals" },
      { name: "Payments", description: "Stripe webhook endpoint (public)" },
    ],
    "x-tagGroups": [
      {
        name: "Admin Panel",
        tags: ["Admin Auth", "Admin"],
      },
      {
        name: "Mobile App",
        tags: [
          "Auth",
          "Users",
          "Barber Profile",
          "Barbers",
          "Bookings",
          "Chat",
          "Wallet",
          "Payments",
        ],
      },
    ],
    paths: buildPaths(routes),
  };
}
