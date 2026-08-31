# Public homepage design

`redesign/index.html` is the visual reference, not a source of product claims.
The homepage retains its section order, 80rem/65rem containers, large sculpted
cards, holographic accents, ambient media, timeline, and carousel compositions.
Responsive transitions follow the reference at 991px, 767px, and 479px.

## Ownership

- `pages/home.tsx`: homepage sections and live billing states.
- `home-content.ts`: CPAAutomation products, existing customer feedback,
  professional-validation descriptions, case study, demos, and real people.
- `home-interactions.tsx`: ambient video controls, on-demand video dialogs,
  scroll-driven timeline, and accessible Embla controls.
- `app/(general)/public-home.css`: homepage-specific composition plus shared
  public header, footer, and buttons. Dashboard styles remain unchanged.
- `header.tsx` / `footer.tsx`: public navigation, authentication destinations,
  and the existing inquiry submission endpoint.

## Intentional differences from the template

- All eleven real products appear in five capability groups.
- The three monthly plans come from the existing billing hook. No unsupported
  annual toggle, discount, or checkout contract was introduced.
- One published customer case and two labeled demos replace fictional cases.
- Published customer quotations stay anonymized. Professional validation is
  descriptive content, not an attributed quotation or invented employment.
- Integration labels distinguish native connections from file interoperability.
- Genuine portraits and a CPAAutomation orbit graphic replace template branding.
- The hero uses the contact section's monochrome ambient video, with white text
  and a full-frame dark overlay for contrast instead of a glass panel or globe.
  Both hero calls to action remain unchanged; hero and footer playback controls
  are labeled separately even though they share the same video assets.
- Reduced-motion preferences stop decorative video and animation. Videos have
  explicit pause controls; moving strips pause on hover, and demos load only on activation.

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
