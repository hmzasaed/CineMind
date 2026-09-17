import { useEffect, useRef, useState, type HTMLAttributes } from "react";
import { cn } from "../lib/cn";

interface ScrollRevealProps extends HTMLAttributes<HTMLElement> {
  delayMs?: number;
  as?: "div" | "section";
}

/**
 * Fades a section up into place the first time it enters the viewport.
 * IntersectionObserver-based (no dependency), fires once, and degrades to
 * "just visible" when JS or `prefers-reduced-motion` isn't cooperating.
 */
export function ScrollReveal({ children, className, delayMs = 0, as = "div", ...rest }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const Comp = as;
  return (
    <Comp
      ref={ref as never}
      className={cn(
        "transition-all duration-700 ease-cinematic motion-reduce:transition-none",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
        className,
      )}
      style={visible && delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
      {...rest}
    >
      {children}
    </Comp>
  );
}
