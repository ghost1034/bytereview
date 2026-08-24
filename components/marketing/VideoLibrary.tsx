'use client'

import { useState } from 'react'
import { demoVideos } from '@/lib/marketing/config'

const groups = ['All', 'Document analysis', 'Form Fill', 'Inkwise', 'E-Signature', 'Chrona', 'Claw Series'] as const

export function VideoLibrary() {
  const [group, setGroup] = useState<(typeof groups)[number]>('All')
  const visible = group === 'All' ? demoVideos : demoVideos.filter((video) => video.group === group)
  return (
    <>
      <div className="ps-filter" role="tablist" aria-label="Product video filters">
        {groups.map((item) => <button key={item} type="button" role="tab" aria-selected={group === item} onClick={() => setGroup(item)}>{item}</button>)}
      </div>
      <div className="ps-video-grid">
        {visible.map((video, index) => (
          <article className={index === 0 ? 'ps-video-card ps-video-card--featured' : 'ps-video-card'} key={video.title}>
            <div className="ps-video-frame"><iframe src={video.url} title={video.title} loading={index > 0 ? 'lazy' : 'eager'} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>
            <div><span className="ps-label">{video.group}</span><h2>{video.title}</h2>{video.description && <p>{video.description}</p>}</div>
          </article>
        ))}
      </div>
    </>
  )
}
