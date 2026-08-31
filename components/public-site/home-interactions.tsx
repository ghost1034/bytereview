'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel'
import { HOME_STEPS } from './home-content'

export function HomeAboutHeading({ children }: { children: string }) {
  const ref = useRef<HTMLHeadingElement>(null)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    gsap.registerPlugin(ScrollTrigger, SplitText)
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const split = SplitText.create(node, { type: 'words,chars', tag: 'span' })
      // Match the template's character-by-character reveal as the heading crosses the viewport.
      gsap.fromTo(split.chars, { opacity: .1 }, {
        opacity: 1,
        duration: .01,
        stagger: { amount: .5 },
        ease: 'none',
        scrollTrigger: {
          trigger: node,
          start: 'clamp(top bottom)',
          end: 'clamp(top top)',
          scrub: .8,
        },
      })
    }, node)
    return () => media.revert()
  }, [children])

  return <h2 ref={ref}>{children}</h2>
}

export function AmbientVideo({ name, source = name, className }: { name: 'hero' | 'footer'; source?: 'hero' | 'footer'; className: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      setPaused(media.matches)
      if (media.matches) video.pause()
      else void video.play().catch(() => setPaused(true))
    }
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const toggle = () => {
    const video = ref.current
    if (!video) return
    if (paused) void video.play().then(() => setPaused(false)).catch(() => setPaused(true))
    else { video.pause(); setPaused(true) }
  }

  return <>
    <video ref={ref} className={className} muted loop playsInline preload="none" poster={`/public-site/${source}-poster.jpg`} aria-hidden="true">
      <source src={`/public-site/${source}.webm`} type="video/webm" />
      <source src={`/public-site/${source}.mp4`} type="video/mp4" />
    </video>
    <button type="button" className="ps-ambient-toggle" onClick={toggle} aria-label={`${paused ? 'Play' : 'Pause'} ${name} background video`}>
      {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
    </button>
  </>
}

export function VideoLightbox({ videoId, title, children, className }: { videoId: string; title: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><button type="button" className={className} aria-label={`Play ${title}`}>{children}</button></DialogTrigger>
    <DialogContent className="ps-video-dialog" aria-describedby={undefined}>
      <DialogTitle>{title}</DialogTitle>
      {open && <iframe src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`} title={title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />}
    </DialogContent>
  </Dialog>
}

export function HomeTimeline() {
  const ref = useRef<HTMLOListElement>(null)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    gsap.registerPlugin(ScrollTrigger)
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const items = Array.from(node.querySelectorAll<HTMLElement>('.ph-step'))
      // The template uses one five-part timeline: each completed step stays
      // active, and the line reaches the final node at four-fifths progress.
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: node,
          start: 'clamp(top center)',
          end: 'clamp(bottom center)',
          scrub: .8,
        },
      })
      timeline.fromTo(node.querySelector('.ph-timeline__fill'), { height: '10%' }, {
        height: '90%', duration: items.length - 1, ease: 'none',
      }).to({}, { duration: 1 })

      const updateSteps = () => {
        items.forEach((item, index) => item.classList.toggle('is-active', index <= timeline.time()))
      }
      timeline.eventCallback('onUpdate', updateSteps)
      updateSteps()

      return () => items.forEach((item, index) => item.classList.toggle('is-active', index === 0))
    }, node)
    return () => media.revert()
  }, [])

  return <ol ref={ref} className="ph-timeline">
    {HOME_STEPS.map((step, index) => {
      const Icon = step.icon
      return <li className={`ph-step${index === 0 ? ' is-active' : ''}`} key={step.title}>
        <div className="ph-step__symbol"><span><Icon aria-hidden /></span><b>{String(index + 1).padStart(2, '0')}</b></div>
        <div className="ph-step__node" aria-hidden><span /></div>
        <div className="ph-step__copy"><h3>{step.title}</h3><p>{step.body}</p></div>
      </li>
    })}
    <li className="ph-timeline__rail" aria-hidden><span className="ph-timeline__fill" /></li>
  </ol>
}

export function HomeCarousel({ children, label, kind }: { children: React.ReactNode[]; label: string; kind: 'proof' | 'people' }) {
  const [api, setApi] = useState<CarouselApi>()
  const [selected, setSelected] = useState(0)
  const [positions, setPositions] = useState(children.length)
  useEffect(() => {
    if (!api) return
    const update = () => {
      setSelected(api.selectedScrollSnap())
      setPositions(api.scrollSnapList().length)
    }
    update()
    api.on('select', update)
    api.on('reInit', update)
    return () => { api.off('select', update); api.off('reInit', update) }
  }, [api])

  return <Carousel opts={{ align: 'start', loop: kind === 'proof' }} setApi={setApi} className={`ph-carousel ph-carousel--${kind}`} aria-label={label}>
    <CarouselContent>{children.map((child, index) => <CarouselItem key={index}>{child}</CarouselItem>)}</CarouselContent>
    <div className="ph-carousel__controls">
      <div className="ph-carousel__progress" aria-hidden><span style={{ width: `${((selected + 1) / Math.max(positions, 1)) * 100}%` }} /></div>
      <CarouselPrevious /><CarouselNext />
    </div>
    <span className="sr-only" aria-live="polite">Position {selected + 1} of {positions}</span>
  </Carousel>
}
