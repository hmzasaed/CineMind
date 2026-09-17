import type { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/** Centered auth page shell used by Login/Register/Forgot/Reset pages. */
export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <main className="relative isolate flex min-h-[70vh] flex-1 items-center justify-center overflow-hidden px-4 py-12">
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -z-10 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(207,154,82,0.09),transparent_60%)]"
      />
      <div className="glass w-full max-w-sm animate-fade-up rounded-2xl p-8 shadow-glow-soft">
        <p className="font-display text-xl font-bold text-gold-300">CineMind</p>
        <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-white">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-slate-400">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export const inputClass =
  "mt-1 w-full rounded-lg border border-white/10 bg-ink-800/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 transition focus-visible:border-gold-400/60 focus-visible:outline-none";

export const fieldClass = "block text-sm font-medium text-slate-300";

export const primaryBtnClass =
  "mt-6 w-full rounded-lg bg-gold-400 px-4 py-2.5 text-sm font-semibold text-ink-950 transition duration-200 hover:bg-gold-300 hover:shadow-glow-copper disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300";