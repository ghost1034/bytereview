'use client'

import * as React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { ThreeCanvas } from '@/components/three/ThreeCanvas'
import { useReduced3D } from '@/components/three/useReduced3D'
import { BRAND } from './sceneConfig'

function Lattice({ reducedMotion }: { reducedMotion: boolean }) {
  const group = React.useRef<THREE.Group>(null)

  const points = React.useMemo(() => {
    const n = 4
    const gap = 0.8
    const off = ((n - 1) * gap) / 2
    const arr: number[] = []
    for (let x = 0; x < n; x++)
      for (let y = 0; y < n; y++)
        for (let z = 0; z < n; z++) {
          arr.push(x * gap - off, y * gap - off, z * gap - off)
        }
    return new Float32Array(arr)
  }, [])

  const edges = React.useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(2.6, 2.6, 2.6)),
    [],
  )

  useFrame((_, delta) => {
    if (!group.current || reducedMotion) return
    group.current.rotation.y += delta * 0.14
    group.current.rotation.x += delta * 0.05
  })

  return (
    <group ref={group} rotation={[0.5, 0.4, 0]}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[points, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.08}
          color={BRAND.accent}
          transparent
          opacity={0.85}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={BRAND.accent} transparent opacity={0.22} />
      </lineSegments>
    </group>
  )
}

/**
 * Ambient, auto-looping wireframe "data cube" lattice. Decorative background accent
 * for lower sections (no post-processing; intersection-paused via ThreeCanvas).
 */
export function DataCubeAccent({ className }: { className?: string }) {
  const { ready, enabled, reducedMotion } = useReduced3D()
  if (!ready || !enabled) return null

  return (
    <ThreeCanvas
      className={className}
      frameloop={reducedMotion ? 'demand' : 'always'}
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 6], fov: 45 }}
    >
      <ambientLight intensity={0.6} />
      <Lattice reducedMotion={reducedMotion} />
    </ThreeCanvas>
  )
}
