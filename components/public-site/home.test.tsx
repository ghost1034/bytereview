// @vitest-environment jsdom

import { act, type AnchorHTMLAttributes, type ImgHTMLAttributes } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { HOME_CAPABILITIES, HOME_FAQS, HOME_INTEGRATIONS, HOME_INTEGRATION_ROWS, HOME_PEOPLE, HOME_SECTIONS, HOME_STEPS } from './home-content'
import { PRODUCTS } from './content'
import { PRODUCT_DETAILS } from './product-details'
import { PRODUCT_CATALOG, PRODUCT_GROUPS } from '@/lib/product-catalog'

const state = vi.hoisted(() => ({
  user: null as null | { uid: string }, mfa: false, pathname: '/', reducedMotion: true,
  plans: [] as Array<Record<string, unknown>>, loading: false, error: false,
  push: vi.fn(), refetch: vi.fn(), submit: vi.fn(), selected: 0,
  listeners: new Set<(api: unknown) => void>(),
}))

vi.mock('next/navigation', () => ({ usePathname: () => state.pathname, useRouter: () => ({ push: state.push }) }))
vi.mock('next/link', () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }))
vi.mock('next/image', () => ({ default: ({ fill, priority, ...props }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => {
  void fill; void priority
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={props.alt ?? ''} />
} }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user, requiresMfaEnrollment: state.mfa }) }))
vi.mock('@/hooks/useBilling', () => ({ useSubscriptionPlans: () => ({ data: state.plans, isLoading: state.loading, isError: state.error, refetch: state.refetch }) }))
vi.mock('@/lib/api', () => ({ apiClient: { submitContact: (...args: unknown[]) => state.submit(...args) } }))
vi.mock('@/components/auth/AuthModal', () => ({ default: ({ isOpen, redirectTo }: { isOpen: boolean; redirectTo?: string }) => isOpen ? <div role="dialog" aria-label="Sign in" data-redirect-to={redirectTo} /> : null }))
vi.mock('gsap', () => ({ gsap: { registerPlugin: vi.fn(), context: () => ({ revert: vi.fn() }), matchMedia: () => ({ add: vi.fn(), revert: vi.fn() }) } }))
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: {} }))
vi.mock('embla-carousel-react', () => {
  const select = (delta: number) => { state.selected = Math.max(0, Math.min(2, state.selected + delta)); state.listeners.forEach((listener) => listener(api)) }
  const api = {
    canScrollPrev: () => state.selected > 0, canScrollNext: () => state.selected < 2,
    selectedScrollSnap: () => state.selected, scrollSnapList: () => [0, 1, 2],
    scrollPrev: () => select(-1), scrollNext: () => select(1),
    on: (_event: string, listener: (api: unknown) => void) => { state.listeners.add(listener); return api },
    off: (_event: string, listener: (api: unknown) => void) => { state.listeners.delete(listener); return api },
  }
  return { default: () => [() => undefined, api] }
})

import PublicHome from './pages/home'
import PublicSpeech2Write from './pages/speech2write'
import { SPEECH2WRITE_CHECKSUMS_URL, SPEECH2WRITE_DOWNLOAD_URL, SPEECH2WRITE_INSTALLER_URL } from '@/lib/speech2write'
import { PublicFeatures } from './pages/marketing-pages'
import PublicHeader from './header'
import PublicFooter from './footer'
import { AmbientVideo, HomeCarousel, VideoLightbox } from './home-interactions'

let host: HTMLDivElement
let root: Root
let user: ReturnType<typeof userEvent.setup>
const render = async (element: React.ReactNode) => { await act(async () => root.render(element)) }
const button = (text: string) => Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.trim() === text)!
const click = async (node: Element) => { await act(async () => user.click(node)) }

beforeEach(() => {
  Object.assign(state, { user: null, mfa: false, pathname: '/', reducedMotion: true, plans: [], loading: false, error: false, selected: 0 })
  state.listeners.clear()
  state.push.mockReset(); state.submit.mockReset(); state.refetch.mockReset()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: state.reducedMotion, media: '', onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })))
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  user = userEvent.setup()
})

afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('template-aligned homepage', () => {
  it('renders the ten numbered sections in reference order and every product once in the mosaic', async () => {
    await render(<PublicHome />)
    expect(Array.from(host.querySelectorAll('section[id]')).map((node) => node.id)).toEqual(HOME_SECTIONS.map(([id]) => id))
    expect(HOME_CAPABILITIES.flatMap((item) => item.products).sort()).toEqual(PRODUCTS.map((item) => item.name).sort())
    expect(HOME_STEPS).toHaveLength(5)
    expect(host.querySelectorAll('.ph-step')).toHaveLength(5)
    expect(host.querySelectorAll('h1')).toHaveLength(1)
    expect(host.querySelectorAll('.ph-quote blockquote')).toHaveLength(3)
    expect(host.querySelectorAll('.ph-quote > p')).toHaveLength(2)
    expect(host.textContent).not.toMatch(/Conicorn|Get this Template|SAVE 10%/)
    expect(HOME_PEOPLE.every((person) => ['/ian.jpg', '/ray.jpg'].includes(person.image))).toBe(true)
  })

  it('shows curated OpenConnector providers alongside clearly labeled native and file integrations', async () => {
    await render(<PublicHome />)
    const section = host.querySelector('#integrations-section')!
    const originals = Array.from(section.querySelectorAll('.ph-integration-list:not([aria-hidden="true"]) .ph-integration'))
    expect(originals.map((node) => node.querySelector('strong')?.textContent)).toEqual(HOME_INTEGRATIONS.map((item) => item.name))
    expect(HOME_INTEGRATIONS.filter((item) => item.detail === 'OpenConnector').map((item) => item.name)).toEqual([
      'Dropbox', 'Box', 'Outlook', 'NetSuite', 'Xero', 'Stripe',
      'HubSpot', 'Airtable', 'Notion', 'Asana', 'Trello', 'ClickUp',
    ])
    expect(originals.find((node) => node.textContent?.includes('Microsoft Excel'))?.querySelector('small')?.textContent).toBe('File exports')
    expect(originals.find((node) => node.textContent?.includes('PDF & Word'))?.querySelector('small')?.textContent).toBe('Document workflows')
    expect(section.textContent).toContain('Provider availability depends on connection setup and account permissions.')
  })

  it('distributes integrations across three rows and hides only the seamless animation copies', async () => {
    await render(<PublicHome />)
    expect(HOME_INTEGRATION_ROWS).toHaveLength(3)
    expect(HOME_INTEGRATION_ROWS.flat()).toEqual(HOME_INTEGRATIONS)
    expect(new Set(HOME_INTEGRATIONS.map((item) => item.name)).size).toBe(HOME_INTEGRATIONS.length)
    const rows = host.querySelectorAll('#integrations-section .ph-integration-line')
    expect(rows).toHaveLength(3)
    rows.forEach((row, index) => {
      const lists = row.querySelectorAll('.ph-integration-list')
      expect(lists).toHaveLength(2)
      expect(lists[0].hasAttribute('aria-hidden')).toBe(false)
      expect(lists[1].getAttribute('aria-hidden')).toBe('true')
      expect(lists[0].querySelectorAll('.ph-integration')).toHaveLength(HOME_INTEGRATION_ROWS[index].length)
      expect(lists[1].innerHTML).toBe(lists[0].innerHTML)
    })
  })

  it('keeps a labeled email link and decorative arrow on each founder card', async () => {
    await render(<PublicHome />)
    const links = host.querySelectorAll<HTMLAnchorElement>('#team-section .ph-person__image a')
    expect(links).toHaveLength(HOME_PEOPLE.length)
    HOME_PEOPLE.forEach((person, index) => {
      expect(links[index].textContent).toBe(person.action)
      expect(links[index].getAttribute('href')).toBe(person.href)
      expect(links[index].querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    })
  })

  it('opens authentication for visitors and sends authenticated users to their appropriate destination', async () => {
    await render(<PublicHome />)
    await click(button('Get started free'))
    expect(host.querySelector('[aria-label="Sign in"]')).not.toBeNull()
    state.user = { uid: 'test-user' }
    await render(<PublicHome />)
    await click(button('Go to dashboard'))
    expect(state.push).toHaveBeenLastCalledWith('/dashboard')
    state.mfa = true
    await render(<PublicHome />)
    await click(button('Go to dashboard'))
    expect(state.push).toHaveBeenLastCalledWith('/complete-signup')
  })

  it('expands one FAQ at a time and exposes the answer accessibly', async () => {
    await render(<PublicHome />)
    const triggers = host.querySelectorAll<HTMLButtonElement>('.ph-faq-item button')
    await click(triggers[0])
    expect(triggers[0].getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('[role="region"]')?.textContent).toBeTruthy()
    expect(document.getElementById(triggers[0].getAttribute('aria-controls')!)?.textContent).toBe(HOME_FAQS[0][1])
    await click(triggers[1])
    expect(triggers[0].getAttribute('aria-expanded')).toBe('false')
    expect(triggers[1].getAttribute('aria-expanded')).toBe('true')
    await click(triggers[1])
    expect(triggers[1].getAttribute('aria-expanded')).toBe('false')
  })

  it('preserves visible pricing states and real monthly amounts', async () => {
    state.loading = true
    await render(<PublicHome />)
    expect(host.textContent).toContain('Loading available plans')
    state.loading = false; state.error = true
    await render(<PublicHome />)
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Plans could not be loaded')
    await click(button('Try again'))
    expect(state.refetch).toHaveBeenCalledOnce()
    state.error = false
    await render(<PublicHome />)
    expect(host.textContent).toContain('No plans are currently available')
    state.plans = ['pro', 'basic', 'free'].map((code, index) => ({ code, display_name: code, sort_order: 2 - index, pages_included: 100, tokens_included: 50000, pbc_storage_bytes_included: 1073741824, automations_limit: 5 }))
    await render(<PublicHome />)
    expect(Array.from(host.querySelectorAll('.ph-plan h3')).map((node) => node.textContent)).toEqual(['free', 'basic', 'pro'])
    expect(host.textContent).toContain('$9.99')
    expect(host.textContent).toContain('$49.99')
    expect(host.querySelectorAll('.ph-plan')).toHaveLength(3)
    expect(host.textContent).not.toContain('ANNUALLY')
  })

  it.each([false, true])('keeps the moving strips without a pause/resume control (reduced motion: %s)', async (reducedMotion) => {
    state.reducedMotion = reducedMotion
    await render(<PublicHome />)
    expect(host.querySelector('.ph-brand-strip .ph-marquee__track')).not.toBeNull()
    expect(button('Pause moving strips')).toBeUndefined()
    expect(button('Resume moving strips')).toBeUndefined()
    expect(host.querySelector('.ph-home')?.hasAttribute('data-motion-paused')).toBe(false)
  })
})

describe('shared navigation and media', () => {
  it('opens authentication from the shared visitor navigation', async () => {
    await render(<PublicHeader />)
    expect(host.querySelector('[aria-label="Open navigation"]')?.getAttribute('aria-expanded')).toBe('false')
    await click(button('Get started'))
    expect(host.querySelector('[aria-label="Sign in"]')).not.toBeNull()
  })

  it('keeps the authenticated and MFA navigation destinations', async () => {
    state.user = { uid: 'test-user' }
    await render(<PublicHeader />)
    expect(host.querySelector('a[href="/dashboard"]')?.textContent).toContain('Dashboard')
    state.mfa = true
    await render(<PublicHeader />)
    expect(host.querySelector('a[href="/complete-signup"]')?.textContent).toContain('Dashboard')
  })

  it('loads video only on activation and removes the iframe on close', async () => {
    await render(<VideoLightbox title="Test demo" videoId="tNwpajJZ8zA">Watch demo</VideoLightbox>)
    expect(document.querySelector('iframe')).toBeNull()
    await click(button('Watch demo'))
    expect(document.querySelector('iframe')?.src).toContain('youtube-nocookie.com/embed/tNwpajJZ8zA')
    await act(async () => user.keyboard('{Escape}'))
    expect(document.querySelector('iframe')).toBeNull()
    expect(document.activeElement).toBe(button('Watch demo'))
  })

  it('keeps decorative video stopped for reduced motion and offers manual playback', async () => {
    await render(<AmbientVideo name="hero" source="footer" className="test-video" />)
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
    expect(host.querySelector('video')?.hasAttribute('autoplay')).toBe(false)
    await click(host.querySelector('[aria-label="Play hero background video"]')!)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce()
    expect(host.querySelector('[aria-label="Pause hero background video"]')).not.toBeNull()
  })

  it('plays decorative video with normal motion and lets visitors pause it', async () => {
    state.reducedMotion = false
    await render(<AmbientVideo name="footer" className="test-video" />)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce()
    await click(host.querySelector('[aria-label="Pause footer background video"]')!)
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce()
    expect(host.querySelector('[aria-label="Play footer background video"]')).not.toBeNull()
  })

  it('advances carousel controls and keyboard navigation with a live position', async () => {
    await render(<HomeCarousel kind="proof" label="Examples">{[<p key="1">One</p>, <p key="2">Two</p>, <p key="3">Three</p>]}</HomeCarousel>)
    await click(button('Next slide'))
    expect(host.querySelector('[aria-live]')?.textContent).toBe('Position 2 of 3')
    await act(async () => user.keyboard('{ArrowRight}'))
    expect(host.querySelector('[aria-live]')?.textContent).toBe('Position 3 of 3')
    await click(button('Previous slide'))
    expect(host.querySelector('[aria-live]')?.textContent).toBe('Position 2 of 3')
  })
})

describe('products page', () => {
  const orderedProducts = PRODUCT_GROUPS.flatMap((group) => (
    PRODUCT_CATALOG.filter((product) => product.groupId === group.id)
  ))

  it('gives every catalog product details, a distinct accessible graphic, and a working directory anchor', async () => {
    await render(<PublicFeatures />)
    expect(Object.keys(PRODUCT_DETAILS).sort()).toEqual(PRODUCT_CATALOG.map((product) => product.id).sort())
    expect(host.querySelectorAll('article')).toHaveLength(PRODUCT_CATALOG.length)
    expect(new Set(Object.values(PRODUCT_DETAILS).map((detail) => detail.graphic)).size).toBe(PRODUCT_CATALOG.length)
    for (const product of PRODUCT_CATALOG) {
      const article = host.querySelector(`#product-${product.id}`)!
      const detail = PRODUCT_DETAILS[product.id]
      expect(article.querySelector('h3')?.textContent).toBe(product.name)
      expect(article.textContent).toContain(detail.description)
      expect(article.querySelectorAll('.pp-product__capabilities li')).toHaveLength(3)
      expect(article.querySelector('svg[role="img"]')?.getAttribute('aria-label')).toBe(detail.graphicLabel)
      expect(article.querySelector('svg[role="img"]')?.childElementCount).toBeGreaterThan(0)
      expect(article.querySelector('.pp-graphic__heading')?.textContent).toBe(product.name)
      expect(article.querySelector('figcaption')).toBeNull()
      expect(host.querySelector(`nav[aria-label="Product directory"] a[href="#product-${product.id}"]`)).not.toBeNull()
      expect(article.querySelector(`[aria-label="Explore ${product.name}"]`)?.getAttribute('href')).toBe(product.appHref)
      if (detail.guideHref) expect(article.querySelector(`[aria-label="Read the ${product.name} guide"]`)?.getAttribute('href')).toBe(detail.guideHref)
    }
    for (const group of PRODUCT_GROUPS) {
      expect(host.querySelector(`#${group.id}`)).not.toBeNull()
      expect(host.querySelector(`nav a[href="#${group.id}"]`)).not.toBeNull()
    }
    expect(host.querySelectorAll('h1')).toHaveLength(1)
    expect(host.textContent).toContain('FinanceClaw is coming soon')
  })

  it('lets visitors explore Speech2Write without opening sign in', async () => {
    await render(<PublicFeatures />)
    const link = host.querySelector<HTMLAnchorElement>('[aria-label="Explore Speech2Write"]')!
    expect(link.getAttribute('href')).toBe('/speech2write')
    let prevented = true
    host.addEventListener('click', (event) => {
      prevented = event.defaultPrevented
      event.preventDefault()
    }, { once: true })
    await click(link)
    expect(prevented).toBe(false)
    expect(host.querySelector('[aria-label="Sign in"]')).toBeNull()
  })

  it('downloads all three Speech2Write release files from either button and offers individual fallbacks', async () => {
    await render(<PublicSpeech2Write />)
    const expectedUrls = [SPEECH2WRITE_INSTALLER_URL, SPEECH2WRITE_CHECKSUMS_URL, SPEECH2WRITE_DOWNLOAD_URL]
    const downloads = Array.from(host.querySelectorAll<HTMLAnchorElement>('a[download]'))
    expect(downloads.map((link) => link.getAttribute('href'))).toEqual(expectedUrls)
    expect(downloads.map((link) => link.download)).toEqual(['install.sh', 'SHA256SUMS', 'Speech2Write-1.4.1.zip'])
    expect(host.querySelectorAll('iframe')).toHaveLength(0)
    const buttons = Array.from(host.querySelectorAll('button')).filter((node) => node.textContent === 'Download')
    expect(buttons).toHaveLength(2)
    for (const [index, downloadButton] of buttons.entries()) {
      await click(downloadButton)
      expect(Array.from(host.querySelectorAll('iframe')).slice(index * 3).map((frame) => frame.src)).toEqual(expectedUrls)
    }
    const firstFrame = host.querySelector('iframe')
    await click(buttons[0])
    expect(host.querySelectorAll('iframe')).toHaveLength(6)
    expect(host.querySelector('iframe')).not.toBe(firstFrame)
    expect(SPEECH2WRITE_DOWNLOAD_URL).toMatch(/\/releases\/download\/v[\d.]+\/Speech2Write-[\d.]+\.zip$/)
    expect(host.textContent).toContain('Download all three files')
    expect(host.textContent).toContain('allow multiple downloads')
    expect(host.textContent).toContain('leave the ZIP compressed')
    expect(host.textContent).toContain('macOS 15')
    expect(host.querySelector('code')?.textContent).toBe('chmod +x install.sh && ./install.sh')
  })

  it('opens sign in for visitors and preserves the selected product destination', async () => {
    await render(<PublicFeatures />)
    const inkwiseLink = host.querySelector<HTMLAnchorElement>('[aria-label="Explore Inkwise"]')!

    await click(inkwiseLink)

    expect(host.querySelector('[aria-label="Sign in"]')?.getAttribute('data-redirect-to')).toBe('/dashboard/inkwise')
  })

  it('links signed-in users directly to every product', async () => {
    state.user = { uid: 'test-user' }
    await render(<PublicFeatures />)
    const links = Array.from(host.querySelectorAll<HTMLAnchorElement>('.pp-product__actions > a:first-child'))

    expect(links).toHaveLength(orderedProducts.length)
    expect(links.map((link) => link.getAttribute('href'))).toEqual(orderedProducts.map((product) => product.appHref))

    links[0].addEventListener('click', (event) => event.preventDefault())
    await click(links[0])
    expect(host.querySelector('[aria-label="Sign in"]')).toBeNull()
  })
})

describe('footer inquiry flow', () => {
  const fillForm = async () => {
    for (const [label, text] of [['Your name', 'Test Person'], ['Company', 'Example'], ['Business email', 'test@example.com'], ['Tell us about the workflow', 'Test workflow']]) {
      await act(async () => user.type(host.querySelector(`[aria-label="${label}"]`)!, text))
    }
  }

  it('submits the existing payload, announces success, and can reset', async () => {
    state.submit.mockResolvedValue({})
    await render(<PublicFooter />)
    await fillForm()
    await click(button('Send your request'))
    expect(state.submit).toHaveBeenCalledWith({ name: 'Test Person', company: 'Example', email: 'test@example.com', message: 'Test workflow', subject: 'Website inquiry', inquiryType: 'general' })
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Your request has been received')
    await click(button('Send another message'))
    expect((host.querySelector('[aria-label="Your name"]') as HTMLInputElement).value).toBe('')
  })

  it('preserves entered content after a failed submission', async () => {
    state.submit.mockRejectedValue(new Error('Offline'))
    await render(<PublicFooter />)
    await fillForm()
    await click(button('Send your request'))
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('could not be sent')
    expect((host.querySelector('[aria-label="Your name"]') as HTMLInputElement).value).toBe('Test Person')
    expect(button('Send your request').disabled).toBe(false)
  })

  it('prevents duplicate inquiries while submission is pending', async () => {
    let finish: (value: unknown) => void = () => undefined
    state.submit.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    await render(<PublicFooter />)
    await fillForm()
    const form = host.querySelector('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(state.submit).toHaveBeenCalledOnce()
    expect(button('Sending…').disabled).toBe(true)
    expect(form.getAttribute('aria-busy')).toBe('true')
    await act(async () => finish({}))
    expect(host.querySelector('[role="status"]')).not.toBeNull()
  })

  it('does not duplicate the main contact form on the contact page', async () => {
    state.pathname = '/contact'
    await render(<PublicFooter />)
    expect(host.querySelector('form')).toBeNull()
    expect(host.querySelector('.ps-footer-contact--compact')).not.toBeNull()
  })
})
