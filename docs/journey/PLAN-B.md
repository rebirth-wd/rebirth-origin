# Agent B: pinned SpaceJourney stage (as built)

Files: `src/components/sections/SpaceJourney.astro` (markup, layering, fallback CSS),
`src/components/sections/spacejourney/journey.ts` (pin + master timeline + camera maths),
`spacejourney/HeroContent.astro` (hero copy + phone from Hero.astro), `spacejourney/Section2.astro` (certificate content),
`src/pages/preview/journey.astro` (preview + dummy reveal sections), `docs/journey/tools/b/*` (verification tools).

## Layering inside the 100svh stage (JS + motion; `html.sj-motion`)
| z | layer | contents |
|---|-------|----------|
| act1 | `[data-sj-space]` | `<SpaceBackdrop moon moonPhoto={false}/>`, scales 1 → 1.35 about the chest during the approach |
| act1 | `[data-sj-world="left"]`, hero, `[data-sj-world="right"]` | one camera transform shared by both world layers; left figure behind the copy, lifted to the front once the copy is gone |
| act1 | `smoke-pink.webp` | moved by JS INTO the left figure's torso part on A's chest rect, edges feathered 10%, so it follows the idle motion exactly and cross-fades in without a jump |
| act2 | `[data-sj-space2]` | `<SpaceBackdrop moonPhoto={false}/>` (no moon) |
| act2 | `[data-sj-dogwrap]` | `<Dog/>` laid out at exactly the size that covers the stage (computed from dog.json with `isPointInFill`), transform-scaled down |
| act2 | `[data-sj-grad]` | viewport-sized `.rb-gradient-field` |
| act2 | `[data-sj-s2]` | section-2 copy + four badges |
| act3 | `<PhoneShowcase/>` | Agent C, hidden until `play()` |
| fx | beam, bloom, flash | scrubbed in; the whole fx layer fades out by time after the flash |

## Master timeline (scroll in viewport-heights; desktop; mobile ≤767px = same timeline × 0.82)
| label | vh | what happens |
|-------|----|--------------|
| `hero`/`approach` | 0 → 2.4 | pinned from `top top`. Copy out 0–0.58 (power2.in). Figures converge (to 95% by 1.44, 98.5% by 1.87, then expo.out to exactly 1 at fill), turn from the head-first hero angles to rotation 0 (0.1–1.68), reach 0→1 (0.29–1.58). Camera: chest goes from where the figure's own drift puts it to the stage centre (0.14–2.06); zoom power2.in to a held two-shot (desktop ×3.2, mobile ×2.1) at 1.73, then power4.in to the cover scale. Idle is frozen at 1.73 (`setIdle(false)`), the residual idle offset of the hands / chest window is measured once with `handPoint` / `getBoundingClientRect` and corrected over 1.73–2.4. Smoke overlay 2.11–2.35. |
| `fill` | 2.4 | the overlay's opaque core covers the stage (verified 1440×900, 1920×1080, 390×844); hands at the source clasp |
| `section2-in` | 2.4 → 3.3 | gradient fades over the smoke in 0.24 vh; copy + 4 badges stagger in (0.09 vh apart) |
| `section2-hold` | 3.3 → 4.3 | still (the gradient's own drift only) |
| `dog` | 4.3 → 6.15 | copy out (reverse order) 4.3–4.7; the plain gradient cross-fades into the screen-covering dog 4.4–4.62; the dog recedes (log scale, power2.inOut) 4.62–6.15 while its centre follows a bezier centre → left → C's `dogRect()`; detail overlay fades in 5.0–5.6; rim stroke kept at C's on-screen thickness |
| `beam` | 6.25 → 6.63 | thin beam scaleX 0→1 from the centre (expo.out) |
| `flash` | 6.6 → 6.9 | bloom swells + white 0→1; at 6.9 `showcase.play()`, dog/space hidden; white holds 0.15 s then fades 0.5 s (time-based). Crossing back: `reset()`, fx restored |
| end | 7.1 | pin releases; the running showcase scrolls away |

Total pinned scroll: desktop 7.1 vh, mobile 5.82 vh.

## Staging of "hands touch = screen fill"
The hands are 0.42 box-widths from the chest, so at the cover zoom they are far off-screen. They therefore close the last gap
in a held two-shot (zoom about ×3.2) and are within a pixel of contact from about 0.86 of the approach while still in frame.
The camera then rushes into the chest. The contact is mathematically exact (source arrangement) at `fill`.

## Fallback (no JS or reduced motion)
Without `html.sj-motion`: hero on space + moon (static figures, head-first), section 2 on the gradient, the showcase in its
final state, all stacked. No pin, no scrub.
