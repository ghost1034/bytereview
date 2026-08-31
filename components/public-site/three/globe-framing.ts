/** Fit the sphere's perspective silhouette to 90% of the shorter hero dimension. */
export function getGlobeRadius(width: number, height: number, distance: number, fov: number): number {
  if (width <= 0 || height <= 0) return 0

  // Leave 5% clearance on each side, including on narrow mobile screens.
  const slope = Math.tan(fov * Math.PI / 360) * Math.min(width / height, 1) * 0.9
  return distance * slope / Math.sqrt(1 + slope * slope)
}
