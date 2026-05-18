"use client";

import { useState, useTransition } from "react";
import { Ban, RotateCcw } from "lucide-react";
import { resolveDispute, blockBarberFromReport } from "../../actions";
import ConfirmModal from "../../ConfirmModal";

type ResolveAction = "UNDER_REVIEW" | "RESOLVE_REFUND" | "RESOLVE_NO_REFUND" | "REJECT";

const REFUNDABLE = new Set(["HELD", "PENDING_RELEASE", "RELEASED", "DISPUTED"]);

export default function DisputeDetailActions({
  reportId,
  isOpen,
  barberIsBlocked,
  paymentStatus,
  // = Booking.totalInPence = the service amount (the £4.99 fee is on top
  // and is NOT refunded — the platform keeps it per client policy).
  serviceRefundInPence,
}: {
  reportId: string;
  isOpen: boolean;
  barberIsBlocked: boolean;
  paymentStatus: string | null;
  serviceRefundInPence: number;
}) {
  const [activeAction, setActiveAction] = useState<ResolveAction | "BLOCK_BARBER" | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [pending, startTransition] = useTransition();

  // Refunds are binary now: approving a dispute refunds the service
  // amount, the platform keeps the £4.99, the barber nets £0 and the
  // booking is cancelled. No partial amount to enter.
  const canRefund =
    isOpen && paymentStatus !== null && REFUNDABLE.has(paymentStatus);

  function handleConfirm() {
    if (!activeAction) return;

    if (activeAction === "BLOCK_BARBER") {
      startTransition(async () => {
        await blockBarberFromReport(reportId);
        setActiveAction(null);
      });
      return;
    }

    startTransition(async () => {
      await resolveDispute(reportId, activeAction, adminNote || undefined);
      setActiveAction(null);
      setAdminNote("");
    });
  }

  const refundLabel = `£${(serviceRefundInPence / 100).toFixed(2)}`;

  const modalConfig: Record<
    ResolveAction | "BLOCK_BARBER",
    { title: string; description: string; confirmLabel: string; variant: "danger" | "success" }
  > = {
    RESOLVE_REFUND: {
      title: "Approve dispute & refund?",
      description: `The customer will be refunded ${refundLabel} (the service amount) via Stripe. The £4.99 platform fee is non-refundable and stays with BarberHero. The barber receives £0 for this booking and it will be marked cancelled.`,
      confirmLabel: "Refund & Resolve",
      variant: "danger",
    },
    UNDER_REVIEW: {
      title: "Mark as Under Review?",
      description: "This dispute will be flagged as under review. No refund is issued yet.",
      confirmLabel: "Confirm",
      variant: "success",
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
    BLOCK_BARBER: {
      title: barberIsBlocked ? "Unblock this barber?" : "Block this barber?",
      description: barberIsBlocked
        ? "The barber will be re-approved and able to take bookings again."
        : "The barber will be blocked from logging in and accepting new bookings. They can be unblocked later.",
      confirmLabel: barberIsBlocked ? "Unblock" : "Block barber",
      variant: barberIsBlocked ? "success" : "danger",
    },
  };

  if (!isOpen) {
    // Resolved already — only show the block / unblock affordance because
    // dispute resolution itself is terminal.
    return (
      <div className="space-y-2">
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
          This dispute is closed. Resolution actions are no longer available.
        </div>
        <button
          type="button"
          onClick={() => setActiveAction("BLOCK_BARBER")}
          className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors ${
            barberIsBlocked
              ? "bg-gray-100 text-[#1A1A1A] hover:bg-gray-200"
              : "bg-white border-2 border-[#D42B2B] text-[#D42B2B] hover:bg-red-50"
          }`}
        >
          {barberIsBlocked ? <RotateCcw className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
          {barberIsBlocked ? "Unblock barber" : "Block barber"}
        </button>

        {activeAction === "BLOCK_BARBER" && (
          <ConfirmModal
            open={true}
            onClose={() => setActiveAction(null)}
            onConfirm={handleConfirm}
            title={modalConfig.BLOCK_BARBER.title}
            description={modalConfig.BLOCK_BARBER.description}
            confirmLabel={modalConfig.BLOCK_BARBER.confirmLabel}
            variant={modalConfig.BLOCK_BARBER.variant}
            loading={pending}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {canRefund && (
        <div className="rounded-lg border border-gray-200 p-3 bg-gray-50 text-[11px] text-gray-600 leading-relaxed">
          Approving refunds <span className="font-semibold">{refundLabel}</span> (service
          amount) to the customer. The £4.99 platform fee is kept; the barber
          receives £0 and the booking is cancelled.
        </div>
      )}

      <textarea
        value={adminNote}
        onChange={(e) => setAdminNote(e.target.value)}
        placeholder="Internal admin note (shown in the audit log)"
        rows={3}
        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-[#1A1A1A] placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#D42B2B] scheme-light"
      />

      <div className="space-y-2">
        {canRefund && (
          <button
            type="button"
            onClick={() => setActiveAction("RESOLVE_REFUND")}
            disabled={pending}
            className="w-full px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg bg-[#D42B2B] text-white hover:bg-[#A81E1E] disabled:opacity-60 transition-colors"
          >
            Resolve & Refund
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveAction("RESOLVE_NO_REFUND")}
          disabled={pending}
          className="w-full px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-60 transition-colors"
        >
          Resolve (no refund)
        </button>
        <button
          type="button"
          onClick={() => setActiveAction("UNDER_REVIEW")}
          disabled={pending}
          className="w-full px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-60 transition-colors"
        >
          Mark under review
        </button>
        <button
          type="button"
          onClick={() => setActiveAction("REJECT")}
          disabled={pending}
          className="w-full px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border-2 border-[#D42B2B] text-[#D42B2B] hover:bg-red-50 disabled:opacity-60 transition-colors"
        >
          Reject dispute
        </button>
        <button
          type="button"
          onClick={() => setActiveAction("BLOCK_BARBER")}
          disabled={pending}
          className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors disabled:opacity-60 ${
            barberIsBlocked
              ? "bg-gray-100 text-[#1A1A1A] hover:bg-gray-200"
              : "bg-white border border-[#D42B2B]/40 text-[#D42B2B] hover:bg-red-50"
          }`}
        >
          {barberIsBlocked ? <RotateCcw className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
          {barberIsBlocked ? "Unblock barber" : "Block barber"}
        </button>
      </div>

      {activeAction && (
        <ConfirmModal
          open={true}
          onClose={() => { setActiveAction(null); setAdminNote(""); }}
          onConfirm={handleConfirm}
          title={modalConfig[activeAction].title}
          description={modalConfig[activeAction].description}
          confirmLabel={modalConfig[activeAction].confirmLabel}
          variant={modalConfig[activeAction].variant}
          loading={pending}
        />
      )}
    </div>
  );
}
