"use client";

import { useState, useTransition } from "react";
import { approveBarber, rejectBarber, toggleBarberBlock } from "../../actions";
import ConfirmModal from "../../ConfirmModal";

type Action = "approve" | "reject" | "block" | "unblock" | null;

const MIN_REJECT_REASON_CHARS = 10;

export default function BarberActions({
  barberId,
  status,
  barberName,
}: {
  barberId: string;
  status: string;
  barberName: string;
}) {
  const [activeAction, setActiveAction] = useState<Action>(null);
  const [pending, startTransition] = useTransition();
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  function handleConfirm() {
    startTransition(async () => {
      try {
        switch (activeAction) {
          case "approve":
            await approveBarber(barberId);
            break;
          case "reject":
            // Client-side sanity check — server enforces the same rule.
            if (rejectReason.trim().length < MIN_REJECT_REASON_CHARS) {
              setRejectError(
                `Reason must be at least ${MIN_REJECT_REASON_CHARS} characters.`
              );
              return;
            }
            await rejectBarber(barberId, rejectReason.trim());
            break;
          case "block":
          case "unblock":
            await toggleBarberBlock(barberId, status);
            break;
        }
        setActiveAction(null);
        setRejectReason("");
        setRejectError(null);
      } catch (err) {
        setRejectError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function closeModal() {
    if (pending) return;
    setActiveAction(null);
    setRejectReason("");
    setRejectError(null);
  }

  const isPending = status === "PENDING";
  const isBlocked = status === "BLOCKED";
  const isRejected = status === "REJECTED";
  const isApproved = status === "APPROVED";

  const approveModal = {
    title: `Approve ${barberName}?`,
    description:
      "This barber will be able to appear in search results and receive bookings from customers.",
    confirmLabel: "Confirm Approve",
    variant: "success" as const,
  };
  const blockModal = {
    title: `Block ${barberName}?`,
    description: "They will be removed from search results and unable to receive new bookings.",
    confirmLabel: "Confirm Block",
    variant: "danger" as const,
  };
  const unblockModal = {
    title: `Unblock ${barberName}?`,
    description: "They will be able to receive bookings and appear in search results again.",
    confirmLabel: "Confirm Unblock",
    variant: "success" as const,
  };

  return (
    <>
      <div className="sticky bottom-0 z-10 bg-white border-t border-gray-200 px-6 py-4 -mx-4 sm:-mx-6 lg:-mx-8 mt-6">
        <div className="flex items-center justify-end gap-3 max-w-screen-xl mx-auto">
          {isPending && (
            <button
              type="button"
              onClick={() => setActiveAction("reject")}
              className="px-6 py-2.5 text-sm font-bold uppercase tracking-wider rounded-lg border-2 border-[#D42B2B] text-[#D42B2B] hover:bg-red-50 transition-colors"
            >
              Reject
            </button>
          )}

          {(isPending || isApproved) && (
            <button
              type="button"
              onClick={() => setActiveAction("block")}
              className="px-6 py-2.5 text-sm font-bold uppercase tracking-wider rounded-lg bg-[#D42B2B] text-white hover:bg-[#A81E1E] transition-colors"
            >
              Block
            </button>
          )}
          {isBlocked && (
            <button
              type="button"
              onClick={() => setActiveAction("unblock")}
              className="px-6 py-2.5 text-sm font-bold uppercase tracking-wider rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
            >
              Unblock
            </button>
          )}

          {(isPending || isRejected) && (
            <button
              type="button"
              onClick={() => setActiveAction("approve")}
              className="px-8 py-2.5 text-sm font-bold uppercase tracking-wider rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              Approve
            </button>
          )}
        </div>
      </div>

      {/* Reject gets a custom dialog to capture the reason. Everything else
          reuses the existing ConfirmModal. */}
      {activeAction === "reject" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Reject {barberName}?
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              The barber will see this reason and can update their profile before resubmitting.
            </p>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                if (rejectError) setRejectError(null);
              }}
              placeholder="e.g. Profile photo is blurry — please retake with good lighting."
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#D42B2B] focus:outline-none focus:ring-1 focus:ring-[#D42B2B]"
              disabled={pending}
            />
            <p className="mt-1 text-xs text-gray-500">
              Minimum {MIN_REJECT_REASON_CHARS} characters.
            </p>
            {rejectError && (
              <p className="mt-2 text-sm text-red-600">{rejectError}</p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={pending}
                className="px-5 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={pending}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#D42B2B] text-white hover:bg-[#A81E1E] disabled:opacity-50"
              >
                {pending ? "Rejecting…" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeAction && activeAction !== "reject" && (
        <ConfirmModal
          open={true}
          onClose={closeModal}
          onConfirm={handleConfirm}
          title={
            activeAction === "approve"
              ? approveModal.title
              : activeAction === "block"
                ? blockModal.title
                : unblockModal.title
          }
          description={
            activeAction === "approve"
              ? approveModal.description
              : activeAction === "block"
                ? blockModal.description
                : unblockModal.description
          }
          confirmLabel={
            activeAction === "approve"
              ? approveModal.confirmLabel
              : activeAction === "block"
                ? blockModal.confirmLabel
                : unblockModal.confirmLabel
          }
          variant={
            activeAction === "approve"
              ? approveModal.variant
              : activeAction === "block"
                ? blockModal.variant
                : unblockModal.variant
          }
          loading={pending}
        />
      )}
    </>
  );
}
