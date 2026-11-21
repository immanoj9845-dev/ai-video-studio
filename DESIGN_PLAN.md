# AI Video Studio — Design Plan

## Subject & Audience
**Product**: In-browser AI video creation studio — type an idea, get a complete video with script, images, voice, and animation.
**Audience**: Creators, educators, marketers, storytellers who want video without editing skills.
**Primary Job**: Make the complex pipeline (script → images → voice → animation → video) feel effortless and magical.

---

## Color Palette (6 tokens)

| Token | Hex | Role |
|-------|-----|------|
| `ink` | `#0A0F1A` | Deep navy — primary text, hero background |
| `paper` | `#FAFAFA` | Off-white — card backgrounds, light sections |
| `accent` | `#00D4AA` | Teal-cyan — primary CTAs, active states, progress |
| `accent-dim` | `#00D4AA33` | 20% accent — hover glows, focus rings |
| `muted` | `#64748B` | Slate — secondary text, disabled states |
| `border` | `#E2E8F0` | Light gray — dividers, input borders |
| `error` | `#F43F5E` | Rose — error states only |
| `surface` | `#F8FAFC` | Subtle gray — secondary surfaces, hover |

**Rationale**: Avoids the generic "dark mode + neon accent" or "cream + terracotta" defaults. The deep navy (`ink`) feels cinematic (fitting for video), while the teal-cyan (`accent`) reads as "AI/generative" without being the overused purple. `paper`/`surface` give a clean, premium light mode.

---

## Typography

**Primary**: **Space Grotesk** (variable) — headlines, UI labels, numbers
- Geometric, slightly technical but warm — fits "AI studio" perfectly
- Variable font: single file, multiple weights (400–700)

**Secondary**: **DM Sans** (variable) — body copy, long-form text
- Humanist, highly readable at small sizes
- Pairs naturally with Space Grotesk

**Type Scale** (clamp-based, fluid):
| Role | Size | Weight | Line-height |
|------|------|--------|-------------|
| Display | `clamp(40px, 6vw, 72px)` | 700 | 1.1 |
| H1 | `clamp(32px, 4.5vw, 48px)` | 600 | 1.2 |
| H2 | `clamp(24px, 3vw, 32px)` | 600 | 1.3 |
| H3 | `clamp(20px, 2.5vw, 24px)` | 500 | 1.4 |
| Body | `clamp(16px, 1.8vw, 18px)` | 400 | 1.6 |
| Small | `14px` | 400 | 1.5 |
| Label | `12px` | 500 | 1.4 | (uppercase, tracking 0.08em)

**No all-caps for headlines. No single-word accent colors.** Type carries personality.

---

## Layout Concept

### Hero (above fold)
```
┌─────────────────────────────────────────────────────────┐
│  [Logo]                                    [Sign In]    │
│                                                         │
│        "Type an idea. Watch it become video."          │
│                                                         │
│    ┌──────────────────────────────────────────────┐    │
│    │  [textarea: "A curious fox discovers...]    │    │
│    │  [Style ▼]          [Create Video ▶]         │    │
│    └──────────────────────────────────────────────┘    │
│                                                         │
│    ▸ 4–6 scenes  ▸ AI images  ▸ Voiceover  ▸ Video   │
│                                                         │
│    [Showcase: 3 mini video thumbnails playing]         │
└─────────────────────────────────────────────────────────┘
```

**Principles**:
- **Centered, generous whitespace** — the input is the hero, not a dashboard
- **Live preview thumbnails** — show, don't tell (auto-playing muted loops)
- **Single primary CTA** — "Create Video" does everything (script + images + voice + video)
- **Progressive disclosure** — advanced options (Hugging Face token, music) collapse by default

### Scene Gallery (after generation)
```
┌─────────────────────────────────────────────────────────┐
│  ← Back                                    [Download]   │
│                                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │ Scene 1 │  │ Scene 2 │  │ Scene 3 │  │ Scene 4 │    │
│  │  [vid]  │  │  [img]  │  │  [img]  │  │  [img]  │    │
│  │  Animate│  │  Animate│  │  Animate│  │  Animate│    │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │
│                                                         │
│  [Optional Music]  [Make Final Video]                  │
└─────────────────────────────────────────────────────────┘
```

- **Horizontal scroll on mobile, grid on desktop**
- **Video clips play inline** (animated scenes), static images for pending
- **"Animate" button** per scene — granular control, not all-or-nothing

---

## Design Principles (The "Opinionated Choices")

1. **Cinematic, not SaaS** — Deep navy background, film-grain texture subtle on hero, aspect-ratio cards (16:9) everywhere. Feels like a creative tool, not a dashboard.

2. **One primary action** — "Create Video" handles the full pipeline. No "Generate Script" → "Generate Images" → "Generate Voice" → "Build Video" steps. The complexity is hidden.

3. **Show the work** — While generating, show *what's happening* with beautiful progress: "Writing script…" → "Painting scene 1 of 4…" → "Recording voice…" → "Animating…" → "Assembling video…" Each step has a tiny visual indicator.

4. **Micro-delight, not micro-animation** — One page-load reveal (hero text staggers in). Hover on scene cards: subtle scale + border glow. No fade-up on every section.

5. **Video-first showcase** — Hero includes 3 auto-playing example videos (muted, loop). Proves the output quality immediately.

6. **Respect the browser** — Uses native `<video>`, `<audio>`, `<dialog>`, MediaRecorder. No heavy canvas libraries unless needed.

7. **Empty states are invitations** — No results? Show 3 example prompts as clickable chips.

---

## Component Tokens (for CSS)

```css
:root {
  /* Color */
  --ink: #0A0F1A;
  --paper: #FAFAFA;
  --accent: #00D4AA;
  --accent-dim: rgba(0, 212, 170, 0.2);
  --muted: #64748B;
  --border: #E2E8F0;
  --error: #F43F5E;
  --surface: #F8FAFC;

  /* Type */
  --font-display: 'Space Grotesk', system-ui, sans-serif;
  --font-body: 'DM Sans', system-ui, sans-serif;

  /* Scale */
  --text-display: clamp(40px, 6vw, 72px);
  --text-h1: clamp(32px, 4.5vw, 48px);
  --text-h2: clamp(24px, 3vw, 32px);
  --text-h3: clamp(20px, 2.5vw, 24px);
  --text-body: clamp(16px, 1.8vw, 18px);
  --text-small: 14px;
  --text-label: 12px;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-full: 9999px;

  /* Shadow */
  --shadow-sm: 0 1px 2px rgba(10,15,26,0.04);
  --shadow-md: 0 4px 12px rgba(10,15,26,0.08);
  --shadow-lg: 0 12px 32px rgba(10,15,26,0.12);
  --shadow-glow: 0 0 0 3px var(--accent-dim);

  /* Transition */
  --ease: cubic-bezier(0.2, 0, 0, 1);
  --fast: 150ms var(--ease);
  --normal: 250ms var(--ease);
}
```

---

## Accessibility & Motion

- `prefers-reduced-motion`: disable stagger, scale hover, progress animations
- Focus rings: `var(--shadow-glow)` on all interactive elements
- Color contrast: AA+ on all text (ink/paper, accent/paper)
- Semantic HTML: `<main>`, `<section>`, `<article>`, `<dialog>`, `<progress>`
- ARIA labels on icon-only buttons

---

## Implementation Order

1. **CSS variables + reset + fonts** (index.css)
2. **Hero + input area** (App.jsx + App.css)
3. **Progress/loading experience** (new component or inline)
4. **Scene gallery** (horizontal scroll + grid)
5. **Final video section**
6. **Polish: empty states, errors, focus states**