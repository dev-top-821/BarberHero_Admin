"use client";

import { useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronUp,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
} from "lucide-react";
import { resolveDispute } from "../actions";
import ConfirmModal from "../ConfirmModal";

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

const categoryStyle: Record<string, { color: string; icon: typeof AlertTriangle }> = {
  SERVICE_QUALITY: { color: "text-orange-600", icon: AlertTriangle },
  NO_SHOW: { color: "text-red-600", icon: XCircle },
  PAYMENT: { color: "text-blue-600", icon: FileText },
  BEHAVIOUR: { color: "text-purple-600", icon: AlertTriangle },
  OTHER: { color: "text-gray-600", icon: FileText },
};

type DisputeData = {
  id: string;
  category: string;
  description: string;
  status: string;
  requestRefund: boolean;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  customerName: string;
  barberName: string;
  bookingId: string;
  bookingDate: string;
  bookingAddress: string;
  bookingAmount: number;
  paymentStatus: string | null;
  images: { id: string; url: string }[];
  services: { name: string; priceInPence: number }[];
};

type ResolveAction = "UNDER_REVIEW" | "RESOLVE_REFUND" | "RESOLVE_NO_REFUND" | "REJECT" | null;

export default function DisputeRow({ dispute: d }: { dispute: DisputeData }) {
  const [expanded, setExpanded] = useState(false);
  const [activeResolve, setActiveResolve] = useState<ResolveAction>(null);
  const [adminNote, setAdminNote] = useState("");
  const [pending, startTransition] = useTransition();

  const catInfo = categoryStyle[d.category] ?? categoryStyle.OTHER;
  const CatIcon = catInfo.icon;
  const canResolve = d.status === "OPEN" || d.status === "UNDER_REVIEW";

  function handleResolve() {
    if (!activeResolve) return;
    startTransition(async () => {
      await resolveDispute(d.id, activeResolve, adminNote || undefined);
      setActiveResolve(null);
      setAdminNote("");
    });
  }

  const resolveConfig: Record<string, { title: string; description: string; confirmLabel: string; variant: "danger" | "success" }> = {
    UNDER_REVIEW: {
      title: "Mark as Under Review?",
      description: "This dispute will be flagged as under review. No refund is issued yet.",
      confirmLabel: "Confirm",
      variant: "success",
    },
    RESOLVE_REFUND: {
      title: "Resolve with Refund?",
      description: "The customer will be refunded via Stripe. This action cannot be undone.",
      confirmLabel: "Refund & Resolve",
      variant: "danger",
    },
    RESOLVE_NO_REFUND: {
      title: "Resolve without Refund?",
      description: "The dispute will be marked as resolved. No refund is issued to the customer.",
      confirmLabel: "Resolve",
      variant: "success",
    },
    REJECT: {
      title: "Reject this Dispute?",
      description: "The dispute will be rejected. The customer will be notified.",
      confirmLabel: "Reject Dispute",
      variant: "danger",
    },
  };

  return (
    <>
      <tr
        onClick={() => setExpanded((v) => !v)}
        className="hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{d.createdAt}</td>
        <td className="px-6 py-4 font-medium text-[#1A1A1A]">{d.customerName}</td>
        <td className="px-6 py-4 text-gray-700">{d.barberName}</td>
        <td className="px-6 py-4 font-mono text-xs text-[#D42B2B]">
          #BK-{d.bookingId.slice(0, 4).toUpperCase()}
        </td>
        <td className="px-6 py-4">
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${catInfo.color}`}>
            <CatIcon className="w-3.5 h-3.5" />
            {d.category.replace(/_/g, " ")}
          </span>
          {d.requestRefund && (
            <span
              className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-50 text-[#D42B2B] border border-[#D42B2B]/20"
              title="Customer has requested a refund"
            >
              Refund requested
            </span>
          )}
        </td>
        <td className="px-6 py-4">
          <span
            className={`inline-flex px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
              statusStyle[d.status] ?? "bg-gray-100 text-gray-600"
            }`}
          >
            {statusLabel[d.status] ?? d.status}
          </span>
        </td>
        <td className="px-4 py-4 text-gray-400">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={7} className="px-0 py-0">
            <div className="bg-gray-50 border-t border-b border-gray-100 px-6 py-5 space-y-5">
              {/* Top section: Description + Images */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Customer complaint
                  </h4>
                  <p className="text-sm text-[#1A1A1A] leading-relaxed bg-white rounded-lg border border-gray-200 p-4">
                    {d.description}
                  </p>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Evidence ({d.images.length})
                  </h4>
                  {d.images.length === 0 ? (
                    <p className="text-sm text-gray-400">No images submitted</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {d.images.map((img) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={img.id}
                          src={img.url}
                          alt=""
                          className="w-full aspect-square rounded-lg object-cover border border-gray-200"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom section: Booking + Payment + Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Booking details
                  </h4>
                  <div className="space-y-1.5 text-sm">
                    {d.services.map((s, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-gray-700">{s.name}</span>
                        <span className="text-[#1A1A1A] font-medium">
                          £{(s.priceInPence / 100).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold pt-1.5 border-t border-gray-200">
                      <span>Total</span>
                      <span>£{(d.bookingAmount / 100).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Location
                  </h4>
                  <div className="flex items-start gap-2 text-sm text-[#1A1A1A]">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    {d.bookingAddress}
                  </div>
                  <div className="mt-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                      Payment
                    </h4>
                    <div className="flex items-center gap-2 text-sm">
                      {d.paymentStatus === "HELD" || d.paymentStatus === "RELEASED" ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : d.paymentStatus === "REFUNDED" ? (
                        <Clock className="w-4 h-4 text-orange-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="text-[#1A1A1A] font-medium">
                        {d.paymentStatus ?? "No payment"}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Admin note
                  </h4>
                  {d.adminNote ? (
                    <p className="text-sm text-[#1A1A1A] bg-white rounded-lg border border-gray-200 p-3">
                      {d.adminNote}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No note yet</p>
                  )}

                  {d.resolvedAt && (
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-2">
                      Resolved: {d.resolvedAt}
                    </p>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              {canResolve && (
                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-200">
                  {d.status === "OPEN" && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setActiveResolve("UNDER_REVIEW"); }}
                      className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      Mark Under Review
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setActiveResolve("RESOLVE_REFUND"); }}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg bg-[#D42B2B] text-white hover:bg-[#A81E1E] transition-colors"
                  >
                    Resolve & Refund
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setActiveResolve("RESOLVE_NO_REFUND"); }}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Resolve (No Refund)
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setActiveResolve("REJECT"); }}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border-2 border-[#D42B2B] text-[#D42B2B] hover:bg-red-50 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}

      {activeResolve && resolveConfig[activeResolve] && (
        <tr className="hidden">
          <td>
            <ConfirmModal
              open={true}
              onClose={() => { setActiveResolve(null); setAdminNote(""); }}
              onConfirm={handleResolve}
              title={resolveConfig[activeResolve].title}
              description={resolveConfig[activeResolve].description}
              confirmLabel={resolveConfig[activeResolve].confirmLabel}
              variant={resolveConfig[activeResolve].variant}
              loading={pending}
            />
          </td>
        </tr>
      )}
    </>
  );
}
