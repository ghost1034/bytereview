'use client'

import * as React from 'react'
import { useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import type { MotionValue } from 'framer-motion'

import { ThreeCanvas } from '@/components/three/ThreeCanvas'
import { useReduced3D } from '@/components/three/useReduced3D'
import { BRAND, QUALITY, type SceneQuality } from './sceneConfig'

// ── Module-level scratch objects: reused every frame, zero per-frame allocation ──
const dummy = new THREE.Object3D()
const tmpPos = new THREE.Vector3()
const tmpScatter = new THREE.Vector3()

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

interface SheetData {
  scatter: THREE.Vector3 // floating-document position
  grid: THREE.Vector3 // destination data-cell position
  rot: { x: number; y: number; z: number } // scattered rotation
  phase: number // drift phase offset
  drift: number // drift amplitude multiplier
}

/** Deterministic layout so the scene is identical on every load (and SSR-stable). */
function buildSheets(q: SceneQuality): SheetData[] {
  const sheets: SheetData[] = []
  const spacingX = 0.62
  const spacingY = 0.5
  let seed = 1337
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let r = 0; r < q.rows; r++) {
    for (let c = 0; c < q.cols; c++) {
      sheets.push({
        grid: new THREE.Vector3(
          (c - (q.cols - 1) / 2) * spacingX,
          (r - (q.rows - 1) / 2) * spacingY,
          0,
        ),
        scatter: new THREE.Vector3(
          (rand() - 0.5) * 10,
          (rand() - 0.5) * 6.5,
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
  }
  return sheets
}

interface SceneProps {
  progress?: MotionValue<number>
  reducedMotion: boolean
  quality: SceneQuality
}

function Sheets({ progress, reducedMotion, quality }: SceneProps) {
  const meshRef = React.useRef<THREE.InstancedMesh>(null)
  const matRef = React.useRef<THREE.MeshStandardMaterial>(null)
  const sheets = React.useMemo(() => buildSheets(quality), [quality])
  const count = sheets.length

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = state.clock.elapsedTime

    // progress 0 = floating documents, 1 = assembled glowing grid
    const raw = reducedMotion
      ? 0.82
      : progress
        ? progress.get()
        : Math.sin(t * 0.25) * 0.5 + 0.5
    const assemble = smoothstep(0, 0.72, raw)

    for (let i = 0; i < count; i++) {
      const s = sheets[i]
      const driftAmt = reducedMotion ? 0 : (1 - assemble) * s.drift

      tmpScatter.copy(s.scatter)
      tmpScatter.x += Math.sin(t * 0.4 + s.phase) * 0.3 * driftAmt
      tmpScatter.y += Math.cos(t * 0.33 + s.phase) * 0.3 * driftAmt
      tmpScatter.z += Math.sin(t * 0.5 + s.phase) * 0.3 * driftAmt

      tmpPos.lerpVectors(tmpScatter, s.grid, assemble)
      dummy.position.copy(tmpPos)

      // Rotation: tumbling paper -> flat cell facing the camera
      dummy.rotation.set(
        THREE.MathUtils.lerp(s.rot.x, 0, assemble),
        THREE.MathUtils.lerp(s.rot.y, 0, assemble),
        THREE.MathUtils.lerp(s.rot.z, 0, assemble),
      )

      // Scale: tall sheet -> wide flat data cell
      dummy.scale.set(
        THREE.MathUtils.lerp(0.62, 0.5, assemble),
        THREE.MathUtils.lerp(0.84, 0.3, assemble),
        1,
      )

      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true

    if (matRef.current) {
      // Dim paper -> bright emissive grid (bloom turns this into glow)
      matRef.current.emissiveIntensity = THREE.MathUtils.lerp(0.08, 1.7, assemble)
      matRef.current.color.copy(BRAND.paper).lerp(BRAND.accent, assemble * 0.6)
    }
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined as never, undefined as never, count]}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        ref={matRef}
        color={BRAND.paper}
        emissive={BRAND.accent}
        emissiveIntensity={0.08}
        roughness={0.45}
        metalness={0.1}
        side={THREE.DoubleSide}
        transparent
        opacity={0.96}
      />
    </instancedMesh>
  )
}

function Particles({ quality, reducedMotion }: Pick<SceneProps, 'quality' | 'reducedMotion'>) {
  const ref = React.useRef<THREE.Points>(null)
  const positions = React.useMemo(() => {
    const arr = new Float32Array(quality.particles * 3)
    let seed = 99
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < quality.particles; i++) {
      arr[i * 3] = (rand() - 0.5) * 14
      arr[i * 3 + 1] = (rand() - 0.5) * 9
      arr[i * 3 + 2] = (rand() - 0.5) * 8 - 2
    }
    return arr
  }, [quality.particles])

  useFrame((state) => {
    if (!ref.current || reducedMotion) return
    ref.current.rotation.y = state.clock.elapsedTime * 0.02
  })

  if (quality.particles === 0) return null

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.026}
        color={BRAND.accent}
        transparent
        opacity={0.5}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

function SceneContents({ progress, reducedMotion, quality }: SceneProps) {
  return (
    <>
      <color attach="background" args={['#0F1729']} />
      <fog attach="fog" args={['#0F1729', 8, 18]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 4, 6]} intensity={1.1} />
      <Sheets progress={progress} reducedMotion={reducedMotion} quality={quality} />
      <Particles quality={quality} reducedMotion={reducedMotion} />
      {quality.bloom && (
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.55}
            luminanceSmoothing={0.25}
            intensity={0.9}
            mipmapBlur
          />
          <Vignette offset={0.25} darkness={0.7} eskil={false} />
        </EffectComposer>
      )}
    </>
  )
}

interface HeroSceneProps {
  /** Scroll-linked 0→1 value driving the documents→grid morph. */
  progress?: MotionValue<number>
}

/**
 * The hero centerpiece: paper documents drifting in navy space that assemble into a
 * glowing structured-data grid as you scroll. Mounted as an absolutely-positioned,
 * decorative background layer behind the hero copy (lazy-loaded, ssr:false).
 */
export default function HeroScene({ progress }: HeroSceneProps) {
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
      camera={{ position: [0, 0, 6], fov: 45 }}
    >
      <SceneContents progress={progress} reducedMotion={reducedMotion} quality={q} />
    </ThreeCanvas>
  )
}
