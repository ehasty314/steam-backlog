"use client";

import { useEffect, useRef, type ReactNode } from "react";

// A list item that calls onSeen once, the first time it scrolls near the viewport.
export default function Seen({ onSeen, children, className }: { onSeen: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLLIElement>(null);
  const callback = useRef(onSeen);
  callback.current = onSeen;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          callback.current();
          io.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return <li ref={ref} className={className}>{children}</li>;
}
