"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, Menu, Search, X } from "lucide-react";

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
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    setSearchOpen(false);
  }, [pathname]);

  const meta = resolveMeta(pathname);
  if (!meta) return null;

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex items-center gap-3 sm:gap-6">
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
        <div className="relative hidden md:block w-48 lg:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Search..."
            className="w-full pl-9 pr-3 py-2 bg-[#F5F5F5] rounded-lg text-sm text-[#1A1A1A] placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#D42B2B]"
          />
        </div>
        <button
          type="button"
          aria-label="Search"
          title="Search"
          onClick={() => setSearchOpen(true)}
          className="md:hidden p-2 text-gray-500 hover:text-[#1A1A1A] rounded-full hover:bg-gray-100 transition-colors"
        >
          <Search className="w-5 h-5" />
        </button>
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

      {/* Mobile search overlay — covers the whole header when open */}
      {searchOpen && (
        <div className="md:hidden absolute inset-0 bg-white flex items-center gap-2 px-4 sm:px-6 z-10 border-b border-gray-200">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="search"
              placeholder="Search..."
              autoFocus
              className="w-full pl-9 pr-3 py-2 bg-[#F5F5F5] rounded-lg text-sm text-[#1A1A1A] placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#D42B2B]"
            />
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            aria-label="Close search"
            className="p-2 text-gray-500 hover:text-[#1A1A1A] rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </header>
  );
}
