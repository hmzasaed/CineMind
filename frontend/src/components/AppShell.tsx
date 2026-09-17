import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { cn } from "../lib/cn";
import { useScrolled } from "../lib/motion";
import { ApertureIcon, ArrowUpRightIcon, MenuIcon, UserIcon } from "./icons";

const NAV_ITEMS = [
  { to: "/", label: "Home" },
  { to: "/discover", label: "Discover" },
  { to: "/upcoming", label: "Upcoming" },
  { to: "/search", label: "Search" },
];

export function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const scrolled = useScrolled(40);

  async function onSignOut() {
    setOpen(false);
    await signOut().catch(() => undefined);
    navigate("/", { replace: true });
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "group relative rounded-lg px-3 py-1.5 text-sm font-medium transition",
      isActive ? "text-gold-300" : "text-slate-300 hover:bg-white/5 hover:text-white",
    );

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-800 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      <header
        className={cn(
          "sticky top-0 z-40 border-b transition-all duration-300 ease-cinematic",
          scrolled
            ? "border-white/10 bg-ink-950/85 backdrop-blur-xl shadow-glow-soft"
            : "border-transparent bg-gradient-to-b from-ink-950/70 to-transparent",
        )}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:gap-5">
          <Link
            to="/"
            className="group inline-flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-gold-300 transition-transform duration-200 hover:scale-[1.03]"
          >
            <ApertureIcon className="h-6 w-6 shrink-0 transition-transform duration-500 ease-cinematic group-hover:rotate-45" />
            CineMind
          </Link>

          <span className="chip-mono hidden lg:inline-flex" aria-hidden>
            <span className="h-1.5 w-1.5 rounded-full bg-azure-400 animate-pulse-soft motion-reduce:animate-none" />
            Evidence&nbsp;verified
          </span>

          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === "/"} className={navClass}>
                {({ isActive }) => (
                  <>
                    {item.label}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full bg-gold-400 transition-transform duration-300 ease-cinematic",
                        isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-50",
                      )}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-2 md:flex">
            {user ? (
              <>
                <NavLink to="/account" className={navClass}>
                  <span className="inline-flex items-center gap-1.5">
                    <UserIcon className="h-4 w-4" />
                    Profile
                  </span>
                </NavLink>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg border border-gold-400/40 bg-gold-400/10 px-3 py-1.5 text-sm font-semibold text-gold-300 transition duration-200 hover:bg-gold-400/20 hover:shadow-glow-copper"
                >
                  Register
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            className="ml-auto inline-flex items-center rounded-lg p-2 text-slate-200 transition hover:bg-white/5 md:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            <MenuIcon className={cn("h-6 w-6 transition-transform duration-200", open && "rotate-90")} />
          </button>
        </div>

        <nav
          id="mobile-menu"
          aria-label="Primary (mobile)"
          className={cn(
            "grid border-t border-white/10 bg-ink-900/95 backdrop-blur-xl transition-[grid-template-rows,opacity] duration-300 ease-cinematic md:hidden",
            open ? "grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] border-t-0 opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-1 px-4 py-3">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "rounded-lg px-3 py-2 text-sm font-medium",
                      isActive ? "bg-white/10 text-gold-300" : "text-slate-300 hover:bg-white/5",
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <div className="my-1 border-t border-white/10" />
              {user ? (
                <>
                  <NavLink
                    to="/account"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300"
                  >
                    Profile
                  </NavLink>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-300"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <NavLink
                    to="/login"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300"
                  >
                    Sign in
                  </NavLink>
                  <NavLink
                    to="/register"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-gold-300"
                  >
                    Register
                  </NavLink>
                </>
              )}
            </div>
          </div>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1">
        <Outlet />
      </main>

      <footer className="relative border-t border-white/10 bg-ink-950">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-400/40 to-transparent"
        />
        <div className="mx-auto w-full max-w-7xl px-4 py-10">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-sm">
              <Link to="/" className="inline-flex items-center gap-2 font-display text-lg font-bold text-gold-300">
                <ApertureIcon className="h-5 w-5" />
                CineMind
              </Link>
              <p className="mt-3 text-sm leading-relaxed text-slate-500">
                Movie facts come from structured sources and are shown with provenance — never
                invented by AI.
              </p>
            </div>

            <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
              {NAV_ITEMS.map((item) => (
                <Link key={item.to} to={item.to} className="text-slate-400 transition hover:text-gold-300">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="mt-8 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} CineMind. Evidence-first movie intelligence.</p>
            <p className="chip-mono w-fit">
              <span className="h-1.5 w-1.5 rounded-full bg-azure-400" />
              0 facts invented by AI
            </p>
          </div>
        </div>
      </footer>

      <BackToTop />
    </div>
  );
}

function BackToTop() {
  const visible = useScrolled(640);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      className={cn(
        "glass fixed bottom-6 right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-200 shadow-glow-soft transition-all duration-300 ease-cinematic hover:border-gold-400/40 hover:text-gold-300 sm:right-8",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <ArrowUpRightIcon className="h-4 w-4 -rotate-45" />
    </button>
  );
}
