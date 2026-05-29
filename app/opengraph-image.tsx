import { ImageResponse } from 'next/og'

export const alt = 'CPAAutomation — AI Platform for Accounting, Finance & Legal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: 80,
          background:
            'linear-gradient(135deg, #0b1220 0%, #0f172a 60%, #1e293b 100%)',
          color: '#ffffff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.5 }}>
            CPAAutomation
          </span>
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span
              style={{
                fontSize: 22,
                color: '#94a3b8',
                fontWeight: 500,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}
            >
              AI Platform for Accounting
            </span>
            <span
              style={{
                fontSize: 72,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -2,
                maxWidth: 920,
              }}
            >
              One AI platform for accounting, finance & legal work.
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#cbd5e1',
            fontSize: 22,
            fontWeight: 500,
          }}
        >
          <span>Built by CPAs for CPAs</span>
          <span style={{ color: '#94a3b8' }}>cpaautomation.ai</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
