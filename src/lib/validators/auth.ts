import { z } from "zod/v4";

// Lenient phone shape: digits, optional leading "+", spaces/dashes/parens
// allowed. Stored as the trimmed raw input — server doesn't normalise yet
// (E.164 normalisation deferred to when SMS / masked calling lands).
const phoneSchema = z
  .string()
  .trim()
  .min(7, "Enter a valid phone number")
  .max(20, "Phone number is too long")
  .regex(
    /^\+?[0-9\s().-]{7,20}$/,
    "Phone number can only contain digits, spaces, +, -, ( and )"
  );

export const registerSchema = z
  .object({
    email: z.email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    fullName: z.string().min(1, "Full name is required"),
    phone: phoneSchema,
    role: z.enum(["CUSTOMER", "BARBER"]),
    postcode: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.role !== "BARBER" || (data.postcode && data.postcode.length > 0), {
    message: "Postcode is required for barbers",
    path: ["postcode"],
  });

export const loginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
