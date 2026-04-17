"use client";

import { useState, useTransition } from "react";
import { toggleUserBlock } from "../actions";
import ConfirmModal from "../ConfirmModal";

export default function BlockUserButton({
  userId,
  isBlocked,
  userName,
}: {
  userId: string;
  isBlocked: boolean;
  userName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      await toggleUserBlock(userId, isBlocked);
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
        title={isBlocked ? `Unblock ${userName}?` : `Block ${userName}?`}
        description={
          isBlocked
            ? `Are you sure you want to unblock this user? They will be able to make bookings again.`
            : `Are you sure you want to block this user? This will prevent them from making any future appointments.`
        }
        confirmLabel={isBlocked ? "Confirm Unblock" : "Confirm Block"}
        loading={pending}
      />
    </>
  );
}
