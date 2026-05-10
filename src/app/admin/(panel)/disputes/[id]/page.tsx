import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  AlertTriangle,
  XCircle,
  FileText,
  MapPin,
  CheckCircle2,
  Clock,
  Receipt,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import DisputeDetailActions from "./DisputeDetailActions";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const categoryStyle: Record<string, { color: string; icon: typeof AlertTriangle }> = {
  SERVICE_QUALITY: { color: "text-orange-600", icon: AlertTriangle },
  NO_SHOW: { color: "text-red-600", icon: XCircle },
  PAYMENT: { color: "text-blue-600", icon: FileText },
  BEHAVIOUR: { color: "text-purple-600", icon: AlertTriangle },
  OTHER: { color: "text-gray-600", icon: FileText },
};

const statusStyle: Record<string, string> = {
  OPEN: "bg-red-100 text-red-700",
  UNDER_REVIEW: "bg-yellow-100 text-yellow-700",
  RESOLVED_REFUNDED: "bg-green-100 text-green-700",
  RESOLVED_NO_REFUND: "bg-green-100 text-green-700",
  REJECTED: "bg-gray-200 text-gray-600",
};

const statusLabel: Record<string, string> = {
  OPEN: "Open",
  UNDER_REVIEW: "Under Review",
  RESOLVED_REFUNDED: "Resolved (Refunded)",
  RESOLVED_NO_REFUND: "Resolved",
  REJECTED: "Rejected",
};

