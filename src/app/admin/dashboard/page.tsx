export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[#1A1A1A] mb-6">Dashboard</h1>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Total Barbers</p>
          <p className="text-3xl font-bold text-[#1A1A1A] mt-1">0</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Total Bookings</p>
          <p className="text-3xl font-bold text-[#1A1A1A] mt-1">0</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Pending Approvals</p>
          <p className="text-3xl font-bold text-[#D97706] mt-1">0</p>
        </div>
        <a href="/admin/disputes" className="bg-white rounded-lg border border-gray-200 p-6 hover:border-[#DC2626] transition-colors">
          <p className="text-sm text-gray-500">Open Disputes</p>
          <p className="text-3xl font-bold text-[#DC2626] mt-1">0</p>
        </a>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-4">Recent Bookings</h2>
        <p className="text-sm text-gray-500">No bookings yet.</p>
      </div>
    </div>
  );
}
