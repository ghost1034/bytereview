import { useEffect, useState } from "react";

/** `true` while the viewport matches `query` (e.g. the §5 icon-rail breakpoint `"(max-width: 1179px)"`). */
export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const h = (e: MediaQueryListEvent) => setMatch(e.matches);
    setMatch(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [query]);
  return match;
}
