export default async function AdminDisputeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[#1A1A1A]">Dispute #{id.slice(0, 8)}</h2>
        <a href="/admin/disputes" className="text-sm text-gray-500 hover:text-[#1A1A1A]">
          ← Back to disputes
        </a>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-[#1A1A1A] mb-4">Description</h2>
            <p className="text-sm text-gray-600">No data loaded.</p>
          </section>

          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-[#1A1A1A] mb-4">Evidence</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-400">
                No images
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-[#1A1A1A] mb-4">Booking</h2>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between"><dt className="text-gray-500">Customer</dt><dd>—</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Barber</dt><dd>—</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Date</dt><dd>—</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Amount</dt><dd>—</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Payment status</dt><dd>—</dd></div>
            </dl>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-[#1A1A1A] mb-4">Resolution</h2>
            <textarea
              className="w-full px-3 py-2 bg-[#F5F5F5] rounded-lg text-sm outline-none mb-3"
              rows={4}
              placeholder="Internal admin note..."
            />
            <div className="space-y-2">
              <button className="w-full px-4 py-2 rounded-lg bg-[#1A1A1A] text-white text-sm hover:bg-black">
                Resolve & refund
              </button>
              <button className="w-full px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm hover:bg-gray-50">
                Resolve (no refund)
              </button>
              <button className="w-full px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm hover:bg-gray-50">
                Mark under review
              </button>
              <button className="w-full px-4 py-2 rounded-lg text-[#DC2626] text-sm hover:bg-red-50">
                Reject report
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
