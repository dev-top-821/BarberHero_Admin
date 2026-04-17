"use client";

import { useState, useTransition } from "react";
import { approveBarber, rejectBarber, toggleBarberBlock } from "../../actions";
import ConfirmModal from "../../ConfirmModal";

type Action = "approve" | "reject" | "block" | "unblock" | null;

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

  function handleConfirm() {
    startTransition(async () => {
      switch (activeAction) {
        case "approve":
          await approveBarber(barberId);
          break;
        case "reject":
          await rejectBarber(barberId);
          break;
        case "block":
          await toggleBarberBlock(barberId, status);
          break;
        case "unblock":
          await toggleBarberBlock(barberId, status);
          break;
      }
      setActiveAction(null);
    });
  }

  const modalConfig: Record<string, {
    title: string;
    description: string;
    confirmLabel: string;
    variant: "danger" | "success";
  }> = {
    approve: {
      title: `Approve ${barberName}?`,
      description: "This barber will be able to appear in search results and receive bookings from customers.",
      confirmLabel: "Confirm Approve",
      variant: "success",
    },
    reject: {
      title: `Reject ${barberName}?`,
      description: "This barber's application will be rejected. They can re-apply by updating their profile.",
      confirmLabel: "Confirm Reject",
      variant: "danger",
    },
    block: {
      title: `Block ${barberName}?`,
      description: "They will be removed from search results and unable to receive new bookings.",
      confirmLabel: "Confirm Block",
      variant: "danger",
    },
    unblock: {
      title: `Unblock ${barberName}?`,
      description: "They will be able to receive bookings and appear in search results again.",
      confirmLabel: "Confirm Unblock",
      variant: "success",
    },
  };

  const isPending = status === "PENDING";
  const isBlocked = status === "BLOCKED";
  const isRejected = status === "REJECTED";
  const isApproved = status === "APPROVED";

  return (
    <>
      <div className="sticky bottom-0 z-10 bg-white border-t border-gray-200 px-6 py-4 -mx-4 sm:-mx-6 lg:-mx-8 mt-6">
        <div className="flex items-center justify-end gap-3 max-w-screen-xl mx-auto">
          {/* Reject — show for PENDING */}
          {isPending && (
            <button
              type="button"
              onClick={() => setActiveAction("reject")}
              className="px-6 py-2.5 text-sm font-bold uppercase tracking-wider rounded-lg border-2 border-[#D42B2B] text-[#D42B2B] hover:bg-red-50 transition-colors"
            >
              Reject
            </button>
          )}

          {/* Block / Unblock */}
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

          {/* Approve — show for PENDING or REJECTED */}
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

      {activeAction && modalConfig[activeAction] && (
        <ConfirmModal
          open={true}
          onClose={() => setActiveAction(null)}
          onConfirm={handleConfirm}
          title={modalConfig[activeAction].title}
          description={modalConfig[activeAction].description}
          confirmLabel={modalConfig[activeAction].confirmLabel}
          variant={modalConfig[activeAction].variant}
          loading={pending}
        />
      )}
    </>
  );
}
