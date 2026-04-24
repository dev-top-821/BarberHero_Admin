"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import {
  markWithdrawalProcessing,
  markWithdrawalPaid,
  markWithdrawalFailed,
} from "../actions";

const MIN_BANK_REFERENCE_CHARS = 4;
const MIN_FAILURE_REASON_CHARS = 10;

type Data = {
  id: string;
  status: string;
  amountInPence: number;
  feeInPence: number;
  netInPence: number;
  createdAt: string;
  processedAt: string | null;
  bankAccountName: string;
  bankSortCode: string;
  bankAccountNumber: string;   // full — masked client-side unless revealed
  bankReference: string | null;
  adminNote: string | null;
  barberName: string;
  barberPhoto: string | null;
};

const statusStyle: Record<string, string> = {
  REQUESTED: "bg-yellow-100 text-yellow-700",
  PROCESSING: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatSortCode(raw: string): string {
  if (raw.length !== 6) return raw;
  return `${raw.slice(0, 2)}-${raw.slice(2, 4)}-${raw.slice(4, 6)}`;
}

type Dialog = "paid" | "failed" | null;

export default function WithdrawalRow({ data: d }: { data: Data }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reveal, setReveal] = useState(false);
  const [bankReference, setBankReference] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const maskedAccount = reveal
    ? d.bankAccountNumber
    : `••••${d.bankAccountNumber.slice(-4)}`;

  const canAction = d.status === "REQUESTED" || d.status === "PROCESSING";

  function close() {
    if (pending) return;
    setDialog(null);
    setBankReference("");
    setAdminNote("");
    setFailureReason("");
    setError(null);
  }

  function confirmPaid() {
    if (bankReference.trim().length < MIN_BANK_REFERENCE_CHARS) {
      setError(`Reference must be at least ${MIN_BANK_REFERENCE_CHARS} characters.`);
      return;
    }
    startTransition(async () => {
      try {
        await markWithdrawalPaid(d.id, bankReference.trim(), adminNote.trim() || undefined);
        close();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function confirmFailed() {
    if (failureReason.trim().length < MIN_FAILURE_REASON_CHARS) {
      setError(`Reason must be at least ${MIN_FAILURE_REASON_CHARS} characters.`);
      return;
    }
    startTransition(async () => {
      try {
        await markWithdrawalFailed(d.id, failureReason.trim());
        close();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function moveToProcessing() {
    startTransition(async () => {
      try {
        await markWithdrawalProcessing(d.id);
      } catch (e) {
        // Quiet — admin will see nothing happened; retry with paid/failed.
        console.error(e);
      }
    });
  }

  return (
    <>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{d.createdAt}</td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-3">
            {d.barberPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={d.barberPhoto}
                alt=""
                className="w-8 h-8 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                {initials(d.barberName) || "?"}
              </div>
            )}
            <span className="font-medium text-[#1A1A1A]">{d.barberName}</span>
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="text-sm">
            <div className="text-[#1A1A1A] font-medium">
              {d.bankAccountName}
            </div>
            <div className="text-xs text-gray-500 font-mono flex items-center gap-2">
              <span>{formatSortCode(d.bankSortCode)}</span>
              <span>·</span>
              <span>{maskedAccount}</span>
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="text-[10px] text-blue-600 hover:underline uppercase tracking-wider"
              >
                {reveal ? "Hide" : "Show"}
              </button>
            </div>
          </div>
        </td>
        <td className="px-6 py-4 text-right">
          <div className="font-semibold text-[#1A1A1A]">
            £{(d.amountInPence / 100).toFixed(2)}
          </div>
          {d.feeInPence > 0 && (
            <div className="text-xs text-gray-500">
              net £{(d.netInPence / 100).toFixed(2)}
            </div>
          )}
        </td>
        <td className="px-6 py-4">
          <span
            className={`inline-flex px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
              statusStyle[d.status] ?? "bg-gray-100 text-gray-600"
            }`}
          >
            {d.status}
          </span>
          {d.bankReference && (
            <div className="text-[10px] text-gray-500 mt-1 font-mono">
              Ref: {d.bankReference}
            </div>
          )}
          {d.adminNote && (
            <div className="text-[10px] text-gray-500 mt-1 italic line-clamp-2">
              {d.adminNote}
            </div>
          )}
        </td>
        <td className="px-6 py-4 text-right whitespace-nowrap">
          {canAction ? (
            <div className="flex items-center justify-end gap-2">
              {d.status === "REQUESTED" && (
                <button
                  type="button"
                  onClick={moveToProcessing}
                  disabled={pending}
                  className="text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-[#1A1A1A]"
                >
                  Processing
                </button>
              )}
              <button
                type="button"
                onClick={() => setDialog("failed")}
                disabled={pending}
                className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded border-2 border-[#D42B2B] text-[#D42B2B] hover:bg-red-50"
              >
                Failed
              </button>
              <button
                type="button"
                onClick={() => setDialog("paid")}
                disabled={pending}
                className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded bg-green-600 text-white hover:bg-green-700"
              >
                Mark paid
              </button>
            </div>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
      </tr>

      {/* Mark-paid dialog */}
      {dialog === "paid" && (
        <tr>
          <td colSpan={6} className="p-0">
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-gray-900">
                  Mark paid — £{(d.amountInPence / 100).toFixed(2)} to {d.barberName}
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  Confirms you've sent the bank transfer. The barber gets a push
                  saying funds are on the way.
                </p>
                <label className="mt-4 block text-sm font-medium text-gray-700">
                  Bank reference <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={bankReference}
                  onChange={(e) => {
                    setBankReference(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="e.g. FPS-20260424-ABCD"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600 font-mono"
                  disabled={pending}
                />
                <p className="mt-1 text-xs text-gray-500">
                  From your banking app's confirmation. Audit trail.
                </p>
                <label className="mt-4 block text-sm font-medium text-gray-700">
                  Note (optional)
                </label>
                <textarea
                  rows={2}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Internal note — not shown to the barber."
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
                  disabled={pending}
                />
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={close}
                    disabled={pending}
                    className="px-5 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmPaid}
                    disabled={pending}
                    className="px-5 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    {pending ? "Saving…" : "Mark paid"}
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}

      {/* Mark-failed dialog */}
      {dialog === "failed" && (
        <tr>
          <td colSpan={6} className="p-0">
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-gray-900">
                  Mark failed — £{(d.amountInPence / 100).toFixed(2)} to {d.barberName}
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  The amount is restored to the barber's available balance. They get a
                  push with the reason below.
                </p>
                <label className="mt-4 block text-sm font-medium text-gray-700">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={failureReason}
                  onChange={(e) => {
                    setFailureReason(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="e.g. Bank rejected — account name mismatch. Please double-check your details."
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#D42B2B] focus:outline-none focus:ring-1 focus:ring-[#D42B2B]"
                  disabled={pending}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Minimum {MIN_FAILURE_REASON_CHARS} characters. Barber sees this text.
                </p>
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={close}
                    disabled={pending}
                    className="px-5 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmFailed}
                    disabled={pending}
                    className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#D42B2B] text-white hover:bg-[#A81E1E] disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    {pending ? "Saving…" : "Mark failed"}
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
