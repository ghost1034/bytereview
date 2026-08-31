// @vitest-environment jsdom

import { act, type AnchorHTMLAttributes, type ImgHTMLAttributes } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { HOME_CAPABILITIES, HOME_FAQS, HOME_PEOPLE, HOME_SECTIONS, HOME_STEPS } from './home-content'
import { PRODUCTS } from './content'

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
vi.mock('@/components/auth/AuthModal', () => ({ default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div role="dialog" aria-label="Sign in" /> : null }))
// WebGL rendering is verified in the browser; jsdom has no canvas context.
vi.mock('./three/GlobeBackground', () => ({ default: () => null }))
vi.mock('gsap', () => ({ gsap: { registerPlugin: vi.fn(), matchMedia: () => ({ add: vi.fn(), revert: vi.fn() }) } }))
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
    expect(HOME_PEOPLE.every((person) => ['/ian.jpg', '/ray.jpg', '/rae.jpg'].includes(person.image))).toBe(true)
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

  it('lets visitors pause all moving strips', async () => {
    await render(<PublicHome />)
    await click(button('Pause moving strips'))
    expect(host.querySelector('.ph-home')?.getAttribute('data-motion-paused')).toBe('true')
    expect(button('Resume moving strips').getAttribute('aria-pressed')).toBe('true')
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
    await render(<AmbientVideo name="hero" className="test-video" />)
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
