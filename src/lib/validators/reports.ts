import { z } from "zod/v4";

export const createReportSchema = z.object({
  category: z.enum([
    "SERVICE_QUALITY",
    "NO_SHOW",
    "PAYMENT",
    "BEHAVIOUR",
    "OTHER",
  ]),
  description: z.string().min(10, "Please describe the issue (min 10 chars)").max(2000),
  imageUrls: z.array(z.url()).max(5).optional(),
});

export const resolveReportSchema = z.object({
  action: z.enum(["RESOLVE_REFUND", "RESOLVE_NO_REFUND", "REJECT", "UNDER_REVIEW"]),
  adminNote: z.string().max(2000).optional(),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;
