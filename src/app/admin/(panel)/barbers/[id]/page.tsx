import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ArrowLeft } from "lucide-react";

const statusStyle: Record<string, string> = {
  APPROVED: "bg-green-100 text-green-700",
  PENDING: "bg-yellow-100 text-yellow-700",
  BLOCKED: "bg-red-100 text-red-700",
  REJECTED: "bg-gray-200 text-gray-600",
};

const dayOrder = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const dayLabel: Record<string, string> = {
  MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu",
  FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun",
};

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default async function BarberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const barber = await prisma.barberProfile.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          fullName: true,
          email: true,
          phone: true,
          profilePhoto: true,
          createdAt: true,
        },
      },
      services: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      availability: { orderBy: { dayOfWeek: "asc" } },
      photos: { orderBy: { order: "asc" } },
      settings: true,
      wallet: { select: { balanceInPence: true } },
      _count: { select: { bookings: true, reviews: true } },
    },
  });

  if (!barber) notFound();

  const sortedAvailability = [...barber.availability].sort(
    (a, b) => dayOrder.indexOf(a.dayOfWeek) - dayOrder.indexOf(b.dayOfWeek)
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <Link
        href="/admin/barbers"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1A1A1A]"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to barbers
      </Link>

      {/* Header card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {barber.user.profilePhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={barber.user.profilePhoto}
              alt=""
              className="w-16 h-16 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center text-lg font-bold shrink-0">
              {initials(barber.user.fullName)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold text-[#1A1A1A]">
                {barber.user.fullName}
              </h2>
              <span
                className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                  statusStyle[barber.status] ?? "bg-gray-100 text-gray-600"
                }`}
              >
                {barber.status}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              ID: BH-{barber.id.slice(0, 4).toUpperCase()}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact + details */}
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-[#1A1A1A] mb-4">Details</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Email</dt>
                <dd className="text-[#1A1A1A] font-medium">{barber.user.email}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Phone</dt>
                <dd className="text-[#1A1A1A] font-medium">{barber.user.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Address</dt>
                <dd className="text-[#1A1A1A] font-medium">{barber.address ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Joined</dt>
                <dd className="text-[#1A1A1A] font-medium">{dateFmt.format(barber.user.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Experience</dt>
                <dd className="text-[#1A1A1A] font-medium">{barber.experience ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Service radius</dt>
                <dd className="text-[#1A1A1A] font-medium">
                  {barber.settings?.serviceRadiusMiles ?? 5} miles
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-gray-500">Bio</dt>
                <dd className="text-[#1A1A1A] font-medium">{barber.bio ?? "—"}</dd>
              </div>
            </dl>
          </section>

          {/* Services */}
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-[#1A1A1A] mb-4">
              Services ({barber.services.length})
            </h3>
            {barber.services.length === 0 ? (
              <p className="text-sm text-gray-400">No services listed</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <th className="pb-2 font-medium">Service</th>
                      <th className="pb-2 font-medium">Duration</th>
                      <th className="pb-2 font-medium text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {barber.services.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2.5 text-[#1A1A1A] font-medium">{s.name}</td>
                        <td className="py-2.5 text-gray-600">{s.durationMinutes} min</td>
                        <td className="py-2.5 text-right text-[#1A1A1A] font-medium">
                          £{(s.priceInPence / 100).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Availability */}
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-[#1A1A1A] mb-4">Availability</h3>
            {sortedAvailability.length === 0 ? (
              <p className="text-sm text-gray-400">No availability set</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {sortedAvailability.map((slot) => (
                  <div
                    key={slot.id}
                    className={`p-3 rounded-lg border text-center text-sm ${
                      slot.isActive
                        ? "border-green-200 bg-green-50 text-green-800"
                        : "border-gray-200 bg-gray-50 text-gray-400"
                    }`}
                  >
                    <p className="font-semibold">{dayLabel[slot.dayOfWeek]}</p>
                    <p className={`text-xs mt-0.5 ${slot.isActive ? "text-green-600" : ""}`}>
                      {slot.isActive ? `${slot.startTime} – ${slot.endTime}` : "Off"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right column — stats + quick actions */}
        <div className="space-y-6">
          <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <h3 className="text-base font-semibold text-[#1A1A1A]">Stats</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Total bookings</span>
                <span className="font-semibold text-[#1A1A1A]">{barber._count.bookings}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Reviews</span>
                <span className="font-semibold text-[#1A1A1A]">{barber._count.reviews}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Wallet balance</span>
                <span className="font-semibold text-[#1A1A1A]">
                  £{((barber.wallet?.balanceInPence ?? 0) / 100).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Online</span>
                <span className={`font-semibold ${barber.isOnline ? "text-green-600" : "text-gray-400"}`}>
                  {barber.isOnline ? "Yes" : "No"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Min notice</span>
                <span className="font-semibold text-[#1A1A1A]">
                  {barber.settings?.minBookingNoticeHours ?? 2}h
                </span>
              </div>
            </div>
          </section>

          {/* Portfolio */}
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-[#1A1A1A] mb-4">
              Portfolio ({barber.photos.length})
            </h3>
            {barber.photos.length === 0 ? (
              <p className="text-sm text-gray-400">No portfolio photos</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {barber.photos.map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={photo.id}
                    src={photo.url}
                    alt=""
                    className="w-full aspect-square rounded-lg object-cover"
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
