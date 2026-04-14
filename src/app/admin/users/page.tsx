export default function AdminUsersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[#1A1A1A] mb-6">Users</h1>
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <input
          type="text"
          className="w-full max-w-md px-3 py-2 bg-[#F5F5F5] rounded-lg text-sm outline-none mb-4"
          placeholder="Search users..."
        />
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-2 font-medium text-gray-500">Name</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Email</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Bookings</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Status</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-8 text-center text-gray-500" colSpan={5}>
                No users yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
