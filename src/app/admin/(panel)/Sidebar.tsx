"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import SidebarNav from "./SidebarNav";
import LogoutButton from "./LogoutButton";

const STORAGE_KEY = "admin_sidebar_collapsed";

type Props = {
  user: { fullName: string; email: string };
  mobileOpen: boolean;
  onMobileClose: () => void;
};

export default function Sidebar({ user, mobileOpen, onMobileClose }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
    } catch {}
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onMobileClose}
        className={`fixed inset-0 bg-black/50 z-30 lg:hidden transition-opacity ${
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden="true"
      />

      <div
        className={`
          fixed lg:static inset-y-0 left-0 z-40 h-full shrink-0
          w-60 ${collapsed ? "lg:w-20" : "lg:w-60"}
          transition-[transform,width] duration-200
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
        `}
      >
        {/* Desktop collapse/expand toggle */}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:flex absolute -right-3 top-8 z-50 w-6 h-6 rounded-full bg-[#2A2A2A] border border-white/30 text-white items-center justify-center shadow hover:bg-[#3A3A3A] hover:border-white/60 transition-colors cursor-pointer"
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>

        <aside className="h-full bg-[#1A1A1A] text-white flex flex-col">
          <Link
            href="/admin/dashboard"
            className={`flex items-center ${
              collapsed ? "lg:justify-center lg:p-4 gap-3 p-6" : "gap-3 p-6"
            } border-b border-white/10 hover:bg-white/5 transition-colors`}
          >
            {collapsed ? (
              <>
                <Image
                  src="/logo-text.png"
                  alt="BarberHero"
                  width={40}
                  height={40}
                  priority
                  className="shrink-0 hidden lg:block"
                />
                {/* On mobile, even when collapsed desktop state, show full logo */}
                <div className="lg:hidden flex items-center gap-3">
                  <Image
                    src="/logo.png"
                    alt="BarberHero"
                    width={40}
                    height={40}
                    priority
                    className="shrink-0"
                  />
                  <div>
                    <h1 className="text-lg font-bold leading-tight">BarberHero</h1>
                    <p className="text-xs text-gray-400">Admin</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <Image
                  src="/logo.png"
                  alt="BarberHero"
                  width={40}
                  height={40}
                  priority
                  className="shrink-0"
                />
                <div>
                  <h1 className="text-lg font-bold leading-tight">BarberHero</h1>
                  <p className="text-xs text-gray-400">Admin</p>
                </div>
              </>
            )}
          </Link>

          <SidebarNav collapsed={collapsed} />

          <div
            className={`${
              collapsed ? "lg:p-2 p-4" : "p-4"
            } border-t border-white/10 space-y-3`}
          >
            {/* User info: always show on mobile; on desktop hidden when collapsed */}
            <div className={collapsed ? "lg:hidden" : ""}>
              <p className="text-xs text-gray-300 mb-0.5 truncate">{user.fullName}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
            <LogoutButton collapsed={collapsed} />
          </div>
        </aside>
      </div>
    </>
  );
}
