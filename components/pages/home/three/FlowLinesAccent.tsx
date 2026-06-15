'use client'

import * as React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { ThreeCanvas } from '@/components/three/ThreeCanvas'
import { useReduced3D } from '@/components/three/useReduced3D'
import { BRAND } from './sceneConfig'

const COUNT = 420
const SPAN_X = 12

function FlowPoints({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = React.useRef<THREE.Points>(null)

  const positions = React.useMemo(() => {
    const arr = new Float32Array(COUNT * 3)
    let seed = 7
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3] = (rand() - 0.5) * SPAN_X
      arr[i * 3 + 1] = (rand() - 0.5) * 5
      arr[i * 3 + 2] = (rand() - 0.5) * 4 - 1
    }
    return arr
  }, [])

  useFrame((_, delta) => {
    if (!ref.current || reducedMotion) return
    const attr = ref.current.geometry.attributes.position as THREE.BufferAttribute
    const speed = Math.min(delta, 0.05) * 0.9
    for (let i = 0; i < COUNT; i++) {
      let x = attr.getX(i) + speed
      if (x > SPAN_X / 2) x = -SPAN_X / 2
      attr.setX(i, x)
    }
    attr.needsUpdate = true
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        color={BRAND.accent}
        transparent
        opacity={0.55}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

/**
 * Ambient, auto-looping field of drifting "data" points flowing left→right.
 * Decorative background accent for the final CTA band.
 */
export function FlowLinesAccent({ className }: { className?: string }) {
  const { ready, enabled, reducedMotion } = useReduced3D()
  if (!ready || !enabled) return null

  return (
    <ThreeCanvas
      className={className}
      frameloop={reducedMotion ? 'demand' : 'always'}
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 6], fov: 50 }}
    >
      <FlowPoints reducedMotion={reducedMotion} />
    </ThreeCanvas>
  )
}
