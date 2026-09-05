# Public homepage design

`redesign/index.html` is the visual reference, not a source of product claims.
The homepage retains its section order, 80rem/65rem containers, large sculpted
cards, holographic accents, ambient media, timeline, and carousel compositions.
Responsive transitions follow the reference at 991px, 767px, and 479px.

## Ownership

- `pages/home.tsx`: homepage sections and live billing states.
- `pages/products.tsx`: the `/features` product directory and all thirteen product showcases.
- `product-details.ts` / `product-graphic.tsx`: documented capabilities, use cases, guide links, and accessible SVG workflow illustrations for each catalog product.
- `app/(general)/features/products.css`: responsive product-page styles, scoped to the products page.
- `home-content.ts`: CPAAutomation products, existing customer feedback,
  professional-validation descriptions, case study, demos, and real people.
- `home-interactions.tsx`: ambient video controls, on-demand video dialogs,
  scroll-driven timeline, and accessible Embla controls.
- `app/(general)/public-home.css`: homepage-specific composition plus shared
  public header, footer, and buttons. Dashboard styles remain unchanged.
- `header.tsx` / `footer.tsx`: public navigation, authentication destinations,
  and the existing inquiry submission endpoint.

## Intentional differences from the template

- All thirteen real products appear in five capability groups.
- The three monthly plans come from the existing billing hook. No unsupported
  annual toggle, discount, or checkout contract was introduced.
- One published customer case and two labeled demos replace fictional cases.
- Published customer quotations stay anonymized. Professional validation is
  descriptive content, not an attributed quotation or invented employment.
- The integrations strip includes a curated selection from the OpenConnector
  provider catalog, with its source revision recorded in `home-content.ts`.
  Labels distinguish OpenConnector providers, native connections, and file
  interoperability; provider availability still depends on connection setup
  and account permissions. Each entry appears in one of three rows, with an
  accessibility-hidden duplicate for the seamless animation.
- Genuine portraits and a CPAAutomation orbit graphic replace template branding.
- The hero uses the contact section's monochrome ambient video, with white text
  and a full-frame dark overlay for contrast instead of a glass panel or globe.
  Both hero calls to action remain unchanged; hero and footer playback controls
  are labeled separately even though they share the same video assets.
- Reduced-motion preferences stop decorative video and animation. Videos have
  explicit pause controls; moving strips pause on hover, and demos load only on activation.

## Product-page content

The product directory and sections use `lib/product-catalog.ts` for names, groups,
and application destinations. Keep `product-details.ts` in sync when adding a
product; the public-site tests require details and a distinct graphic for every
catalog entry. Illustrations are labeled as illustrative workflows, use sample
data, and are not application screenshots. Product claims come from the product
documentation and implemented screens. FinanceClaw remains marked coming soon.

## Verification

Run `npm run test:unit`, `npm run lint`, and `npm run build`.
`home.test.tsx` exercises auth/MFA destinations, section/product coverage, FAQ,
billing states, video controls/dialogs, carousel navigation, and inquiry success,
failure, and duplicate-submission protection without contacting live services.

Browser-review checklist:

- Compare the reference and homepage at the same desktop dimensions.
- Check 1440px, 768px, 390px, and 320px widths without document overflow.
- Verify menu placement, Escape, outside click, focus restoration, and routing
  in a real browser (floating positioning requires a layout engine).
- Check timeline, case and people sliders, FAQ, video close/focus behavior,
  footer readability, and the compact `/contact` footer.
- Recheck loaded pricing and real contact delivery with the backend running;
  a frontend-only server intentionally exposes the pricing retry state.

No Webflow runtime, backend schema, API contract, or hosting changes are needed.
