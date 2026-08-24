export type LegalSection = { id: string; title: string; content: React.ReactNode }

export function LegalPage({ title, description, lastUpdated, sections, action }: { title: string; description: string; lastUpdated: string; sections: LegalSection[]; action?: React.ReactNode }) {
  return <main id="main-content">
    <section className="ps-page-hero"><div className="ps-container ps-page-hero__split"><div><span className="ps-label">Last updated: {lastUpdated}</span><h1>{title}</h1></div><div><p className="ps-kicker">{description}</p>{action}</div></div></section>
    <section className="ps-section"><div className="ps-container ps-report-grid"><nav className="ps-report-nav" aria-label={`${title} contents`}>{sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}</nav><article className="ps-report-body">{sections.map((section, index) => <section id={section.id} key={section.id}><span className="ps-label">{String(index + 1).padStart(2, '0')}</span><h2>{section.title}</h2>{section.content}</section>)}</article></div></section>
  </main>
}
