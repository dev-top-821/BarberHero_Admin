"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, Clock, XCircle, MapPin } from "lucide-react";

const statusStyle: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-green-100 text-green-700",
  ON_THE_WAY: "bg-blue-100 text-blue-700",
  STARTED: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-200 text-gray-600",
};

const paymentStatusIcon: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  HELD: { icon: CheckCircle2, label: "Payment Held", color: "text-green-600" },
  RELEASED: { icon: CheckCircle2, label: "Payment Released", color: "text-green-600" },
  REFUNDED: { icon: XCircle, label: "Payment Refunded", color: "text-orange-500" },
  FAILED: { icon: XCircle, label: "Payment Failed", color: "text-red-600" },
};

type BookingData = {
  id: string;
  date: string;
  startTime: string;
  status: string;
  address: string;
  totalInPence: number;
  customerName: string;
  customerPhoto: string | null;
  barberName: string;
  barberPhoto: string | null;
  services: { name: string; priceInPence: number }[];
  payment: {
    status: string;
    stripePaymentIntentId: string;
    createdAt: string;
    capturedAt: string | null;
    heldUntil: string | null;
    releasedAt: string | null;
    refundedAt: string | null;
    refundReason: string | null;
  } | null;
  verificationCode: { code: string; isUsed: boolean } | null;
};

const tsFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function fmtTs(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return tsFmt.format(new Date(iso));
  } catch {
    return null;
  }
}

