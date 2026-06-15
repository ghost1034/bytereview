import type { Variants } from "framer-motion";

// ── Viewport defaults ──────────────────────────────────────────────
export const viewportOnce = { once: true, margin: "-80px" as const };

// ── Fade + slide up (headings, paragraphs, standalone elements) ───
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

// ── Fade in only (no vertical movement) ───────────────────────────
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5, ease: "easeOut" } },
};

// ── Stagger container (wrap around a list of children) ────────────
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

export const staggerContainerSlow: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.18 } },
};

// ── Stagger child (each item inside a stagger container) ──────────
// Slide in only — no fade. Items translate up into place sequentially.
export const staggerChild: Variants = {
  hidden: { y: 24 },
  visible: { y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

// ── Scale on hover (cards, buttons) ───────────────────────────────
export const hoverLift = {
  whileHover: { scale: 1.03, transition: { duration: 0.2 } },
  whileTap: { scale: 0.98 },
};

// ── Scale + fade in (for standalone visuals, mockups) ─────────────
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: "easeOut" } },
};
