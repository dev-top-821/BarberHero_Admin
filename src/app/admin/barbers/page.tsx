export default function AdminBarbersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[#1A1A1A] mb-6">Barbers</h1>
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-4 mb-4">
          <input
            type="text"
            className="flex-1 px-3 py-2 bg-[#F5F5F5] rounded-lg text-sm outline-none"
            placeholder="Search barbers..."
          />
        </div>
        <div className="flex gap-2 mb-4">
          {["All", "Pending", "Approved", "Blocked"].map((filter) => (
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
              <th className="text-left py-3 px-2 font-medium text-gray-500">Name</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Email</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Status</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Date</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-8 text-center text-gray-500" colSpan={5}>
                No barbers yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
