export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar - to be built in M4 */}
      <aside className="w-60 bg-[#1A1A1A] text-white flex flex-col">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-lg font-bold">BarberHero</h1>
          <p className="text-sm text-gray-400">Admin</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <a href="/admin/dashboard" className="block px-4 py-2 rounded hover:bg-white/10 text-sm">
            Dashboard
          </a>
          <a href="/admin/barbers" className="block px-4 py-2 rounded hover:bg-white/10 text-sm">
            Barbers
          </a>
          <a href="/admin/users" className="block px-4 py-2 rounded hover:bg-white/10 text-sm">
            Users
          </a>
          <a href="/admin/bookings" className="block px-4 py-2 rounded hover:bg-white/10 text-sm">
            Bookings
          </a>
          <a href="/admin/disputes" className="block px-4 py-2 rounded hover:bg-white/10 text-sm">
            Disputes
          </a>
        </nav>
      </aside>
      {/* Main content */}
      <main className="flex-1 bg-[#F8F9FA] p-8">{children}</main>
    </div>
  );
}
