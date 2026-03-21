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
export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

// ── Scale on hover (cards, buttons) ───────────────────────────────
export const hoverLift = {
  whileHover: { scale: 1.03, transition: { duration: 0.2 } },
  whileTap: { scale: 0.98 },
};

// ── Count-up helper ───────────────────────────────────────────────
// Usage: <CountUp target={95} suffix="%" />
// (implemented as a component in the hero; this is the easing config)
export const countUpTransition = {
  duration: 2,
  ease: "easeOut" as const,
};

// ── Section wrapper props (convenience) ───────────────────────────
// Spread onto a <motion.section> to get standard fade-in-up on scroll
export const sectionReveal = {
  variants: fadeInUp,
  initial: "hidden" as const,
  whileInView: "visible" as const,
  viewport: viewportOnce,
};
