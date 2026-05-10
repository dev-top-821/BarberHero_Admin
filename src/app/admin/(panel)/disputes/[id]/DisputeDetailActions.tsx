"use client";

import { useState, useTransition } from "react";
import { Ban, RotateCcw } from "lucide-react";
import { resolveDispute, blockBarberFromReport } from "../../actions";
import ConfirmModal from "../../ConfirmModal";

type ResolveAction = "UNDER_REVIEW" | "RESOLVE_REFUND" | "RESOLVE_NO_REFUND" | "REJECT";

export default function DisputeDetailActions({
  reportId,
  isOpen,
  barberIsBlocked,
  paymentStatus,
  bookingTotalInPence,
  alreadyRefundedInPence,
}: {
  reportId: string;
  isOpen: boolean;
  barberIsBlocked: boolean;
  paymentStatus: string | null;
  bookingTotalInPence: number;
  alreadyRefundedInPence: number;
}) {
  const [activeAction, setActiveAction] = useState<ResolveAction | "BLOCK_BARBER" | null>(null);
  const [adminNote, setAdminNote] = useState("");
  // Refund amount in pounds — string so the input can hold an empty / partial value
  // while the user types. Defaults to the remaining refundable amount.
  const remainingRefundablePence = Math.max(0, bookingTotalInPence - alreadyRefundedInPence);
  const [refundAmount, setRefundAmount] = useState<string>(
    (remainingRefundablePence / 100).toFixed(2),
  );
  const [pending, startTransition] = useTransition();

  // Refund only allowed while there's still money to refund + the
  // payment is in a refundable state. Pre-capture HELD only allows full
  // refund — the server enforces this; the UI just gates the action.
  const canRefund =
    isOpen &&
    paymentStatus !== null &&
    (paymentStatus === "HELD" || paymentStatus === "PENDING_RELEASE") &&
    remainingRefundablePence > 0;

  function handleConfirm() {
    if (!activeAction) return;

    if (activeAction === "BLOCK_BARBER") {
      startTransition(async () => {
        await blockBarberFromReport(reportId);
        setActiveAction(null);
      });
      return;
    }

    if (activeAction === "RESOLVE_REFUND") {
      // Convert pounds string → pence integer. Reject anything outside
      // [1p, remaining] before hitting the server.
      const parsed = Number.parseFloat(refundAmount);
      if (!Number.isFinite(parsed) || parsed <= 0) return;
      const pence = Math.round(parsed * 100);
      if (pence < 1 || pence > remainingRefundablePence) return;
      startTransition(async () => {
        await resolveDispute(reportId, "RESOLVE_REFUND", adminNote || undefined, pence);
        setActiveAction(null);
        setAdminNote("");
      });
      return;
    }

    startTransition(async () => {
      await resolveDispute(reportId, activeAction, adminNote || undefined);
      setActiveAction(null);
      setAdminNote("");
    });
  }

  // Configuration for ConfirmModal per action.
  const modalConfig: Record<
    "UNDER_REVIEW" | "RESOLVE_NO_REFUND" | "REJECT" | "BLOCK_BARBER",
    { title: string; description: string; confirmLabel: string; variant: "danger" | "success" }
  > = {
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
        <div className="rounded-lg border border-gray-200 p-3 space-y-2 bg-gray-50">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Refund amount (£)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-sm">£</span>
            <input
              type="number"
              min={0.01}
              max={remainingRefundablePence / 100}
              step={0.01}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              className="flex-1 px-2 py-1.5 bg-white border border-gray-200 rounded-md text-sm outline-none focus:ring-2 focus:ring-[#D42B2B]"
            />
          </div>
          <p className="text-[11px] text-gray-500">
            Up to £{(remainingRefundablePence / 100).toFixed(2)} refundable.
            {paymentStatus === "HELD" &&
              " Pre-capture refunds are full only — partial unavailable."}
          </p>
        </div>
      )}

      <textarea
        value={adminNote}
        onChange={(e) => setAdminNote(e.target.value)}
        placeholder="Internal admin note (shown in the audit log)"
        rows={3}
        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#D42B2B]"
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

      {activeAction === "RESOLVE_REFUND" && (() => {
        const parsed = Number.parseFloat(refundAmount);
        const pence = Math.round((Number.isFinite(parsed) ? parsed : 0) * 100);
        const isFull = pence === remainingRefundablePence && alreadyRefundedInPence === 0;
        return (
          <ConfirmModal
            open={true}
            onClose={() => setActiveAction(null)}
            onConfirm={handleConfirm}
            title={isFull ? "Resolve with full refund?" : "Issue partial refund?"}
            description={
              isFull
                ? `The customer will be refunded £${(pence / 100).toFixed(2)} via Stripe. The booking will be marked cancelled.`
                : `£${(pence / 100).toFixed(2)} of £${(bookingTotalInPence / 100).toFixed(2)} will be refunded. The booking stays open and the dispute is marked resolved.`
            }
            confirmLabel={isFull ? "Refund & Resolve" : "Issue partial refund"}
            variant="danger"
            loading={pending}
          />
        );
      })()}

      {activeAction && activeAction !== "RESOLVE_REFUND" && (
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
