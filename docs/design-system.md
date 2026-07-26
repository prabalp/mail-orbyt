# Design system

`packages/design-system` implements the Material 3 tokens and component
library, plus the authenticated application shell chrome.

## Tokens

`src/tokens/tokens.css` defines every color as an "R G B" channel triple
(not a hex string), e.g. `--md-outline-rgb: 116 119 127`. This is
deliberate: Tailwind's opacity modifiers (`bg-outline/30`, `text-on-surface/38`)
only work on theme colors composed as `rgb(var(--x) / <alpha-value>)` —
plain `var(--x)` hex/rgb() strings silently drop the modifier (the utility
still generates, it just renders fully transparent). `tailwind-preset.ts`'s
`withAlpha()` helper does this composition once per token so every consuming
app gets working opacity modifiers automatically.

`designSystemPreset` is exported from a dedicated subpath —
`@mail-orbyt/design-system/tailwind-preset` — instead of the package's main
entry point. Next.js loads `tailwind.config.ts` through `jiti` (a CJS-based
TS loader), which cannot resolve this package's React/JSX component files.
Importing the preset from the main barrel breaks the build with a confusing
"Cannot find module" error; the subpath export sidesteps it entirely.

## Component library

28 components implementing the spec's full list (Button, IconButton,
TextInput, TextArea, Select, Checkbox, RadioGroup, Switch, Badge, Chip,
Card, Dialog, Drawer, DropdownMenu, Tooltip, Tabs, Table, Pagination,
EmptyState, Skeleton, Toast, Alert, Stepper, DatePicker, TimePicker,
PageHeader, MetricCard, StatusIndicator), plus the application shell
(Sidebar, MobileDrawer, OrgSwitcher, UserMenu, Breadcrumbs, NotificationArea,
AppShell).

Notable decisions:

- **Dialog** uses the native `<dialog>` element (`showModal()`) for built-in
  focus trapping and Escape handling instead of a hand-rolled focus trap.
  jsdom doesn't implement `showModal`/`close`, so the test setup
  (`vitest.setup.ts`) polyfills them — component tests exercise the same
  code path real browsers use.
- **DropdownMenu** clones its `trigger` element (`cloneElement`) rather than
  wrapping it in an owned `<button>`. Wrapping is the more common pattern in
  menu libraries, but it produces invalid, hydration-breaking HTML whenever
  the trigger itself is already interactive (e.g. `<Button>`) — a real bug
  caught via browser console inspection during this phase, not by the unit
  tests, which is why a Playwright-driven visual/console check is part of
  this phase's verification, not just Vitest.
- **Chip** never renders a `<button>` when it also has a removable `×`
  control — it uses a `role="button"` span with keyboard handling instead,
  for the same reason (a `<button>` cannot legally contain another
  `<button>`).
- **Sidebar / Breadcrumbs / MobileDrawer** accept an injectable
  `LinkComponent` prop (defaulting to a plain `<a>`) so this package never
  depends on `next/link` — apps/web will pass Next's `Link` once routing
  exists.

## Showcase routes

- `/design-system` — every component and its states (loading, error,
  disabled, selected), for visual QA.
- `/design-system/shell` — the `AppShell` composition (sidebar, top nav, org
  switcher, notifications, breadcrumbs) with placeholder demo data. Real
  session/organisation data is wired in from Phase 2 onward — this route
  exists only to visually verify the shell layout itself.

## Testing

Component tests use Vitest + Testing Library (`jsdom` environment,
`globals: true` — required for Testing Library's automatic `cleanup()` to
register; without it, DOM from one test leaks into the next within the same
file). Tests cover interaction (click, keyboard activation), accessibility
attributes (`aria-*`, roles), and — for Dialog/DropdownMenu/Chip — the
specific invalid-HTML-nesting bugs described above, so they can't regress
silently.
