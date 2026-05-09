import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#ffffff',
          fontSize: 16,
          fontWeight: 700,
          borderRadius: 7,
          letterSpacing: -0.5,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        CA
      </div>
    ),
    { ...size },
  )
}
