import { cookies } from "next/headers";
import { jsonResponse } from "@/lib/api-utils";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete("admin_session");
  return jsonResponse({ ok: true });
}
