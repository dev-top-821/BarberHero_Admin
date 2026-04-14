export default function AdminLoginPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#F8F9FA]">
      <div className="w-full max-w-sm bg-white rounded-lg border border-gray-200 p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#1A1A1A]">BarberHero</h1>
          <p className="text-sm text-gray-500 mt-1">Admin Panel</p>
        </div>
        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="w-full px-3 py-2 bg-[#F5F5F5] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#D42B2B]"
              placeholder="admin@barberhero.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              className="w-full px-3 py-2 bg-[#F5F5F5] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#D42B2B]"
              placeholder="Enter password"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-[#D42B2B] text-white font-medium rounded-lg hover:bg-[#A81E1E] transition-colors"
          >
            Log In
          </button>
        </form>
      </div>
    </div>
  );
}
