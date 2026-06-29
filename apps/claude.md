# XA-LMS Frontend Design System

> Derived from the approved UI prototype (`XA_LMS_Standalone_24Jun2026.html`).
> Every new screen **must** match these tokens exactly — no deviations without design sign-off.

---

## Stack

| Layer | Tech |
|---|---|
| Web | Next.js 14 · TypeScript · Tailwind CSS · shadcn/ui |
| Mobile | React Native · Expo |
| Font | **Poppins** (400, 500, 600, 700, 800) — Google Fonts |

---

## Color Tokens

Map these to Tailwind CSS variables in `tailwind.config.ts` and shadcn theme.

```ts
// tailwind.config.ts → theme.extend.colors
colors: {
  brand: {
    navy:   '#1C2551',   // primary text, sidebar bg, primary-solid button
    orange: '#EF4E24',   // CTA button, active nav bar, badges, progress fill
    indigo: '#6B73BF',   // coaching, capstone, peer-review accent
  },
  surface: {
    page:    '#F5F7FB',  // app background
    card:    '#FFFFFF',  // cards, modals, dropdowns
    alt:     '#F0F1F7',  // table alt rows, progress track, input bg
    border:  '#EAECF4',  // all borders, dividers
  },
  text: {
    primary:   '#1C2551',   // headings, body
    secondary: '#8b90a7',   // labels, meta, placeholder
  },
  status: {
    success:  '#22c55e',
    warning:  '#f59e0b',
    danger:   '#ef4444',
    inactive: '#D0D3E0',
  },
}
```

---

## Typography

Font family on every element: `font-family: 'Poppins', sans-serif`

| Role | size | weight | color |
|---|---|---|---|
| Page / section title (header bar) | 17px | 700 | `#1C2551` |
| Card title | 15px | 700 | `#1C2551` |
| Body / table cell | 13px | 400–500 | `#1C2551` |
| Button label | 12px | 700 | depends on variant |
| Small meta / sub-label | 11px | 500 | `#8b90a7` |
| Micro label (ALL-CAPS field label) | 10px | 700 | `#8b90a7` · letterSpacing 0.5 |
| Stat / KPI number | 26px | 800 | role color or `#1C2551` |

---

## Layout Shell

```
┌────────────────────────────────────────────┐
│  Sidebar 240px   │  Header 60px            │
│  bg: #1C2551     │  bg: #fff               │
│                  │  borderBottom: #EAECF4  │
│                  ├─────────────────────────┤
│                  │  Page content           │
│                  │  bg: #F5F7FB            │
│                  │  padding: 24px          │
│                  │  gap: 16px (flex col)   │
└────────────────────────────────────────────┘
```

- **Sidebar width**: 240px, `zIndex: 10`
- **Header height**: 60px, white, `border-bottom: 1px solid #EAECF4`
- **Page content**: `padding: 24px`, `display: flex, flexDirection: column, gap: 16px, overflowY: auto`
- **Standard card grid**: `grid-template-columns: repeat(4,1fr); gap: 14px`  
  Collapse to 2-col on medium, 1-col on mobile.

---

## Sidebar

```
nav item — inactive : color rgba(255,255,255,0.6)  bg transparent
nav item — active   : bg rgba(239,78,36,0.15)  color #fff  fontWeight 600
                      + right-edge bar: 3px wide #EF4E24 (borderRadius 3px 0 0 3px)
nav item padding    : 9px 12px  borderRadius 8  fontSize 13
user avatar         : 34px circle  bg #EF4E24  color #fff  fontWeight 700
```

Logo area: `padding 20px 20px 16px`, `border-bottom: 1px solid rgba(255,255,255,0.08)`  
User row: `border-top: 1px solid rgba(255,255,255,0.08)`, `margin-top: auto`

---

## Component Patterns

### Card
```ts
bg: #fff · borderRadius: 12 · border: 1px solid #EAECF4
boxShadow: 0 1px 4px rgba(28,37,81,0.07) · padding: 20px
```

### Buttons — three variants only

| Variant | bg | border | color | borderRadius | padding |
|---|---|---|---|---|---|
| **Primary** (orange CTA) | `#EF4E24` | none | `#fff` | 8 | `9px 20px` |
| **Secondary** (ghost) | `#fff` | `1px solid #EAECF4` | `#1C2551` | 8 | `8px 16px` |
| **Icon / utility** | `#F5F7FB` | `1px solid #EAECF4` | `#1C2551` | 6 | `6px 10px` |

Button text: `fontWeight 700` (primary) · `fontWeight 600` (secondary) · `fontSize 12`  
Full-width confirm (e.g. modal submit): `bg #1C2551, borderRadius 10, padding 12px`

### Badge / Pill (PMBadge)
```ts
background: `${color}14`   // color at ~8% opacity
color: color
fontSize: 10 · fontWeight: 700 · borderRadius: 20 · padding: 3px 9px
```
Default color: `#EF4E24`

