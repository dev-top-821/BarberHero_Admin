import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import BlockUserButton from "./BlockUserButton";

const PAGE_SIZE = 10;

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1") || 1);

  const where = { role: "CUSTOMER" as const };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        profilePhoto: true,
        isBlocked: true,
        createdAt: true,
        _count: { select: { bookings: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4">
      <div className="flex">
        <div className="relative w-full sm:w-64 sm:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Search users..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-[#1A1A1A] placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#D42B2B]"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-180">
            <thead className="bg-white border-b border-gray-100">
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3 font-medium">Customer</th>
                <th className="px-6 py-3 font-medium">Contact information</th>
                <th className="px-6 py-3 font-medium">Bookings</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Joined</th>
                <th className="px-6 py-3 font-medium text-right">Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-gray-400">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {u.profilePhoto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={u.profilePhoto}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center text-xs font-bold shrink-0">
                            {initials(u.fullName)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-[#1A1A1A] truncate">
                            {u.fullName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-[#1A1A1A] truncate">{u.email}</p>
                      {u.phone && (
                        <p className="text-xs text-gray-500 mt-0.5">{u.phone}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-[#1A1A1A] font-medium">
                      {u._count.bookings}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                          u.isBlocked
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {u.isBlocked ? "Blocked" : "Active"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                      {dateFmt.format(u.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <BlockUserButton userId={u.id} isBlocked={u.isBlocked} userName={u.fullName} />
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
          <Pagination page={page} totalPages={totalPages} />
        </div>
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  const makeHref = (p: number) => `/admin/users?page=${p}`;

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
