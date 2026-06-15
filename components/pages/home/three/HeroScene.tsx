'use client'

import * as React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { ThreeCanvas } from '@/components/three/ThreeCanvas'
import { useReduced3D } from '@/components/three/useReduced3D'
import { BRAND, QUALITY, type SceneQuality } from './sceneConfig'

// ── Module-level scratch object: reused every frame, zero per-frame allocation ──
const dummy = new THREE.Object3D()

interface SheetData {
  pos: THREE.Vector3 // resting position in navy space
  rot: { x: number; y: number; z: number } // base orientation (paper tumble)
  phase: number // drift phase offset
  drift: number // drift amplitude multiplier
}

/** Deterministic layout so the scene is identical on every load (and SSR-stable). */
function buildSheets(q: SceneQuality): SheetData[] {
  const sheets: SheetData[] = []
  const count = q.rows * q.cols
  let seed = 1337
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 0; i < count; i++) {
    sheets.push({
      pos: new THREE.Vector3(
        (rand() - 0.5) * 12,
        (rand() - 0.5) * 8,
        (rand() - 0.5) * 6 - 1,
      ),
      rot: {
        x: (rand() - 0.5) * Math.PI,
        y: (rand() - 0.5) * Math.PI,
        z: (rand() - 0.5) * Math.PI,
      },
      phase: rand() * Math.PI * 2,
      drift: 0.6 + rand() * 0.8,
    })
  }
  return sheets
}

interface SceneProps {
  reducedMotion: boolean
  quality: SceneQuality
}

function Sheets({ reducedMotion, quality }: SceneProps) {
  const meshRef = React.useRef<THREE.InstancedMesh>(null)
  const sheets = React.useMemo(() => buildSheets(quality), [quality])
  const count = sheets.length

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = state.clock.elapsedTime

    for (let i = 0; i < count; i++) {
      const s = sheets[i]
      // Calm, steady drift — slowed and shrunk so the papers read as atmosphere,
      // never as a scroll-driven animation competing with the headline.
      const driftAmt = reducedMotion ? 0 : s.drift * 0.4

      dummy.position.set(
        s.pos.x + Math.sin(t * 0.2 + s.phase) * 0.3 * driftAmt,
        s.pos.y + Math.cos(t * 0.17 + s.phase) * 0.3 * driftAmt,
        s.pos.z + Math.sin(t * 0.25 + s.phase) * 0.3 * driftAmt,
      )

      // Barely-there rotation wobble around the sheet's resting orientation.
      const wobble = reducedMotion ? 0 : 0.06
      dummy.rotation.set(
        s.rot.x + Math.sin(t * 0.15 + s.phase) * wobble,
        s.rot.y + Math.cos(t * 0.13 + s.phase) * wobble,
        s.rot.z,
      )

      dummy.scale.set(0.62, 0.84, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined as never, undefined as never, count]}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        color={BRAND.paper}
        emissive={BRAND.accent}
        emissiveIntensity={0.12}
        roughness={0.5}
        metalness={0.1}
        side={THREE.DoubleSide}
        transparent
        opacity={0.5}
      />
    </instancedMesh>
  )
}

function SceneContents({ reducedMotion, quality }: SceneProps) {
  return (
    <>
      <color attach="background" args={['#0F1729']} />
      {/* Tighter fog dissolves the sheets into navy at the edges, keeping the
          center clear for the copy. */}
      <fog attach="fog" args={['#0F1729', 6, 14]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 4, 6]} intensity={0.9} />
      <Sheets reducedMotion={reducedMotion} quality={quality} />
    </>
  )
}

/**
 * The hero's ambient backdrop: a sparse field of paper documents drifting slowly in
 * navy space. Mounted as an absolutely-positioned, decorative background layer behind
 * the hero copy (lazy-loaded, ssr:false). Deliberately quiet — no scroll interaction,
 * particles, or bloom — so it never competes with the headline.
 */
export default function HeroScene() {
  const { ready, enabled, quality, reducedMotion } = useReduced3D()

  // Until the capability check runs, render nothing — the static HeroPoster (a
  // sibling layer in HeroSection) is already visible behind this.
  if (!ready) return null

  const q = quality === 'low' ? QUALITY.low : QUALITY.high

  return (
    <ThreeCanvas
      disabled={!enabled}
      frameloop={reducedMotion ? 'demand' : 'always'}
      dpr={quality === 'low' ? [1, 1.25] : [1, 1.75]}
      camera={{ position: [0, 0, 8.5], fov: 40 }}
    >
      <SceneContents reducedMotion={reducedMotion} quality={q} />
    </ThreeCanvas>
  )
}
