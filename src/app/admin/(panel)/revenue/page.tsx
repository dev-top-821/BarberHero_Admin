import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  PoundSterling,
  TrendingUp,
  Wallet,
  Clock,
  RotateCcw,
} from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmtGbp = (pence: number) =>
  `£${(pence / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

type MonthlyRow = {
  month: Date;
  revenuePence: number;
  feesPence: number;
  refundsPence: number;
};

export default async function AdminRevenuePage() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // ── Aggregates (all-time + this month) ──
  const [
    releasedAgg,
    releasedThisMonthAgg,
    refundedAgg,
    refundedThisMonthAgg,
    walletAgg,
    recentPayouts,
    monthlyRaw,
  ] = await Promise.all([
    prisma.payment.aggregate({
      where: { status: "RELEASED" },
      _sum: { amountInPence: true, platformFeeInPence: true, barberAmountInPence: true },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: { status: "RELEASED", releasedAt: { gte: startOfMonth } },
      _sum: { amountInPence: true, platformFeeInPence: true },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: { status: "REFUNDED" },
      _sum: { amountInPence: true },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: { status: "REFUNDED", refundedAt: { gte: startOfMonth } },
      _sum: { amountInPence: true },
      _count: { _all: true },
    }),
    prisma.wallet.aggregate({
      _sum: { availableInPence: true, pendingInPence: true },
    }),
    prisma.walletTransaction.findMany({
      where: { type: "INSTANT_WITHDRAWAL" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        wallet: {
          include: {
            barberProfile: { include: { user: { select: { fullName: true } } } },
          },
        },
      },
    }),
    // Monthly breakdown over the last 6 months — raw SQL for a simple
    // date_trunc grouping; Prisma's aggregate API can't group by a
    // computed month bucket directly.
    prisma.$queryRaw<MonthlyRow[]>(Prisma.sql`
      SELECT
        date_trunc('month', COALESCE(p."releasedAt", p."refundedAt", p."createdAt")) AS "month",
        COALESCE(SUM(CASE WHEN p.status = 'RELEASED' THEN p."amountInPence" END), 0)::int AS "revenuePence",
        COALESCE(SUM(CASE WHEN p.status = 'RELEASED' THEN p."platformFeeInPence" END), 0)::int AS "feesPence",
        COALESCE(SUM(CASE WHEN p.status = 'REFUNDED' THEN p."amountInPence" END), 0)::int AS "refundsPence"
      FROM "Payment" p
      WHERE COALESCE(p."releasedAt", p."refundedAt", p."createdAt") >= ${sixMonthsAgo}
      GROUP BY 1
      ORDER BY 1 ASC
    `),
  ]);

  // Fill missing months so the chart always shows 6 bars.
  const months: MonthlyRow[] = [];
  for (let i = 5; i >= 0; i--) {
    const bucket = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const match = monthlyRaw.find(
      (m) =>
        new Date(m.month).getFullYear() === bucket.getFullYear() &&
        new Date(m.month).getMonth() === bucket.getMonth()
    );
    months.push({
      month: bucket,
      revenuePence: match?.revenuePence ?? 0,
      feesPence: match?.feesPence ?? 0,
      refundsPence: match?.refundsPence ?? 0,
    });
  }

  const maxBarValue = Math.max(
    1,
    ...months.map((m) => Math.max(m.revenuePence, m.refundsPence))
  );

  const totalRevenue = releasedAgg._sum.amountInPence ?? 0;
  const totalFees = releasedAgg._sum.platformFeeInPence ?? 0;
  const totalBarberEarnings = releasedAgg._sum.barberAmountInPence ?? 0;
  const totalRefunds = refundedAgg._sum.amountInPence ?? 0;
  const walletAvailable = walletAgg._sum.availableInPence ?? 0;
  const walletPending = walletAgg._sum.pendingInPence ?? 0;

  const thisMonthRevenue = releasedThisMonthAgg._sum.amountInPence ?? 0;
  const thisMonthFees = releasedThisMonthAgg._sum.platformFeeInPence ?? 0;
  const thisMonthRefunds = refundedThisMonthAgg._sum.amountInPence ?? 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* All-time headline cards */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
          All time
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <_Card
            label="Booking revenue"
            value={fmtGbp(totalRevenue)}
            subtitle={`${releasedAgg._count._all} completed`}
            Icon={PoundSterling}
            accent="text-[#D42B2B]"
            bg="bg-red-50"
          />
          <_Card
            label="Platform fees"
            value={fmtGbp(totalFees)}
            subtitle="Net to BarberHero"
            Icon={TrendingUp}
            accent="text-emerald-600"
            bg="bg-emerald-50"
          />
          <_Card
            label="Barber earnings"
            value={fmtGbp(totalBarberEarnings)}
            subtitle="Released to wallets"
            Icon={Wallet}
            accent="text-indigo-600"
            bg="bg-indigo-50"
          />
          <_Card
            label="Wallet balance"
            value={fmtGbp(walletAvailable + walletPending)}
            subtitle={`${fmtGbp(walletPending)} pending`}
            Icon={Clock}
            accent="text-amber-600"
            bg="bg-amber-50"
          />
          <_Card
            label="Refunds issued"
            value={fmtGbp(totalRefunds)}
            subtitle={`${refundedAgg._count._all} refunds`}
            Icon={RotateCcw}
            accent="text-gray-600"
            bg="bg-gray-50"
          />
        </div>
      </div>

      {/* This month */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
          This month
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <_Card
            label="Revenue"
            value={fmtGbp(thisMonthRevenue)}
            subtitle={`${releasedThisMonthAgg._count._all} completed`}
            Icon={PoundSterling}
            accent="text-[#D42B2B]"
            bg="bg-red-50"
          />
          <_Card
            label="Fees collected"
            value={fmtGbp(thisMonthFees)}
            subtitle="Platform income"
            Icon={TrendingUp}
            accent="text-emerald-600"
            bg="bg-emerald-50"
          />
          <_Card
            label="Refunds"
            value={fmtGbp(thisMonthRefunds)}
            subtitle={`${refundedThisMonthAgg._count._all} refunds`}
            Icon={RotateCcw}
            accent="text-gray-600"
            bg="bg-gray-50"
          />
        </div>
      </div>

      {/* Monthly chart (6-month bar chart, CSS-only) */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
          Last 6 months
        </h2>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-end gap-2 h-48">
            {months.map((m, i) => {
              const revH = Math.round((m.revenuePence / maxBarValue) * 100);
              const refH = Math.round((m.refundsPence / maxBarValue) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div className="w-full flex items-end gap-1 h-full">
                    <div
                      className="flex-1 bg-[#D42B2B] rounded-t min-h-[2px]"
                      style={{ height: `${revH}%` }}
                      title={`Revenue: ${fmtGbp(m.revenuePence)}`}
                    />
                    <div
                      className="flex-1 bg-gray-300 rounded-t min-h-[2px]"
                      style={{ height: `${refH}%` }}
                      title={`Refunds: ${fmtGbp(m.refundsPence)}`}
                    />
                  </div>
                  <div className="mt-2 text-xs text-gray-500 font-medium">
                    {MONTHS[m.month.getMonth()]}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[#D42B2B]" /> Revenue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-gray-300" /> Refunds
            </span>
          </div>
        </div>
      </div>

      {/* Payout history */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
          Recent payouts
        </h2>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Barber</th>
                <th className="px-6 py-3 font-medium">Description</th>
                <th className="px-6 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentPayouts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                    No payouts yet.
                  </td>
                </tr>
              ) : (
                recentPayouts.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-600 whitespace-nowrap">
                      {dateFmt.format(t.createdAt)}
                    </td>
                    <td className="px-6 py-3 font-medium text-[#1A1A1A]">
                      {t.wallet.barberProfile.user.fullName}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {t.description ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold">
                      {fmtGbp(t.amountInPence)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function _Card({
  label,
  value,
  subtitle,
  Icon,
  accent,
  bg,
}: {
  label: string;
  value: string;
  subtitle: string;
  Icon: typeof PoundSterling;
  accent: string;
  bg: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
          {label}
        </span>
        <span className={`w-9 h-9 rounded-md ${bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${accent}`} />
        </span>
      </div>
      <div className="text-xl font-bold text-[#1A1A1A]">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{subtitle}</div>
    </div>
  );
}
