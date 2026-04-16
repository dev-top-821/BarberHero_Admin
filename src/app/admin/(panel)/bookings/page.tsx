import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const statusFilter = params.status ?? "ALL";

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4">
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
            <tr>
              <td colSpan={6} className="px-6 py-16 text-center text-gray-400">
                No bookings found
              </td>
            </tr>
          </tbody>
        </table>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-gray-100 bg-white">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
            Showing 0-0 of 0 entries
          </p>
          <div className="flex items-center gap-1">
            <span className="p-2 rounded text-gray-300 pointer-events-none">
              <ChevronLeft className="w-4 h-4" />
            </span>
            <span className="min-w-7 h-7 px-2 flex items-center justify-center text-xs font-semibold rounded bg-[#D42B2B] text-white">
              1
            </span>
            <span className="p-2 rounded text-gray-300 pointer-events-none">
              <ChevronRight className="w-4 h-4" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
