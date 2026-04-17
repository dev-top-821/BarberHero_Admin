import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 10;

const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

const statusStyle: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-green-100 text-green-700",
  ON_THE_WAY: "bg-blue-100 text-blue-700",
  STARTED: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-200 text-gray-600",
};

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const statusFilter = params.status ?? "ALL";
  const page = Math.max(1, parseInt(params.page ?? "1") || 1);

  const where =
    statusFilter !== "ALL" ? { status: statusFilter as never } : {};

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        customer: { select: { fullName: true } },
        barber: { include: { user: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.booking.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-1 flex flex-wrap">
          {FILTERS.map(({ value, label }) => {
            const active = statusFilter === value;
            return (
              <Link
                key={value}
                href={
                  value === "ALL"
                    ? "/admin/bookings"
                    : `/admin/bookings?status=${value}`
                }
                className={`relative px-3 sm:px-6 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                  active ? "text-[#D42B2B]" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {label}
                {active && (
                  <span className="absolute left-4 right-4 -bottom-px h-0.5 bg-[#D42B2B] rounded-t-full" />
                )}
              </Link>
            );
          })}
        </div>

        <div className="relative sm:ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Search bookings..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-[#1A1A1A] placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#D42B2B]"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-180">
            <thead className="bg-white border-b border-gray-100">
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3 font-medium">ID</th>
                <th className="px-6 py-3 font-medium">Customer</th>
                <th className="px-6 py-3 font-medium">Barber</th>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bookings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-gray-400">
                    No bookings found
                  </td>
                </tr>
              ) : (
                bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-[#1A1A1A]">
                      #BK-{b.id.slice(0, 4).toUpperCase()}
                    </td>
                    <td className="px-6 py-4 text-gray-700">{b.customer.fullName}</td>
                    <td className="px-6 py-4 text-gray-700">{b.barber.user.fullName}</td>
                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                      {dateFmt.format(b.date)} · {b.startTime}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                          statusStyle[b.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-[#1A1A1A] font-medium">
                      £{(b.totalInPence / 100).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-gray-100 bg-white">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
            Showing {from}-{to} of {total.toLocaleString()} entries
          </p>
          <Pagination
            statusFilter={statusFilter}
            page={page}
            totalPages={totalPages}
          />
        </div>
      </div>
    </div>
  );
}

function Pagination({
  statusFilter,
  page,
  totalPages,
}: {
  statusFilter: string;
  page: number;
  totalPages: number;
}) {
  const baseQuery = statusFilter !== "ALL" ? `status=${statusFilter}&` : "";
  const makeHref = (p: number) => `/admin/bookings?${baseQuery}page=${p}`;

  const pages: (number | "…")[] = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center gap-1">
      <Link
        href={page > 1 ? makeHref(page - 1) : "#"}
        aria-disabled={page <= 1}
        tabIndex={page <= 1 ? -1 : undefined}
        className={`p-2 rounded ${page <= 1 ? "text-gray-300 pointer-events-none" : "text-gray-500 hover:bg-gray-100"}`}
      >
        <ChevronLeft className="w-4 h-4" />
      </Link>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-2 text-gray-400 text-xs">…</span>
        ) : (
          <Link
            key={p}
            href={makeHref(p)}
            className={`min-w-7 h-7 px-2 flex items-center justify-center text-xs font-semibold rounded transition-colors ${
              p === page ? "bg-[#D42B2B] text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {p}
          </Link>
        )
      )}
      <Link
        href={page < totalPages ? makeHref(page + 1) : "#"}
        aria-disabled={page >= totalPages}
        tabIndex={page >= totalPages ? -1 : undefined}
        className={`p-2 rounded ${page >= totalPages ? "text-gray-300 pointer-events-none" : "text-gray-500 hover:bg-gray-100"}`}
      >
        <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
