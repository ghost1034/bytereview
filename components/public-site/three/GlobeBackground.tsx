'use client'

import { Suspense, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Pause, Play } from 'lucide-react'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

import { ThreeCanvas } from '@/components/three/ThreeCanvas'
import { useReduced3D } from '@/components/three/useReduced3D'

const MODEL_URL = '/models/globe.glb'

// Normalize the sphere to a unit radius, then frame it to cover the hero.
const TARGET_SIZE = 2
const GROUP_Z = -0.5
const CAMERA_Z = 6
const CAMERA_FOV = 45
const ROTATE_SPEED = 0.15
const BRAND = { navy: '#0F1729', accent: '#6E97F7', paper: '#DCE6FB' }

function GlobeModel() {
  // Keep the compressed model's decoder same-origin for restricted networks/mobile.
  const { scene } = useGLTF(MODEL_URL, '/draco/')
  const { root, center, scale } = useMemo(() => {
    const root = cloneSkeleton(scene)
    const remove: THREE.Object3D[] = []
    root.traverse((node) => {
      if (node instanceof THREE.Camera || node instanceof THREE.Light) remove.push(node)
    })
    remove.forEach((node) => node.parent?.remove(node))

    // The decorative rays extend below the sphere and must not affect its framing.
    const box = new THREE.Box3().setFromObject(root.getObjectByName('Earth_2') ?? root)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    return { root, center, scale: TARGET_SIZE / Math.max(size.x, size.y, size.z) }
  }, [scene])

  return <group scale={scale}>
    <primitive object={root} position={[-center.x, -center.y, -center.z]} />
  </group>
}

function GlobeScene({ paused }: { paused: boolean }) {
  const group = useRef<THREE.Group>(null)
  const { width, height } = useThree((state) => state.size)
  // Fill the longer hero dimension with a little overscan. Account for the
  // sphere's perspective silhouette so wide screens never put the camera inside it.
  const slope = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * Math.max(width / height, 1) * 1.1
  const radius = (CAMERA_Z - GROUP_Z) * slope / Math.sqrt(1 + slope * slope)
  useFrame((_, delta) => {
    if (!group.current || paused) return
    // Avoid a rotation jump when returning to a backgrounded tab.
    group.current.rotation.y += Math.min(delta, 0.05) * ROTATE_SPEED
  })

  return <>
    <hemisphereLight args={[BRAND.paper, BRAND.navy, 0.6]} />
    <ambientLight intensity={0.4} />
    <directionalLight position={[3, 4, 5]} intensity={1.1} color={BRAND.paper} />
    <directionalLight position={[-4, -1, -2]} intensity={0.4} color={BRAND.accent} />
    <group ref={group} position={[0, 0, GROUP_Z]} scale={radius}>
      <Suspense fallback={null}><GlobeModel /></Suspense>
    </group>
  </>
}

/** Decorative globe centered and scaled across the entire hero. */
export default function GlobeBackground() {
  const { ready, enabled, quality, reducedMotion } = useReduced3D()
  const [paused, setPaused] = useState(false)
  const stopped = paused || reducedMotion

  // The hero's CSS gradient stays visible while loading or without WebGL.
  if (!ready || !enabled) return null

  return <>
    <ThreeCanvas
      className="ps-home-hero__globe"
      frameloop={stopped ? 'demand' : 'always'}
      dpr={quality === 'low' ? [1, 1.25] : [1, 1.75]}
      camera={{ position: [0, 0, CAMERA_Z], fov: CAMERA_FOV }}
    >
      <GlobeScene paused={stopped} />
    </ThreeCanvas>
    {!reducedMotion && <button
      type="button"
      className="ps-ambient-toggle"
      onClick={() => setPaused(!paused)}
      aria-label={`${paused ? 'Play' : 'Pause'} globe animation`}
    >
      {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
    </button>}
  </>
}
