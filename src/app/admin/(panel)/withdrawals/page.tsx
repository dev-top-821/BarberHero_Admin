import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import WithdrawalRow from "./WithdrawalRow";

const PAGE_SIZE = 15;

const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "REQUESTED", label: "Requested" },
  { value: "PROCESSING", label: "Processing" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
] as const;

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminWithdrawalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const statusFilter = params.status ?? "ALL";
  const query = (params.q ?? "").trim();
  const page = Math.max(1, parseInt(params.page ?? "1") || 1);

  const searchClause = query
    ? {
        OR: [
          {
            wallet: {
              barberProfile: {
                user: { fullName: { contains: query, mode: "insensitive" as const } },
              },
            },
          },
          { bankReference: { contains: query, mode: "insensitive" as const } },
          { bankAccountName: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : {};

  const statusClause =
    statusFilter !== "ALL" ? { status: statusFilter as never } : {};
  const where = { ...statusClause, ...searchClause };

  const [requests, total, pendingCount] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        wallet: {
          include: {
            barberProfile: {
              select: {
                user: { select: { fullName: true, profilePhoto: true } },
              },
            },
          },
        },
      },
    }),
    prisma.withdrawalRequest.count({ where }),
    prisma.withdrawalRequest.count({
      where: { status: { in: ["REQUESTED", "PROCESSING"] } },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  const rows = requests.map((r) => ({
    id: r.id,
    status: r.status,
    amountInPence: r.amountInPence,
    feeInPence: r.feeInPence,
    netInPence: r.netInPence,
    createdAt: dateFmt.format(r.createdAt),
    processedAt: r.processedAt ? dateFmt.format(r.processedAt) : null,
    bankAccountName: r.bankAccountName,
    bankSortCode: r.bankSortCode,
    bankAccountNumber: r.bankAccountNumber,
    bankReference: r.bankReference,
    adminNote: r.adminNote,
    barberName: r.wallet.barberProfile.user.fullName,
    barberPhoto: r.wallet.barberProfile.user.profilePhoto,
  }));

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
                    ? "/admin/withdrawals"
                    : `/admin/withdrawals?status=${value}`
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

        <form
          method="GET"
          action="/admin/withdrawals"
          className="relative sm:ml-auto w-full sm:w-64"
        >
          {statusFilter !== "ALL" && (
            <input type="hidden" name="status" value={statusFilter} />
          )}
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search withdrawals..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-[#1A1A1A] placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#D42B2B]"
          />
        </form>
      </div>

      {pendingCount > 0 && statusFilter === "ALL" && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <strong>{pendingCount}</strong> withdrawal{pendingCount === 1 ? "" : "s"} awaiting your action.
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-180">
            <thead className="bg-white border-b border-gray-100">
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3 font-medium">Requested</th>
                <th className="px-6 py-3 font-medium">Barber</th>
                <th className="px-6 py-3 font-medium">Bank details</th>
                <th className="px-6 py-3 font-medium text-right">Amount</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-gray-400">
                    No withdrawals found
                  </td>
                </tr>
              ) : (
                rows.map((r) => <WithdrawalRow key={r.id} data={r} />)
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
            query={query}
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
  query,
  page,
  totalPages,
}: {
  statusFilter: string;
  query: string;
  page: number;
  totalPages: number;
}) {
  const parts: string[] = [];
  if (statusFilter !== "ALL") parts.push(`status=${encodeURIComponent(statusFilter)}`);
  if (query) parts.push(`q=${encodeURIComponent(query)}`);
  const baseQuery = parts.length ? `${parts.join("&")}&` : "";
  const makeHref = (p: number) => `/admin/withdrawals?${baseQuery}page=${p}`;

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
