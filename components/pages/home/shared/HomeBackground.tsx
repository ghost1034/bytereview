'use client'

import { useEffect, useState } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'

/**
 * The single continuous backdrop behind the entire homepage: a fixed gradient
 * wash, a few large low-opacity ambient glows, and a faint grid. Because every
 * section now sits transparent (or feathered-translucent) over this one layer,
 * section boundaries cross-fade instead of meeting at hard seams.
 *
 * The glows drift on scroll for an immersive feel. Drift is transform-only
 * (GPU-composited, no repaint, driven by framer-motion's rAF without React
 * re-renders) and is disabled for reduced motion and small screens to keep
 * mobile paint cheap.
 */
export function HomeBackground() {
  const reduce = useReducedMotion()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const drift = !reduce && !isMobile

  const { scrollYProgress } = useScroll()
  // Different magnitudes + directions give the orbs a sense of parallax depth.
  const y1 = useTransform(scrollYProgress, [0, 1], [0, -180])
  const y2 = useTransform(scrollYProgress, [0, 1], [0, 120])
  const y3 = useTransform(scrollYProgress, [0, 1], [0, -90])

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Base wash: deep navy at the top easing into the brand navy body. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,hsl(222_60%_16%)_0%,hsl(222_43%_11%)_45%,hsl(221_47%_9%)_100%)]" />

      {/* Ambient brand glows — large, faint, drifting on scroll. */}
      <motion.div
        style={drift ? { y: y1 } : undefined}
        className="absolute left-[8%] top-[6%] size-[55vw] max-w-[680px] rounded-full bg-accent-blue-500/[0.07] blur-[80px] sm:blur-[140px]"
      />
      <motion.div
        style={drift ? { y: y2 } : undefined}
        className="absolute right-[4%] top-[42%] size-[50vw] max-w-[620px] rounded-full bg-accent-blue-400/[0.05] blur-[80px] sm:blur-[150px]"
      />
      <motion.div
        style={drift ? { y: y3 } : undefined}
        className="absolute left-[18%] top-[78%] hidden size-[52vw] max-w-[640px] rounded-full bg-accent-blue-500/[0.06] blur-[150px] sm:block"
      />

      {/* Faint global grid, matched to the hero's 48px cells so it reads
          continuously from the hero into the body. */}
      <div className="absolute inset-0 opacity-[0.04] [background-image:linear-gradient(hsl(var(--marketing-hero-border)/0.5)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--marketing-hero-border)/0.5)_1px,transparent_1px)] [background-size:48px_48px]" />
    </div>
  )
}
