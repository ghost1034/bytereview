import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-react'
import type { MapPalette } from '@/taxatlas-ui/components/map/colors'
import { PALETTE_KEY, type PaletteId } from '@/taxatlas-ui/components/map/palette'
import { setTheme, useTheme } from '@/taxatlas-ui/hooks/useTheme'
import MapPage from './MapPage'
import '@/taxatlas-ui/taxatlas.css'

const navigation = vi.hoisted(() => ({
  search: '',
  router: { replace: vi.fn(), push: vi.fn() },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/taxatlas/map',
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => navigation.router,
}))

vi.mock('@/taxatlas-ui/lib/api', () => ({
  ApiError: class extends Error {},
  setApiErrorNotifier: vi.fn(),
  api: {
    map: {
      subnational: async () => [],
      metrics: async () => ({ metrics: [{ tax_type: 'vat', rate_kind: 'standard', count: 8 }] }),
      coverage: async () => ({ metrics: { 'vat:standard': 8 } }),
      activity: async () => [],
      choropleth: async () => [5, 10, 15, 20, 25, 30, 35, 40].map((value, index) => ({
        code: `country-${index}`, name: `Country ${index}`, value, label: `${value}%`,
      })),
    },
    stats: { overview: async () => ({ countries: 8 }) },
    jurisdictions: {},
  },
}))

vi.mock('@/taxatlas-ui/lib/geo', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/taxatlas-ui/lib/geo')>(),
  loadAdmin1Manifest: async () => ({ countries: {} }),
  loadWorld: async () => ({ type: 'FeatureCollection', features: [] }),
}))

// Keep the real page, controls, CSS, and theme hook; inspect the colors passed to MapLibre without WebGL.
vi.mock('@/taxatlas-ui/components/map/WorldMap', () => ({
  WorldMap: ({ palette }: { palette: MapPalette }) => (
    <output data-testid="map-palette">{JSON.stringify(palette)}</output>
  ),
}))
vi.mock('@/taxatlas-ui/components/map/JurisdictionPanel', () => ({ JurisdictionPanel: () => null }))

let client: QueryClient

function Harness() {
  const [theme] = useTheme()
  return (
    <QueryClientProvider client={client}>
      <div className="taxatlas-root" data-theme={theme} style={{ height: 1000 }}>
        <MapPage />
      </div>
    </QueryClientProvider>
  )
}

function mapPalette(): MapPalette {
  return JSON.parse(document.querySelector('[data-testid="map-palette"]')!.textContent!)
}

async function expectPalette(id: PaletteId) {
  const root = document.querySelector<HTMLElement>('.taxatlas-root')!
  const expected = Array.from({ length: 7 }, (_, i) => (
    getComputedStyle(root).getPropertyValue(`--viz-ramp-${id}-${i + 1}`).trim()
  ))
  expect(expected.every(Boolean)).toBe(true)
  await expect.poll(() => mapPalette().seq).toEqual(expected)
  await expect.poll(() => Array.from(document.querySelectorAll<HTMLElement>('.mp-bins i')).length).toBe(7)
  const probe = document.createElement('i')
  root.append(probe)
  const swatches = Array.from(document.querySelectorAll<HTMLElement>('.mp-bins i'))
  swatches.forEach((swatch, index) => {
    probe.style.backgroundColor = expected[index]
    expect(getComputedStyle(swatch).backgroundColor).toBe(getComputedStyle(probe).backgroundColor)
  })
  probe.remove()
  expect(localStorage.getItem(PALETTE_KEY)).toBe(id)
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  localStorage.removeItem(PALETTE_KEY)
  navigation.search = ''
  navigation.router.replace.mockImplementation((href: string) => {
    navigation.search = new URL(href, 'https://example.test').search
  })
  setTheme('dark')
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  localStorage.removeItem(PALETTE_KEY)
  localStorage.removeItem('ta.theme')
})

describe('TaxAtlas map palettes', () => {
  it.each(['dark', 'light'] as const)('updates map and legend for every palette in %s mode', async (theme) => {
    const htmlAttributes = document.documentElement.outerHTML.split('>')[0]
    setTheme(theme)
    const screen = render(<Harness />)
    await expectPalette('ocean')
    for (const [id, label] of [['ember', 'Ember'], ['viridis', 'Viridis'], ['magma', 'Magma'], ['ocean', 'Ocean']] as const) {
      const button = screen.getByRole('button', { name: `Palette: ${label}` })
      await button.click()
      await expect.element(button).toHaveAttribute('aria-pressed', 'true')
      await expectPalette(id)
      expect(new URLSearchParams(navigation.search).get('palette')).toBe(id)
    }
    expect(document.documentElement.outerHTML.split('>')[0]).toBe(htmlAttributes)
  })

  it('restores the stored palette after the TaxAtlas container is remounted', async () => {
    const screen = render(<Harness />)
    await screen.getByRole('button', { name: 'Palette: Magma' }).click()
    await expectPalette('magma')
    cleanup()
    navigation.search = ''
    const remounted = render(<Harness />)
    await expectPalette('magma')
    await expect.element(remounted.getByRole('button', { name: 'Palette: Magma' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('honors shared palette links over stored preferences and follows URL navigation', async () => {
    localStorage.setItem(PALETTE_KEY, 'magma')
    navigation.search = '?palette=viridis'
    const screen = render(<Harness />)
    await expectPalette('viridis')
    navigation.search = '?palette=ember'
    screen.rerender(<Harness />)
    await expectPalette('ember')
    navigation.search = '?palette=ocean'
    screen.rerender(<Harness />)
    await expectPalette('ocean')
  })

  it('keeps the chosen palette synchronized with map and app theme controls', async () => {
    const htmlTheme = document.documentElement.getAttribute('data-theme')
    const screen = render(<Harness />)
    await screen.getByRole('button', { name: 'Palette: Viridis' }).click()
    await expectPalette('viridis')
    const darkColors = mapPalette().seq
    await screen.getByRole('button', { name: 'Switch to light theme' }).click()
    await expect.element(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible()
    await expectPalette('viridis')
    expect(mapPalette().seq).not.toEqual(darkColors)
    setTheme('dark')
    await expect.poll(() => mapPalette().seq).toEqual(darkColors)
    expect(document.documentElement.getAttribute('data-theme')).toBe(htmlTheme)
  })
})
