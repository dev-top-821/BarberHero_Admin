import Link from "next/link";
import { Scissors, CalendarDays, CheckCircle2, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import StatCard from "./StatCard";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const bookingStatusStyle: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-green-100 text-green-700",
  ON_THE_WAY: "bg-blue-100 text-blue-700",
  STARTED: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-600",
};

export default async function AdminDashboardPage() {
  const [
    totalBarbers,
    totalBookings,
    pendingCount,
    openDisputesCount,
    pendingBarbers,
    recentBookings,
    openDisputes,
  ] = await Promise.all([
    prisma.barberProfile.count(),
    prisma.booking.count(),
    prisma.barberProfile.count({ where: { status: "PENDING" } }),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.barberProfile.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 7,
      include: { user: { select: { fullName: true, email: true } } },
    }),
    prisma.booking.findMany({
      orderBy: { createdAt: "desc" },
      take: 7,
      include: {
        customer: { select: { fullName: true } },
        barber: { include: { user: { select: { fullName: true } } } },
      },
    }),
    prisma.report.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 7,
      include: {
        booking: {
          include: {
            customer: { select: { fullName: true } },
            barber: { include: { user: { select: { fullName: true } } } },
          },
        },
      },
    }),
  ]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Barbers"
          value={totalBarbers}
          icon={Scissors}
          iconBg="bg-red-50"
          iconColor="text-[#D42B2B]"
        />
        <StatCard
          label="Total Bookings"
          value={totalBookings}
          icon={CalendarDays}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <StatCard
          label="Pending Approvals"
          value={pendingCount}
          icon={CheckCircle2}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          note={pendingCount > 0 ? "Required action" : undefined}
          noteColor="text-amber-600"
        />
        <StatCard
          label="Open Disputes"
          value={openDisputesCount}
          icon={AlertTriangle}
          iconBg="bg-red-50"
          iconColor="text-[#DC2626]"
          note={openDisputesCount > 0 ? "Required action" : undefined}
          noteColor="text-[#DC2626]"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Open disputes */}
        <section className="bg-white rounded-lg border border-gray-200">
          <header className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
            <h2 className="text-base font-semibold text-[#1A1A1A]">Open Disputes</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-100 text-[#DC2626]">
              Priority
            </span>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Customer</th>
                <th className="py-2 font-medium">Category</th>
                <th className="px-6 py-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {openDisputes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-400 text-sm">
                    No open disputes
                  </td>
                </tr>
              ) : (
                openDisputes.map((r) => (
                  <tr key={r.id}>
                    <td className="px-6 py-3 text-gray-500 whitespace-nowrap">
                      {dateFmt.format(r.createdAt)}
                    </td>
                    <td className="py-3 text-gray-700 truncate max-w-30">
                      {r.booking.customer.fullName}
                    </td>
                    <td className="py-3 text-gray-500 text-xs">
                      {r.category.replace(/_/g, " ")}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link
                        href={`/admin/disputes/${r.id}`}
                        className="text-[#D42B2B] font-medium hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <footer className="px-6 py-3 border-t border-gray-100 text-right">
            <Link
              href="/admin/disputes"
              className="text-[#D42B2B] text-sm font-semibold hover:underline"
            >
              View all →
            </Link>
          </footer>
        </section>

        {/* Recent bookings */}
        <section className="bg-white rounded-lg border border-gray-200">
          <header className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
            <h2 className="text-base font-semibold text-[#1A1A1A]">Recent Bookings</h2>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-2 font-medium">ID</th>
                <th className="py-2 font-medium">Customer</th>
                <th className="py-2 font-medium">Barber</th>
                <th className="py-2 font-medium">Status</th>
                <th className="px-6 py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentBookings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400 text-sm">
                    No bookings yet
                  </td>
                </tr>
              ) : (
                recentBookings.map((b) => (
                  <tr key={b.id}>
                    <td className="px-6 py-3 font-mono text-xs text-[#1A1A1A]">
                      #{b.id.slice(0, 8)}
                    </td>
                    <td className="py-3 text-gray-700">{b.customer.fullName}</td>
                    <td className="py-3 text-gray-700">{b.barber.user.fullName}</td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          bookingStatusStyle[b.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-[#1A1A1A] font-medium">
                      £{(b.totalInPence / 100).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <footer className="px-6 py-3 border-t border-gray-100 text-right">
            <Link
              href="/admin/bookings"
              className="text-[#D42B2B] text-sm font-semibold hover:underline"
            >
              View all →
            </Link>
          </footer>
        </section>

        {/* Pending approvals */}
        <section className="bg-white rounded-lg border border-gray-200">
          <header className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
            <h2 className="text-base font-semibold text-[#1A1A1A]">Pending Approvals</h2>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Email</th>
                <th className="py-2 font-medium">Date</th>
                <th className="px-6 py-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pendingBarbers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-400 text-sm">
                    No pending approvals
                  </td>
                </tr>
              ) : (
                pendingBarbers.map((b) => (
                  <tr key={b.id}>
                    <td className="px-6 py-3 font-medium text-[#1A1A1A] whitespace-nowrap">
                      {b.user.fullName}
                    </td>
                    <td className="py-3 text-gray-600 truncate max-w-40">{b.user.email}</td>
                    <td className="py-3 text-gray-500 whitespace-nowrap">
                      {dateFmt.format(b.createdAt)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link
                        href={`/admin/barbers`}
                        className="text-[#D42B2B] font-medium hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <footer className="px-6 py-3 border-t border-gray-100 text-right">
            <Link
              href="/admin/barbers"
              className="text-[#D42B2B] text-sm font-semibold hover:underline"
            >
              View all →
            </Link>
          </footer>
        </section>
      </div>
    </div>
  );
}
