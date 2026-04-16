"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Scissors,
  Users,
  CalendarCheck,
  AlertTriangle,
  FileJson,
  type LucideIcon,
} from "lucide-react";

type Item = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

const items: Item[] = [
  { href: "/admin/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/admin/barbers", label: "Barbers", Icon: Scissors },
  { href: "/admin/users", label: "Users", Icon: Users },
  { href: "/admin/bookings", label: "Bookings", Icon: CalendarCheck },
  { href: "/admin/disputes", label: "Disputes", Icon: AlertTriangle },
  { href: "/admin/docs", label: "API Docs", Icon: FileJson },
];

export default function SidebarNav({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 p-3 space-y-1">
      {items.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        // Labels visible on mobile regardless of desktop-collapsed state
        const hideLabel = collapsed ? "lg:hidden" : "";
        const hideStripe = collapsed ? "lg:hidden" : "";
        const justify = collapsed ? "gap-3 lg:justify-center lg:gap-0" : "gap-3";
        return (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            className={`
              relative flex items-center ${justify} px-3 py-3 rounded-md text-sm font-semibold tracking-wider uppercase transition-colors
              ${active
                ? "bg-white/5 text-[#D42B2B]"
                : "text-gray-400 hover:text-white hover:bg-white/5"}
            `}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <span className={hideLabel}>{label}</span>
            {active && (
              <span
                className={`absolute right-0 top-2 bottom-2 w-1 rounded-l bg-[#D42B2B] ${hideStripe}`}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
