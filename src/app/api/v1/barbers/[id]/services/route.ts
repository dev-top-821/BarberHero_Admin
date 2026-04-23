import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api-utils";

// Public: guests need the service list to build a booking draft.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const services = await prisma.service.findMany({
      where: { barberProfileId: id, isActive: true },
      orderBy: { createdAt: "asc" },
    });

    return jsonResponse({ services });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
