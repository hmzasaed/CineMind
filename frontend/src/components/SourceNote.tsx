import type { Attribution, Provenance } from "../lib/api";
import { cn } from "../lib/cn";

interface SourceNoteProps {
  provenance?: Provenance;
  attribution?: Attribution;
  className?: string;
}

/** Small provenance line shown under a list of facts: source, kind, confidence. */
export function SourceNote({ provenance, attribution, className }: SourceNoteProps) {
  if (!provenance) return null;
  const confidence = Math.round(provenance.confidence * 100);
  const prefix = attribution?.notice ? `${attribution.notice} · ` : "";
  return (
    <p className={cn("text-xs text-slate-500", className)}>
      {prefix}
      Sourced from <span className="text-slate-400">{provenance.sourceName}</span> ·{" "}
      <span className="text-slate-400">{provenance.sourceKind}</span> · {confidence}% confidence
      {attribution?.termsUrl && (
        <>
          {" "}·{" "}
          <a
            href={attribution.termsUrl}
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 underline decoration-slate-600 underline-offset-2 hover:text-slate-200"
          >
            terms
          </a>
        </>
      )}
    </p>
  );
}