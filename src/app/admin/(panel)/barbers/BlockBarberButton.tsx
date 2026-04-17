"use client";

import { useState, useTransition } from "react";
import { toggleBarberBlock } from "../actions";
import ConfirmModal from "../ConfirmModal";

export default function BlockBarberButton({
  barberId,
  status,
  barberName,
}: {
  barberId: string;
  status: string;
  barberName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isBlocked = status === "BLOCKED";

  function handleConfirm() {
    startTransition(async () => {
      await toggleBarberBlock(barberId, status);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[#D42B2B] text-xs font-bold uppercase tracking-wider hover:underline"
      >
        {isBlocked ? "Unblock" : "Block"}
      </button>

      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
        variant={isBlocked ? "success" : "danger"}
        title={isBlocked ? `Unblock ${barberName}?` : `Block ${barberName}?`}
        description={
          isBlocked
            ? `Are you sure you want to unblock this barber? They will be able to receive bookings and appear in search results again.`
            : `Are you sure you want to block this barber? They will be removed from search results and unable to receive new bookings.`
        }
        confirmLabel={isBlocked ? "Confirm Unblock" : "Confirm Block"}
        loading={pending}
      />
    </>
  );
}
