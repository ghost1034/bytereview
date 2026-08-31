import { ImageResponse } from 'next/og'

export const alt = 'CPAAutomation — Intelligent automation for modern professionals'
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
          padding: 64,
          position: 'relative',
          overflow: 'hidden',
          background: '#0a0a0a',
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 760,
            height: 760,
            right: -180,
            top: -300,
            borderRadius: 999,
            background: 'linear-gradient(125deg, #c9aaff 0%, #feffbc 28%, #ffcdfd 52%, #b3e2ff 76%, #839aff 100%)',
            opacity: .82,
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span
            style={{
              width: 48,
              height: 48,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(125deg, #c9aaff, #feffbc, #b3e2ff)',
              color: '#111',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            CA
          </span>
          <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: -1.2 }}>
            CPAAutomation
          </span>
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <span
              style={{
                fontSize: 18,
                color: '#a6a6a6',
                fontWeight: 500,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
              }}
            >
              Built by CPAs for professional work
            </span>
            <span
              style={{
                fontSize: 76,
                fontWeight: 600,
                lineHeight: .98,
                letterSpacing: -4.5,
                maxWidth: 960,
              }}
            >
              Intelligent automation for modern professionals.
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#a6a6a6',
            fontSize: 18,
            fontWeight: 500,
          }}
        >
          <span>Accounting · Finance · Legal</span>
          <span>cpaautomation.ai</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
