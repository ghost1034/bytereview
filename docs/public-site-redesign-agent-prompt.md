# Prompt for the redesign agent

You are working in the CPAAutomation repository at `/Users/ianstewart/projects/bytereview`.

Plan and implement a complete, production-quality redesign of the CPAAutomation public marketing site from scratch.

Start by reading:

1. `AGENTS.md`
2. `docs/public-site-redesign-copy.md`

The old public-site implementation has intentionally been deleted to prevent design anchoring. Do not inspect Git history, deleted files, old commits, caches, deployment artifacts, or remote branches to recover the previous JSX, CSS, components, page structure, visual direction, or layout. Treat the current working tree and the copy handoff as the only starting point. If an undocumented non-design value is essential for functionality—such as an existing video or download URL—you may recover only that value, without studying the old implementation.

## Objective

Create a cohesive, original public site that feels credible, polished, and intentionally designed for accounting, finance, and legal professionals. It should communicate trust, technical competence, security, and product depth without looking like a generic AI-generated SaaS template.

The design should avoid the visual habits that often make “vibe-coded” sites feel unprofessional: gratuitous neon gradients, excessive glassmorphism, floating gradient blobs, repetitive card grids, overuse of pills, ornamental 3D effects, fake dashboards, constant scroll animations, and decorative complexity without hierarchy. Use a strong editorial system, excellent typography, disciplined spacing, clear information architecture, restrained motion, and convincing product storytelling. A distinctive idea is welcome, but usability and credibility come first.

## Scope

Build these routes and their shared public navigation/footer:

- `/`
- `/about`
- `/case-study/LFO`
- `/claw`
- `/consulting`
- `/contact`
- `/demo`
- `/features`
- `/pricing`
- `/privacy`
- `/terms`

Do not redesign, restyle, replace, or remove `/consulting/llm-governance`, `app/(fullscreen)`, or `public/llm-governance.html`; the existing LLM Governance presentation is explicitly outside scope and must remain unchanged. Also do not redesign or break the functional public flows for complete sign-in/sign-up, docs, guest signing, integration callbacks, PBC access, or the authenticated `/subscribe` billing flow. The shared `(general)` layout is currently intentionally minimal; add the new marketing shell in a way that does not force inappropriate marketing chrome onto functional flows. Route groups or nested layouts are encouraged if they create the correct boundary.

## Copy requirements

`docs/public-site-redesign-copy.md` is the source of truth for all existing wording. Keep that wording. You may reorganize it, change section order, improve hierarchy, split content across responsive components, and choose which secondary material is initially collapsed, but do not rewrite, shorten, “polish,” invent, or silently correct product/legal claims.

The handoff documents known inconsistencies. Preserve and flag them; do not resolve them without approval. Retain metadata, accessibility labels, form states, dynamic pricing wording, installation commands, and legal text.

## Functional requirements

- Preserve signed-in versus signed-out behavior for protected homepage product actions, using the existing authentication context/modal patterns.
- Pricing must load live subscription-plan data and preserve the existing MFA and checkout-session behavior. Do not hard-code live plan limits.
- Contact must submit through the existing contact API and keep validation, loading, success, and error states.
- Preserve all demo-video destinations, Chrona download destinations, Claw installation/download behavior, and configured Claw image environment-variable fallbacks.
- Preserve SEO metadata through the existing metadata utilities.
- Navigation must work on keyboard and touch, indicate appropriate current state, and behave well at all supported viewport sizes.
- Legal pages must prioritize readability, anchors/navigation, and print-friendly behavior.

## Engineering expectations

- Follow the repository conventions in `AGENTS.md`: strict TypeScript, React function components, the `@/` alias, two-space indentation, single quotes, semantic design tokens, and focused reusable components.
- Create a clean public-site component architecture rather than one huge page file or a pile of narrowly duplicated components.
- Keep the public visual system isolated enough that it does not accidentally restyle authenticated products.
- Prefer CSS and lightweight interaction over heavy client-side animation. Respect `prefers-reduced-motion`.
- Meet WCAG AA contrast, visible focus, semantic heading order, landmark, form-label, dialog, and screen-reader expectations.
- Make responsive behavior deliberate at mobile, tablet, laptop, and wide desktop sizes. Avoid horizontal overflow and fragile fixed-height sections.
- Optimize Core Web Vitals: minimize client components, reserve media dimensions, lazy-load below-the-fold media, and avoid expensive effects.
- Use real product UI or purposeful diagrams where useful. Do not use generic stock imagery or fabricated product claims. If an asset is missing, create an original restrained asset or use a well-designed code-native treatment.
- Do not add dependencies unless the benefit clearly justifies them.
- Remove any new dead code or abandoned experiments before handoff.

## Process

1. Audit the current repository boundaries, existing functional hooks/APIs, available brand assets, and the copy document. Do not search for the deleted marketing implementation.
2. Write a concise implementation plan covering information architecture, visual direction, shared system, route strategy, functionality, responsive behavior, accessibility, and verification.
3. Implement the full redesign. Do not stop after planning or after producing a single sample page.
4. Review every route at representative mobile and desktop sizes. Iterate on hierarchy, rhythm, content density, wrapping, focus behavior, and media loading.
5. Run focused tests, `npm run lint`, and `npm run build`. Fix issues introduced by the redesign. If a pre-existing failure remains, document it with evidence.
6. At handoff, summarize the design direction, files/routes changed, preserved integrations, verification performed, and any genuine open risks. Include screenshots of major routes if the environment supports them.

The result should feel like one authored site, not a set of disconnected landing-page templates. Make firm design decisions and carry them consistently across the entire public experience.
