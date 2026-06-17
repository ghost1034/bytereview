'use client'

import * as React from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

import { ThreeCanvas } from '@/components/three/ThreeCanvas'
import { useReduced3D } from '@/components/three/useReduced3D'
import { HeroPoster } from './HeroPoster'
import { BRAND } from './sceneConfig'

const MODEL_URL = '/models/globe.glb'

// ── Visual-tuning constants — adjust against the running dev server (see plan checklist) ──
const TARGET_SIZE = 4 // largest model dimension in world units after normalize
const GROUP_Y = -2.4 // push the globe down so only its top arc shows above the bottom crop
const GROUP_Z = -0.5 // sit slightly behind the headline
const ROTATE_SPEED = 0.15 // rad/sec — slow, ambient

function GlobeModel() {
  const { scene } = useGLTF(MODEL_URL)

  const { root, center, scale } = React.useMemo(() => {
    // Clone the drei-cached scene before mutating so remounts/other consumers stay clean.
    const root = cloneSkeleton(scene)

    // Strip any cameras/lights baked into the file so our scene lighting fully controls it.
    const remove: THREE.Object3D[] = []
    root.traverse((n) => {
      if (n instanceof THREE.Camera || n instanceof THREE.Light) remove.push(n)
    })
    remove.forEach((n) => n.parent?.remove(n))

    // Normalize: center at the origin + uniform scale, independent of source units/origin.
    const box = new THREE.Box3().setFromObject(root)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const scale = TARGET_SIZE / Math.max(size.x, size.y, size.z)
    return { root, center, scale }
  }, [scene])

  return (
    <group scale={scale}>
      <primitive object={root} position={[-center.x, -center.y, -center.z]} />
    </group>
  )
}

function GlobeScene({ reducedMotion }: { reducedMotion: boolean }) {
  const group = React.useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (!group.current || reducedMotion) return
    // Clamp delta so a backgrounded tab doesn't jump the rotation on the next frame.
    group.current.rotation.y += Math.min(delta, 0.05) * ROTATE_SPEED
  })

  return (
    <>
      {/* Lighting tuned to the navy/accent brand palette for an unknown-material GLB */}
      <hemisphereLight args={[BRAND.paper, BRAND.navy, 0.6]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 4, 5]} intensity={1.1} color={BRAND.paper} />
      <directionalLight position={[-4, -1, -2]} intensity={0.4} color={BRAND.accent} />

      <group ref={group} position={[0, GROUP_Y, GROUP_Z]}>
        <React.Suspense fallback={null}>
          <GlobeModel />
        </React.Suspense>
      </group>
    </>
  )
}

/**
 * The hero's ambient backdrop: a 3D globe loaded from /models/globe.glb, anchored low so it
 * "rises" from the bottom edge (the hero section's overflow-hidden crops the rest), slowly
 * auto-rotating. Mounted as a decorative, pointer-events-none background layer behind the hero
 * copy. Non-interactive; rotation pauses under prefers-reduced-motion.
 */
export function GlobeBackground({ className }: { className?: string }) {
  const { ready, enabled, quality, reducedMotion } = useReduced3D()

  // Until the capability check runs (or when WebGL is unavailable), render nothing — the hero
  // gradient + glows + bottom-fade in HeroSection remain visible behind this.
  if (!ready || !enabled) return null

  return (
    <ThreeCanvas
      className={className}
      fallback={<HeroPoster />}
      frameloop={reducedMotion ? 'demand' : 'always'}
      dpr={quality === 'low' ? [1, 1.25] : [1, 1.75]}
      camera={{ position: [0, 0, 6], fov: 45 }}
    >
      <GlobeScene reducedMotion={reducedMotion} />
    </ThreeCanvas>
  )
}

useGLTF.preload(MODEL_URL)
