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
          background: '#07101b',
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
            <span style={{ width: 42, height: 42, marginRight: 15, border: '1px solid #1769e0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600 }}>C</span>
            <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.5 }}>CPA<span style={{ color: '#17b5a6' }}>Automation</span></span>
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
              Built by CPAs, for professionals
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
              Less busywork. More billable hours.
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
          <span>Document intelligence · AI writing · e-signatures · agents</span>
          <span style={{ color: '#94a3b8' }}>cpaautomation.ai</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
