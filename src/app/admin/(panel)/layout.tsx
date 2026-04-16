import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAccessToken } from "@/lib/auth";
import PanelShell from "./PanelShell";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_session")?.value;
  if (!token) redirect("/admin/login");

  try {
    const payload = verifyAccessToken(token);
    if (payload.role !== "ADMIN") redirect("/admin/login");
    return {
      id: payload.sub,
      role: payload.role,
      fullName: payload.fullName,
      email: payload.email,
    };
  } catch {
    redirect("/admin/login");
  }
}

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return (
    <PanelShell user={{ fullName: user.fullName, email: user.email }}>
      {children}
    </PanelShell>
  );
}
