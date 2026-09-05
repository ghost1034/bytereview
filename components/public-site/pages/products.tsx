import Link from 'next/link'
import { ArrowUpRight, Check } from 'lucide-react'

import { PRODUCT_CATALOG, PRODUCT_GROUPS } from '@/lib/product-catalog'
import { PRODUCT_DETAILS } from '../product-details'
import { ProductExploreLink } from '../product-explore-link'
import { ProductGraphic } from '../product-graphic'
import { PageHero, Reveal, SectionHeading, SiteButton } from '../ui'

export function PublicFeatures() {
  return (
    <div className="pp-products">
      <PageHero
        eyebrow="The CPAAutomation products"
        title={<>Built for the work.<br /><span className="ps-gradient-text">Connected by design.</span></>}
        description={`Explore ${PRODUCT_CATALOG.length} purpose-built products for accounting, finance, and legal teams. From the first source document to the final deliverable, find the right tool for your next workflow.`}
        actions={<><SiteButton href="#product-directory" variant="light">Find your product</SiteButton><SiteButton href="/demo" variant="ghost">Watch demos</SiteButton></>}
      />
      <nav className="pp-directory ps-container" id="product-directory" aria-label="Product directory">
        <div className="pp-directory__heading"><span>The full toolkit</span><p>Choose a product. See what it can do.</p></div>
        <div className="pp-directory__groups">
          {PRODUCT_GROUPS.map((group) => (
            <div key={group.id}>
              <Link className="pp-directory__group" href={`#${group.id}`}><span>{group.number}</span>{group.name}<ArrowUpRight aria-hidden /></Link>
              <ul>{PRODUCT_CATALOG.filter((product) => product.groupId === group.id).map((product) => <li key={product.id}><Link href={`#product-${product.id}`}>{product.name}</Link></li>)}</ul>
            </div>
          ))}
        </div>
      </nav>
      {PRODUCT_GROUPS.map((group, groupIndex) => (
        <section className={`ps-section pp-group${groupIndex % 2 ? ' ps-section--soft' : ''}`} id={group.id} key={group.id}>
          <div className="ps-container">
            <SectionHeading number={`00${groupIndex + 1}`} eyebrow={group.name} title={group.name} description={group.description} />
            <div className="pp-product-list">
              {PRODUCT_CATALOG.filter((product) => product.groupId === group.id).map((product) => {
                const Icon = product.icon
                const detail = PRODUCT_DETAILS[product.id]
                return (
                  <article id={`product-${product.id}`} aria-labelledby={`product-${product.id}-title`} className="pp-product" key={product.id}>
                    <Reveal className="pp-product__copy">
                      <div className="pp-product__name"><Icon aria-hidden /><h3 id={`product-${product.id}-title`}>{product.name}</h3>{product.accessStrategy === 'free' && <span className="pp-product__badge">Free</span>}</div>
                      <p className="pp-product__tagline">{detail.tagline}</p>
                      <p className="pp-product__description">{detail.description}</p>
                      <ul className="pp-product__capabilities">{detail.capabilities.map((capability) => <li key={capability}><Check aria-hidden /><span>{capability}</span></li>)}</ul>
                      <p className="pp-product__use-case"><strong>Made for</strong> {detail.useCase}</p>
                      <div className="pp-product__actions">
                        <ProductExploreLink href={product.appHref} productName={product.name} />
                        {detail.guideHref && <Link href={detail.guideHref} aria-label={`Read the ${product.name} guide`}>Read the guide <ArrowUpRight aria-hidden /></Link>}
                      </div>
                    </Reveal>
                    <Reveal className="pp-product__visual"><ProductGraphic kind={detail.graphic} label={detail.graphicLabel} productName={product.name} /></Reveal>
                  </article>
                )
              })}
            </div>
          </div>
        </section>
      ))}
      <section className="pp-next ps-section ps-section--ink">
        <div className="ps-container"><div><span className="pp-next__eyebrow">Your next workflow starts here</span><h2>Start with the work<br />you want to simplify.</h2><p>Compare plans or talk with us about the right products for your team.</p></div><div className="pp-next__actions"><SiteButton href="/pricing" variant="light">Compare plans</SiteButton><SiteButton href="/contact" variant="ghost">Talk to our team</SiteButton></div></div>
      </section>
    </div>
  )
}
