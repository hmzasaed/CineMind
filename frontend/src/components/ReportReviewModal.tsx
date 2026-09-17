import { useEffect, useRef, useState } from "react";
import { REPORT_REASONS, type ReportReason } from "../lib/api";
import { apiErrorMessage } from "../lib/format";
import { useReportReview } from "../lib/queries";

const REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  harassment: "Harassment or abuse",
  incorrect: "Factually incorrect",
  spoilers: "Unmarked spoilers",
  other: "Other",
};

interface ReportReviewModalProps {
  reviewId: string;
  open: boolean;
  onClose: () => void;
}

/** Native <dialog> gives us focus trapping, Escape-to-close, and a backdrop for free. */
export function ReportReviewModal({ reviewId, open, onClose }: ReportReviewModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const report = useReportReview();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await report.mutateAsync({ reviewId, reason, details: details.trim() || undefined });
      setDetails("");
      onClose();
    } catch {
      // surfaced inline below via report.isError
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="glass w-full max-w-md rounded-2xl bg-ink-900/95 p-0 text-slate-200 shadow-glow-soft backdrop:bg-ink-950/70 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4 p-5">
        <h2 className="font-display text-lg font-semibold text-white">Report this review</h2>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-300">Reason</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as ReportReason)}
            className="rounded-lg border border-white/15 bg-ink-800/80 px-3 py-2 text-sm text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
          >
            {REPORT_REASONS.map((r) => (
              <option key={r} value={r}>
                {REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-300">Details (optional)</span>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={2000}
            rows={3}
            className="rounded-lg border border-white/15 bg-ink-800/80 px-3 py-2 text-sm text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
          />
        </label>

        {report.isError && (
          <p role="alert" className="text-xs text-red-400">
            {apiErrorMessage(report.error, "Could not submit the report.")}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={report.isPending}
            className="rounded-lg bg-gold-400 px-4 py-2 text-sm font-semibold text-ink-950 transition duration-200 hover:bg-gold-300 hover:shadow-glow-copper disabled:opacity-60 disabled:hover:shadow-none"
          >
            {report.isPending ? "Reporting…" : "Submit report"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
