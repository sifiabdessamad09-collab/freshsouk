# Storefront motion — local review, 5 November 2026

Release branch: `codex/freshsouk-video-journey`, based on current origin/main. Only storefront motion/video changes are included; domain-launch preparation and backend changes are excluded.

- Finite hero text entrance and gentle image zoom.
- Scroll reveal for qoffas, product cards and section headings, with a short stagger.
- Product and basket image lift on precise hover devices; button press feedback on touch.
- Cart badge pulse only when the existing cart count increases.
- Live catalogue replacements are observed; already-seen products and qoffas do not repeatedly reveal after refresh. Detached nodes are unobserved.
- Content is visible by default, including without animation/IntersectionObserver support. Reduced motion skips scripted animations and disables hover movement. Running animations cancel when the preference changes or the page becomes hidden.
- No animation libraries, external requests, new customer data or checkout hooks.
- Versioned CSS/JS and a new PWA cache identifier prepare updates for installed storefronts.

## Validation

32 existing automated tests pass. Public preservation check passes for 96 blobs, with the four explicitly listed storefront updates (index, redesign.js, redesign.css, sw.js). Admin asset build and allowlist check pass. JS syntax check passes.

Local fictitious integration preview: http://127.0.0.1:8801/ (loopback only, never deploy preview server). Desktop 1280x900 and mobile 390x844 checked: bilingual layout preserved, category filtering (17 vegetables / 12 fruits), cart addition, 8 DH item + 20 DH delivery = 28 DH, checkout opens on both sizes, no console errors/warnings. Mobile catalogue scroll width 375px within 390px, checkout width 390px; visible product images loaded. No order submitted and no WhatsApp message sent. Physical iPhone and live OS reduced-motion toggle have not been tested.

Screenshots outside repository: outputs/FRESHSOUK-motion-desktop.jpg and outputs/FRESHSOUK-motion-mobile.jpg. Animation itself should be reviewed in the local preview.

The owner approved storefront video publication on 2026-11-05. Domain activation remains outside this release.
