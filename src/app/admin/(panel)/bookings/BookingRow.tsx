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
  barberName: string;
  services: { name: string; priceInPence: number }[];
  payment: { status: string; stripePaymentIntentId: string } | null;
  verificationCode: { code: string; isUsed: boolean } | null;
};

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
        <td className="px-6 py-4 font-medium text-[#1A1A1A]">{b.customerName}</td>
        <td className="px-6 py-4 text-gray-700">{b.barberName}</td>
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

                {/* Payment & Verification */}
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                    Payment & verification
                  </h4>
                  <div className="space-y-3">
                    {paymentInfo ? (
                      <div className="flex items-start gap-2">
                        <PaymentIcon className={`w-5 h-5 shrink-0 mt-0.5 ${paymentInfo.color}`} />
                        <div>
                          <p className="text-sm font-medium text-[#1A1A1A]">
                            {paymentInfo.label}
                          </p>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                            Stripe Auth {b.payment!.status === "HELD" || b.payment!.status === "RELEASED" ? "Success" : b.payment!.status}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No payment recorded</p>
                    )}

                    {b.verificationCode ? (
                      <div className="flex items-start gap-2">
                        {b.verificationCode.isUsed ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                        ) : (
                          <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-[#1A1A1A]">
                            {b.verificationCode.isUsed ? "Verified" : "Verification Pending"}
                          </p>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                            Code: BH-{b.verificationCode.code}
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
