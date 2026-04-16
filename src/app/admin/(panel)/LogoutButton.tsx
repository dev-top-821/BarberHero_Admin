"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

export default function LogoutButton({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  }

  const hideLabel = collapsed ? "lg:hidden" : "";
  const gap = collapsed ? "gap-2 lg:gap-0" : "gap-2";

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      title={collapsed ? "Log out" : undefined}
      className={`w-full flex items-center justify-center ${gap} px-3 py-2 text-sm rounded bg-white/10 hover:bg-white/20 disabled:opacity-60 transition-colors`}
    >
      <LogOut className="w-4 h-4" />
      <span className={hideLabel}>{loading ? "Logging out…" : "Log out"}</span>
    </button>
  );
}