### AI Feature Chip (header)
```ts
bg: rgba(239,78,36,0.08) · border: 1px solid rgba(239,78,36,0.2)
color: #EF4E24 · borderRadius: 20 · padding: 4px 12px · fontSize: 11 · fontWeight: 600
```

### Progress Bar
```ts
track: { height:6, bg:#F0F1F7, borderRadius:99 }
fill:  { bg:#EF4E24, borderRadius:99 }          // swap color for status
```

### Tab Bar
```ts
inactive: bg #fff · border 1px solid #EAECF4 · color #8b90a7 · fontSize 12 · borderRadius 8 · padding 7px 16px
active:   bg #1C2551 · color #fff · borderColor #1C2551 · fontWeight 700
```

### Input Field
```ts
border: 1px solid #EAECF4 · borderRadius: 8 · padding: 9px 12px
fontSize: 13 · color: #1C2551 · width: 100%
```
Field label above input: `fontSize 10 · fontWeight 700 · color #8b90a7 · letterSpacing 0.5 · UPPERCASE · marginBottom 6`

### Modal
```ts
// Overlay
position:fixed · inset:0 · bg rgba(28,37,81,0.5) · zIndex 2000
display:flex · alignItems:center · justifyContent:center · padding:24

// Container
bg:#fff · borderRadius:16 · maxWidth:540 · maxHeight:88vh · overflow:hidden
boxShadow: 0 24px 64px rgba(28,37,81,0.22)

// Header strip inside modal
padding: 18px 24px · borderBottom: 1px solid #EAECF4
```

### Dropdown / Popover
```ts
position:absolute · bg:#fff · borderRadius:10–12
border: 1px solid #EAECF4 · boxShadow: 0 8px 32px rgba(28,37,81,0.14)
zIndex: 300–500
```

### Table
```ts
header row bg : #F5F7FB
header cell   : fontSize 11 · fontWeight 700 · color #8b90a7 · letterSpacing 0.5
row divider   : borderTop 1px solid #EAECF4
```

---

## Shadow Scale

| Use | Value |
|---|---|
| Card (subtle) | `0 1px 4px rgba(28,37,81,0.07)` |
| Dropdown | `0 8px 32px rgba(28,37,81,0.14)` |
| Modal | `0 24px 64px rgba(28,37,81,0.22)` |
| Drawer (slide-in) | `-8px 0 40px rgba(28,37,81,0.14)` |

---

## Border Radius System

| Element | Radius |
|---|---|
| Cards | 12px |
| Modals | 16px |
| Buttons (standard) | 8px |
| Buttons (full-width/confirm) | 10px |
| Buttons (small/utility) | 6px |
| Inputs | 8px |
| Badges / pills | 20px |
| Progress / scrollbar thumb | 99px |
| Sidebar phase box | 10px |

---

## Scrollbar (global CSS)

```css
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #D0D3E0; border-radius: 99px; }
```

---

## Activity Type Colors

Used on content library tiles and Add Activity modal chips:

| Activity | Color |
|---|---|
| Video, Assessment, Journal | `#EF4E24` |
| PDF, Live Session, Assignment | `#1C2551` |
| Case Study, Coaching | `#6B73BF` |
| Survey | `#8b90a7` |
| Peer Review | `#22c55e` |

---

## Persona Accent Colors

| Persona | Color |
|---|---|
| Participant | `#EF4E24` |
| Program Manager | `#1C2551` |
| Faculty | `#6B73BF` |
| Super Admin | `#0052CC` |

---

## Do / Don't

**Do**
- Use Poppins everywhere — including buttons, inputs, and selects explicitly
- Keep card shadow to the subtle `0 1px 4px` level; only go deeper for modals
- Use `#EF4E24` only for the single primary CTA on a page, nav active states, and progress fills
- Use `rgba(239,78,36,0.08)` / `rgba(239,78,36,0.15)` for orange tint surfaces (never full opacity orange as bg)
- Apply `borderRadius: 99` to all pill shapes and progress bars
- Show micro labels (field labels, stat sub-labels) as 10px ALL-CAPS `#8b90a7`

**Don't**
- ❌ Invent new colours — every hex must map to the token table above
- ❌ Use Tailwind arbitrary values for colours; always use the named token
- ❌ Mix button variants on the same row (primary + primary)
- ❌ Use `font-weight: 900` — max is 800 (stat numbers only)
- ❌ Deviate from the 240px sidebar or 60px header dimensions
- ❌ Add drop-shadows heavier than the modal shadow on non-modal elements

---

## shadcn/ui Overrides

When using shadcn components, override these defaults to match the design:

```ts
// Button → map to variants above
// Card → borderRadius 12, shadow 0 1px 4px rgba(28,37,81,0.07)
// Input → border #EAECF4, borderRadius 8, font Poppins 13px
// Badge → pill shape, borderRadius 20, fontSize 10
// Dialog → borderRadius 16, shadow 0 24px 64px rgba(28,37,81,0.22)
// Tabs → match tab/tabActive pattern above
// Table → F5F7FB header row, EAECF4 row dividers
```
