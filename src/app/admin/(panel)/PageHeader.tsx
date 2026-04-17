"use client";

import { usePathname } from "next/navigation";
import { Bell, Menu } from "lucide-react";

type Meta = { title: string; subtitle: string };

const PAGE_META: Record<string, Meta> = {
  "/admin/dashboard": {
    title: "Dashboard",
    subtitle: "Overview of barbers, bookings, and disputes",
  },
  "/admin/barbers": {
    title: "Barbers",
    subtitle: "Approve applications and manage barber profiles",
  },
  "/admin/users": {
    title: "Users",
    subtitle: "Manage customer accounts and blocks",
  },
  "/admin/bookings": {
    title: "Bookings",
    subtitle: "Track and inspect bookings across the platform",
  },
  "/admin/disputes": {
    title: "Disputes",
    subtitle: "Resolve customer reports and issue refunds",
  },
  "/admin/docs": {
    title: "API Docs",
    subtitle: "Browse the OpenAPI reference for admin and mobile endpoints",
  },
};

function resolveMeta(pathname: string): Meta | null {
  if (PAGE_META[pathname]) return PAGE_META[pathname];
  if (pathname.startsWith("/admin/disputes/")) {
    return { title: "Dispute detail", subtitle: "Review evidence and resolve" };
  }
  return null;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function PageHeader({
  user,
  onMenuClick,
}: {
  user: { fullName: string };
  onMenuClick?: () => void;
}) {
  const pathname = usePathname();

  const meta = resolveMeta(pathname);
  if (!meta) return null;

  return (
    <header className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex items-center gap-3 sm:gap-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        className="lg:hidden p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="min-w-0">
        <h1 className="text-base sm:text-xl font-bold text-[#1A1A1A] leading-tight truncate">
          {meta.title}
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 truncate hidden sm:block">
          {meta.subtitle}
        </p>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 ml-auto">
        <button
          type="button"
          aria-label="Notifications"
          title="Notifications"
          className="p-2 text-gray-500 hover:text-[#1A1A1A] rounded-full hover:bg-gray-100 transition-colors"
        >
          <Bell className="w-5 h-5" />
        </button>
        <div
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center text-xs sm:text-sm font-bold shrink-0"
          title={user.fullName}
        >
          {initials(user.fullName)}
        </div>
      </div>
    </header>
  );
}