export default function BookingRow({ booking: b }: { booking: BookingData }) {
  const [expanded, setExpanded] = useState(false);

  const paymentInfo = b.payment
    ? paymentStatusIcon[b.payment.status] ?? { icon: Clock, label: b.payment.status, color: "text-gray-500" }
    : null;
  const PaymentIcon = paymentInfo?.icon ?? Clock;

  return (
    <>
      <tr
        onClick={() => setExpanded((v) => !v)}
        className="hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <td className="px-6 py-4 font-mono text-xs text-[#D42B2B] font-semibold">
          #BH-{b.id.slice(0, 4).toUpperCase()}
        </td>
        <td className="px-6 py-4">
          <NameAvatar name={b.customerName} url={b.customerPhoto} emphasis="strong" />
        </td>
        <td className="px-6 py-4">
          <NameAvatar name={b.barberName} url={b.barberPhoto} emphasis="regular" />
        </td>
        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
          {b.date} · {b.startTime}
        </td>
        <td className="px-6 py-4">
          {b.services.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {b.services.slice(0, 2).map((s, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 bg-gray-100 rounded text-[11px] text-gray-700 font-medium"
                >
                  {s.name}
                </span>
              ))}
              {b.services.length > 2 && (
                <span className="px-2 py-0.5 bg-gray-100 rounded text-[11px] text-gray-500">
                  +{b.services.length - 2}
                </span>
              )}
            </div>
          )}
        </td>
        <td className="px-6 py-4">
          <span
            className={`inline-flex px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
              statusStyle[b.status] ?? "bg-gray-100 text-gray-600"
            }`}
          >
            {b.status.replace(/_/g, " ")}
          </span>
        </td>
        <td className="px-6 py-4 text-right text-[#1A1A1A] font-semibold">
          £{(b.totalInPence / 100).toFixed(2)}
        </td>
        <td className="px-4 py-4 text-gray-400">
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={8} className="px-0 py-0">
            <div className="bg-gray-50 border-t border-b border-gray-100 px-6 py-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {/* Detailed Services */}
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                    Detailed services
                  </h4>
                  {b.services.length === 0 ? (
                    <p className="text-sm text-gray-400">No services</p>
                  ) : (
                    <div className="space-y-1.5">
                      {b.services.map((s, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-[#1A1A1A]">{s.name}</span>
                          <span className="text-[#1A1A1A] font-medium">
                            £{(s.priceInPence / 100).toFixed(2)}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-200">
                        <span className="text-[#1A1A1A]">Total</span>
                        <span className="text-[#1A1A1A]">
                          £{(b.totalInPence / 100).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Location */}
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                    Location
                  </h4>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-[#1A1A1A] leading-relaxed">
                      {b.address}
                    </p>
                  </div>
                </div>

                {/* Payment timeline & verification */}
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                    Payment timeline
                  </h4>
                  {b.payment ? (
                    <PaymentTimeline payment={b.payment} />
                  ) : (
                    <p className="text-sm text-gray-400">No payment recorded</p>
                  )}

                  <div className="mt-4">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                      Verification
                    </h4>
                    {b.verificationCode ? (
                      <div className="flex items-start gap-2">
                        {b.verificationCode.isUsed ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                        ) : (
                          <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="text-sm text-[#1A1A1A]">
                            {b.verificationCode.isUsed ? "Code used" : "Awaiting code"}
                          </p>
                          <p className="text-[10px] text-gray-500 font-mono">
                            {b.verificationCode.code}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No verification code</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Small name + avatar pill used in list rows. Renders a real photo when
// present; otherwise a dark circle with initials.
function NameAvatar({
  name,
  url,
  emphasis,
}: {
  name: string;
  url: string | null;
  emphasis: "strong" | "regular";
}) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex items-center gap-2.5">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="w-7 h-7 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
          {initials || "?"}
        </div>
      )}
      <span
        className={
          emphasis === "strong"
            ? "font-medium text-[#1A1A1A]"
            : "text-gray-700"
        }
      >
        {name}
      </span>
    </div>
  );
}

// Payment timeline — vertical list of state transitions with timestamps.
// Derived entirely from Payment columns (createdAt, capturedAt, heldUntil,
// releasedAt, refundedAt); no separate event log table.
function PaymentTimeline({
  payment,
}: {
  payment: NonNullable<BookingData["payment"]>;
}) {
  type Step = {
    label: string;
    ts: string | null;
    description?: string;
    accent?: "ok" | "warn" | "err";
    future?: boolean;
  };

  const steps: Step[] = [];

  steps.push({
    label: "Payment authorised",
    ts: fmtTs(payment.createdAt),
    description: "Funds held on card",
    accent: "ok",
  });

  if (payment.capturedAt) {
    steps.push({
      label: "Captured",
      ts: fmtTs(payment.capturedAt),
      description: "Moved to platform balance",
      accent: "ok",
    });
  }

  if (payment.heldUntil && !payment.releasedAt && !payment.refundedAt) {
    const released = fmtTs(payment.heldUntil);
    steps.push({
      label: "Release scheduled",
      ts: released,
      description: "Pending → available",
      accent: "warn",
      future: true,
    });
  }

  if (payment.releasedAt) {
    steps.push({
      label: "Released",
      ts: fmtTs(payment.releasedAt),
      description: "Credited to barber's wallet",
      accent: "ok",
    });
  }

  if (payment.refundedAt) {
    steps.push({
      label: "Refunded",
      ts: fmtTs(payment.refundedAt),
      description: payment.refundReason ?? "Returned to customer",
      accent: "err",
    });
  }

  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => {
        const dot =
          s.future
            ? "border-amber-400 bg-white"
            : s.accent === "err"
              ? "bg-red-500 border-red-500"
              : s.accent === "warn"
                ? "bg-amber-400 border-amber-400"
                : "bg-green-500 border-green-500";
        const line = i === steps.length - 1 ? "" : "after:absolute after:left-[5px] after:top-3 after:bottom-[-10px] after:w-px after:bg-gray-200";
        return (
          <li key={i} className={`relative pl-6 ${line}`}>
            <span
              className={`absolute left-0 top-1 w-2.75 h-2.75 rounded-full border-2 ${dot}`}
            />
            <div className="flex items-baseline justify-between gap-2">
              <p className={`text-sm font-semibold text-[#1A1A1A] ${s.future ? "italic text-gray-500" : ""}`}>
                {s.label}
              </p>
              {s.ts && (
                <p className="text-[11px] text-gray-500 whitespace-nowrap">{s.ts}</p>
              )}
            </div>
            {s.description && (
              <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
