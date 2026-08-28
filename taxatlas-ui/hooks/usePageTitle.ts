import { useEffect } from "react";

const SUFFIX = "TaxAtlas";

/** Sets document.title for the page; restores the bare app name on unmount. */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
    return () => {
      document.title = SUFFIX;
    };
  }, [title]);
}