export default async function DisputeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      images: true,
      events: { orderBy: { createdAt: "asc" } },
      booking: {
        include: {
          customer: {
            select: { id: true, fullName: true, profilePhoto: true, email: true, phone: true },
          },
          barber: {
            include: {
              user: {
                select: { id: true, fullName: true, profilePhoto: true, email: true, phone: true },
              },
            },
          },
          services: { include: { service: { select: { name: true } } } },
          payment: true,
        },
      },
    },
  });

  if (!report) notFound();

  // Lookup actor names so the timeline shows who did what.
  const actorIds = Array.from(
    new Set(report.events.map((e) => e.actorId).filter((x): x is string => Boolean(x))),
  );
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, fullName: true, role: true },
      })
    : [];
  const actorById = new Map(actors.map((a) => [a.id, a]));

  const catInfo = categoryStyle[report.category] ?? categoryStyle.OTHER;
  const CatIcon = catInfo.icon;
  const isOpen = report.status === "OPEN" || report.status === "UNDER_REVIEW";
  const payment = report.booking.payment;
  const refundedAmount = report.refundedAmountInPence ?? 0;
  const barberStatus = report.booking.barber.status;
  const barberIsBlocked = barberStatus === "BLOCKED";

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-6xl">
      {/* Breadcrumb / back */}
      <div className="flex items-center gap-3 text-sm">
        <Link
          href="/admin/disputes"
          className="inline-flex items-center gap-1.5 text-gray-500 hover:text-[#D42B2B] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to disputes
        </Link>
        <span className="text-gray-300">/</span>
        <span className="font-mono text-xs text-gray-500">
          #DR-{report.id.slice(0, 6).toUpperCase()}
        </span>
      </div>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-4 bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-sm font-bold ${catInfo.color}`}>
              <CatIcon className="w-4 h-4" />
              {report.category.replace(/_/g, " ")}
            </span>
            <span
              className={`inline-flex px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                statusStyle[report.status] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {statusLabel[report.status] ?? report.status}
            </span>
            {report.requestRefund && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-50 text-[#D42B2B] border border-[#D42B2B]/20">
                Refund requested
              </span>
            )}
            {barberIsBlocked && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-200 text-gray-700">
                Barber blocked
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-[#1A1A1A]">
            Dispute on booking #BK-{report.bookingId.slice(0, 4).toUpperCase()}
          </h1>
          <p className="text-xs text-gray-500 uppercase tracking-wider">
            Filed {dateTimeFmt.format(report.createdAt)}
          </p>
        </div>
        <div className="lg:w-72">
          <DisputeDetailActions
            reportId={report.id}
            isOpen={isOpen}
            barberIsBlocked={barberIsBlocked}
            paymentStatus={payment?.status ?? null}
            bookingTotalInPence={report.booking.totalInPence}
            alreadyRefundedInPence={refundedAmount}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Customer complaint + evidence */}
        <div className="lg:col-span-2 space-y-5">
          <Section title="Customer complaint">
            <p className="text-sm text-[#1A1A1A] leading-relaxed">
              {report.description}
            </p>
          </Section>

          <Section title={`Evidence (${report.images.length})`}>
            {report.images.length === 0 ? (
              <p className="text-sm text-gray-400">No images submitted</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {report.images.map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a
                    key={img.id}
                    href={img.url}
                    target="_blank"
                    rel="noreferrer"
                    className="aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-[#D42B2B] transition-colors"
                  >
                    <img
                      src={img.url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
          </Section>

          <Section title="Booking details">
            <div className="space-y-3 text-sm">
              <div className="space-y-1.5">
                {report.booking.services.map((bs, i) => (
                  <div key={i} className="flex justify-between text-gray-700">
                    <span>{bs.service.name}</span>
                    <span className="font-medium text-[#1A1A1A]">
                      £{(bs.priceInPence / 100).toFixed(2)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between font-bold pt-1.5 border-t border-gray-200">
                  <span>Total</span>
                  <span>£{(report.booking.totalInPence / 100).toFixed(2)}</span>
                </div>
              </div>
              <div className="flex items-start gap-2 text-[#1A1A1A] pt-2">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <span className="leading-relaxed">{report.booking.address}</span>
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">
                {dateFmt.format(report.booking.date)} · {report.booking.startTime}
              </div>
            </div>
          </Section>

          {payment && (
            <Section title="Payment">
              <div className="space-y-2 text-sm">
                <Row label="Status">
                  <PaymentStatusBadge status={payment.status} />
                </Row>
                <Row label="Total charged">
                  £{(payment.amountInPence / 100).toFixed(2)}
                </Row>
                <Row label="Platform fee">
                  £{(payment.platformFeeInPence / 100).toFixed(2)}
                </Row>
                <Row label="Barber share">
                  £{(payment.barberAmountInPence / 100).toFixed(2)}
                </Row>
                {refundedAmount > 0 && (
                  <Row label="Refunded so far">
                    <span className="text-[#D42B2B] font-semibold">
                      £{(refundedAmount / 100).toFixed(2)} of £
                      {(payment.amountInPence / 100).toFixed(2)}
                    </span>
                  </Row>
                )}
                <Row label="Stripe PI">
                  <span className="font-mono text-xs text-gray-500">
                    {payment.stripePaymentIntentId}
                  </span>
                </Row>
              </div>
            </Section>
          )}
        </div>

        {/* Right column — parties + timeline */}
        <div className="space-y-5">
          <Section title="Customer">
            <PartyRow
              name={report.booking.customer.fullName}
              photo={report.booking.customer.profilePhoto}
              email={report.booking.customer.email}
              phone={report.booking.customer.phone}
            />
          </Section>

          <Section title="Barber">
            <PartyRow
              name={report.booking.barber.user.fullName}
              photo={report.booking.barber.user.profilePhoto}
              email={report.booking.barber.user.email}
              phone={report.booking.barber.user.phone}
              extra={
                <Link
                  href={`/admin/barbers/${report.booking.barber.id}`}
                  className="text-xs text-[#D42B2B] hover:underline mt-1 inline-block"
                >
                  Open profile →
                </Link>
              }
            />
          </Section>

          <Section title="Audit log">
            <ol className="relative border-l border-gray-200 ml-2 space-y-4">
              {report.events.map((e) => {
                const actor = e.actorId ? actorById.get(e.actorId) : null;
                return (
                  <li key={e.id} className="ml-4 -mt-1">
                    <span className="absolute -left-1.5 mt-1 w-3 h-3 rounded-full bg-[#D42B2B] border-2 border-white" />
                    <p className="text-sm text-[#1A1A1A]">{e.description}</p>
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">
                      {dateTimeFmt.format(e.createdAt)}
                      {actor ? ` · ${actor.fullName}` : e.actorId ? "" : " · system"}
                    </p>
                  </li>
                );
              })}
              {report.events.length === 0 && (
                <li className="ml-4 text-sm text-gray-400">No events recorded.</li>
              )}
            </ol>
          </Section>

          {report.adminNote && (
            <Section title="Latest admin note">
              <p className="text-sm text-[#1A1A1A] leading-relaxed">
                {report.adminNote}
              </p>
              {report.resolvedAt && (
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-2">
                  Resolved {dateTimeFmt.format(report.resolvedAt)}
                </p>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-gray-500 text-[11px] uppercase tracking-wider">{label}</span>
      <span className="text-[#1A1A1A] font-medium">{children}</span>
    </div>
  );
}

function PartyRow({
  name,
  photo,
  email,
  phone,
  extra,
}: {
  name: string;
  photo: string | null;
  email: string;
  phone: string | null;
  extra?: React.ReactNode;
}) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex items-start gap-3">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt=""
          className="w-10 h-10 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center text-sm font-bold shrink-0">
          {initials || "?"}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[#1A1A1A] text-sm truncate">{name}</p>
        <p className="text-xs text-gray-500 truncate">{email}</p>
        {phone && <p className="text-xs text-gray-500">{phone}</p>}
        {extra}
      </div>
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: typeof CheckCircle2; color: string; bg: string }> = {
    HELD: { icon: Clock, color: "text-amber-700", bg: "bg-amber-100" },
    PENDING_RELEASE: { icon: Clock, color: "text-blue-700", bg: "bg-blue-100" },
    RELEASED: { icon: CheckCircle2, color: "text-green-700", bg: "bg-green-100" },
    REFUNDED: { icon: Receipt, color: "text-gray-700", bg: "bg-gray-200" },
    DISPUTED: { icon: AlertTriangle, color: "text-red-700", bg: "bg-red-100" },
    FAILED: { icon: XCircle, color: "text-red-700", bg: "bg-red-100" },
  };
  const cfg = map[status] ?? { icon: FileText, color: "text-gray-700", bg: "bg-gray-100" };
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${cfg.bg} ${cfg.color}`}
    >
      <Icon className="w-3 h-3" />
      {status.replace(/_/g, " ")}
    </span>
  );
}
