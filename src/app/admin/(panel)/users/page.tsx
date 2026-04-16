import { ChevronLeft, ChevronRight } from "lucide-react";

export default function AdminUsersPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4">
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
            <tr>
              <td colSpan={6} className="px-6 py-16 text-center text-gray-400">
                No users found
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
