export default function AdminDisputesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[#1A1A1A] mb-6">Disputes</h1>
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex gap-2 mb-4">
          {["All", "Open", "Under Review", "Resolved", "Rejected"].map((filter) => (
            <button
              key={filter}
              className="px-3 py-1 text-sm rounded-full border border-gray-200 hover:bg-gray-50"
            >
              {filter}
            </button>
          ))}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-2 font-medium text-gray-500">Date</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Customer</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Barber</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Booking</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Category</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Status</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500"></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-8 text-center text-gray-500" colSpan={7}>
                No disputes raised yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
