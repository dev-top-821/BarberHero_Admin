"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

type Variant = "danger" | "success";

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  variant = "danger",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: Variant;
  loading?: boolean;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isDanger = variant === "danger";

  return (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center whitespace-normal animate-in fade-in zoom-in-95 duration-200">
        <div
          className={`mx-auto w-14 h-14 rounded-xl flex items-center justify-center mb-5 ${
            isDanger ? "bg-red-100" : "bg-green-100"
          }`}
        >
          {isDanger ? (
            <AlertTriangle className="w-7 h-7 text-[#D42B2B]" />
          ) : (
            <CheckCircle2 className="w-7 h-7 text-green-600" />
          )}
        </div>

        <h2 className="text-xl font-bold text-[#1A1A1A] mb-2">{title}</h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">
          {description}
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 text-sm font-bold uppercase tracking-wider rounded-lg bg-gray-100 text-[#1A1A1A] hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider rounded-lg text-white disabled:opacity-50 transition-colors ${
              isDanger
                ? "bg-[#D42B2B] hover:bg-[#A81E1E]"
                : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>

        <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-5">
          Action will be logged in security audit
        </p>
      </div>
    </div>
  );
}
