---
name: marpe-conventions
description: >-
  Use when creating, editing, refactoring, or reviewing React components, hooks, Tailwind
  styles, forms, or transfer/session logic in the dropto.space app (this repo).
---

# marpe Conventions (dropto.space)

Coding, UI and naming standards for this React 19 + TypeScript + Tailwind 4 codebase. Architecture, protocol invariants and commands live in `CLAUDE.md` — read it first; this skill covers *how code should look*.

**Don't port SolidJS habits here.** Destructuring props is fine, components re-render, effects are `useEffect`, and state lives in `useState`/`useReducer`.

---

## 1. React Invariants

1. **State machines use reducers.** Multi-step flows (sessions, anything with a `status`) go in a `useReducer` with a pure, exported reducer and a typed action union (see `hooks/useSenderSession.ts`). Don't scatter related `useState` calls across `App.tsx`.
2. **Long-lived callbacks must not capture render state.** Handlers registered with services (`WebRtcService`, `TransferSender`/`TransferReceiver`) outlive the render that created them. They must `dispatch` actions or read refs, never read `state`/props directly. Wrap engine callbacks in the `ifCurrent(...)` guard so events from a replaced or torn-down engine are dropped.
3. **Refs hold non-render objects only** (connections, engines, pending `DataConnection`, timers). Never mirror state into a ref during render (`ref.current = value` in the body; oxlint `react(refs)`).
4. **Effects synchronise with external systems only.** Examples: theme class, settings → `soundService`/`wakeLockService`, session setup/teardown. Derive values during render, or initialise lazily (`useState(() => …)`), rather than calling `setState` synchronously in an effect (oxlint `react(set-state-in-effect)`). Effects that start something return its cleanup.
5. **Services are injected, not imported, in hooks** that need tests. Follow `hooks/sessionServices.ts`: default real factories, fakes in `src/test/utils/fakeSessionServices.ts`.
6. **Structured classes** go through `cn()` (`utils/cn.ts`: clsx + tailwind-merge; later classes win). Don't use template-string class concatenation in new code.

---

## 2. Component Modularity

- **Push styling down.** Views (`SenderView`, `ReceiverView`, `App`) own layout only (flex/grid, gaps, max-widths). Leaf components own typography, surfaces, borders, focus and hover states.
- **A long or repeated class list means a component.** If you're copying a styled node, extract it with typed variant props instead.
- **Encapsulate conceptual units.** Existing examples: `TransferCompleteCard` (success/corrupted states plus confetti), `PinEntryCard`, `MetricsDashboard`, `PeerApprovalModal`, `IceServerRow`, `ShareBox`, `FileQueue`, `RoomCodeForm`, `TransferFileList`. New concepts get the same treatment.
- **Per-item state belongs in the row component.** Rows with their own edit, draft, copied or visibility state own it. Parents pass data and domain callbacks, never ID-keyed `Record<string, …>` state maps.
- **Modals** use `components/ui/Modal`: a native `<dialog>` opened with `showModal()`. Pass `title` (+ optional `icon`), the body as children and actions as `footer`; header and footer stay fixed while the body scrolls. Below `sm` it is a full-screen drawer. `onClose` enables the close button, Escape and click-outside (native `closedby`, with a fallback); pass `isDirty` while there are unsaved edits so only explicit Close/Cancel dismiss it; omit `onClose` when the user must choose (e.g. `PeerApprovalModal`). Footer submit buttons reach a body `<form>` via the native `form` attribute. Parents mount modals conditionally — no `isOpen` props. Never use `alert()` / `confirm()` / `prompt()`.
- **Transient "done" flags** (copied, saved) use `useCopyToClipboard` or the same pattern: timer cleared on re-trigger and unmount, and the flag set only when the action actually succeeded.

### Shared UI primitives — reach for these before hand-styling
- `components/ui/Button` — `variant`: `primary` | `secondary` | `danger` (secondary that turns red on hover: Decline, Cancel transfer) | `ghost` (dialog Cancel, inline actions); `size`: `sm` | `md` | `lg`. Per-site tweaks go via `className` (merged by `cn`). Add a variant rather than restyling a raw `<button>`.
- `components/ui/IconButton` — icon-only button with a required `title`; `iconButtonClassName()` (`ui/iconButtonStyles.ts`) styles icon links the same way.
- `components/ui/Card` — the raised section surface (`padding`: `sm` | `md` | `lg`). Never re-type `rounded-3xl bg-surface-1 border …`.
- `components/ui/StatusCard` — centred state screen: `badge`, `title`, `description`, actions as children (waiting, failed, complete, PIN).
- `components/ui/IconBadge` — tinted icon tile (`tone`: `brand` | `danger` | `warning`, `size`: `md` | `lg`, `isPulsing` for "waiting on the other device").
- `components/ui/Notice` — inline callout (`tone`: `brand` | `warning` | `danger`, optional `title`).
- `components/ui/TextInput` — `size` `sm` (settings fields) or `lg` (centred mono codes/PINs).
- `components/ui/ProgressBar` — `primary` | `subtle`; animates `transform`, not `width`.
- `components/ui/ToggleRow` — labelled on/off option; children (e.g. an input) show inside the row while it is on.
- `components/ui/ProgressRing` — circular overall progress with content in the middle (live transfer).
- Corner radii come from the `--radius-*` overrides in `styles/tokens.css` (flatter than Tailwind's defaults); use the `rounded-*` scale, never arbitrary radii. `Card` is a screen section: a full-width grouped block on phones, a hairline-divided part of the utility panel on desktop (inside `Screen`). Anything else placed in a screen (notices, the link bar) goes in `Inset` so it lines up. A screen's main action goes in `BottomBar` (pinned on phones, panel footer on desktop), not inside a section. The screen title belongs to the `AppBar`; don't repeat it as a section heading.
- `components/ui/StatTile` — one labelled number in transfer stats (live dashboard and completion card).
- `components/ui/NumberStepper` — a bare − / + number control (its label is the accessible name); place it in an `OptionRow`.
- `components/ui/OptionRow` — a settings row with a label, description and any control on the right; `ToggleRow` is the on/off variant (same box, `optionRowStyles.ts`).
- `components/ui/Screen` — one screen of a flow; give it a `key` naming the screen so the enter animation plays on step changes only.
- Small icon buttons (`IconButton size="sm"`) grow their padding on touch screens (`pointer-coarse:`); don't shrink them back with a `p-*` override.
- `components/ui/ConfirmDialog` — in-app confirmation on `Modal` (Back / confirm, `tone="danger"` for destructive actions). Ask only when someone is actually affected; default to the non-destructive choice.
- `components/ui/Pill` — small uppercase brand tag. `components/ui/LinkButton` — quiet text action. `components/ui/SegmentedControl` — mutually exclusive choices.
- `components/ui/Spinner` — colour comes from `text-*` (it draws in `currentColor`), size from `w-/h-`.
- `components/ui/GitHubIcon`.
- `components/ui/FileTypeIcon` — lucide glyph + Catppuccin colour for a file name/MIME type (`utils/fileKind.ts`).
- Icons: `lucide-react` first. A custom SVG becomes a component in `components/ui/` accepting `className` (see `GitHubIcon`). No inline `<svg>` blocks in views.

---

## 3. Button Labels

- **Inside forms, dialogs and modals, use short verbs:** *Save*, *Cancel*, *Accept*, *Decline*, *Retry*, *Copy*. The surrounding UI supplies the noun.
- **Where the surrounding UI already says what happens, one word is enough** (the drop zone's *File* / *Folder*). A primary call-to-action may carry a noun when nothing else on screen names the action (e.g. *Receive files*).
- **The page stays bare:** no header, footer or logo. Brand name lives in the tab title and Settings → About; copy is plain ("Drop files to send"), no marketing.
- Don't bulk-relabel existing buttons; e2e tests select several by text.

---

## 4. Theme & Styling Tokens

Light and dark themes are **sets of CSS variables**, not `dark:` variants. `src/index.css` defines the tokens in `@theme` (light) and overrides them under `.dark` (set by `useTheme` and the boot script). Components only ever name tokens, so a new theme is just another block of overrides. Don't write `dark:` classes or raw neutrals (`zinc-*`, `bg-white`).

| Purpose | Tokens | Notes |
| :--- | :--- | :--- |
| Page | `bg-background` | |
| Surfaces | `bg-surface-1` raised (cards, dialogs, rows) · `surface-2` sunken (lists, tiles) · `surface-3` controls · `surface-4` controls on hover | |
| Borders | `border-border-1` dividers · `border-2` panels · `border-3` inputs | A bare `border` already uses `border-2` |
| Text | `text-text-1` headings → `text-text-5` faint captions; `text-text-on-accent` on `bg-brand-500` | |
| Status | `text-text-danger-1`, `bg-surface-danger-1`, `border-border-danger-1`, `text-text-warning-1` | Tinted fills like `bg-red-500/10` read the same in both themes and are fine |
| Brand accent | `brand-50` … `brand-950` | Tailwind `blue-*` (`--color-brand-N: var(--color-blue-N)`) |
| File-type accents | `ctp-*` (Catppuccin) | Latte, Mocha under `.dark`; use `components/ui/FileTypeIcon` |
| Micro-labels | `text-2xs` | the only size below `text-xs` |

- **Scroll areas** get the `scroll-fade` class (fades the edge that has more content; `src/styles/scroll-fade.css`). If the scroller's background isn't `surface-1`, also set `[--scroll-fade-color:var(--color-surface-2)]` (or whichever surface).
- **Element defaults** (pointer cursor on enabled buttons, focus ring, selection, text wrapping) live in `src/styles/base.css`; don't repeat them per component.
- **Adding a token:** declare it in `@theme` with its light value and override it under `.dark`; name it by role (`surface-*`, `border-*`, `text-*`), never by colour.
- **No arbitrary colour values** (`bg-[#3ECF8E]`). Colours that must be JS values (confetti palette, theme-color) live in `src/branding.ts`; SVG fills use `style={{ stopColor: 'var(--color-brand-500)' }}`.
- **Never hardcode the brand.** The name, room-code prefix and brand colours come from `BRAND` (`src/branding.ts`) / `brand-*`.
- **Nothing smaller than `text-xs`** except `text-2xs`. No `text-[Npx]`.
- **Filled controls:** use `bg-accent hover:bg-accent-hover text-text-on-accent`, not `bg-brand-500`. The text colour comes from `contrast-color()` (white on blue). Don't use `text-white` there.
- **Copy:** sentence case for headings and buttons ("Receive files", "Copy link"); no protocol jargon (P2P, peer, stream) in the UI.
- **Motion:** new list rows and tiles enter with `starting:opacity-0 starting:translate-y-1`; buttons press (`active:scale`) rather than grow on hover.
- **Motion:** use `motion-safe:` for scale, bounce or float. List transition properties (`transition-[transform,background-color]`, `transition-colors`), not `transition-all`.
- **Prevent layout jitter:** keep `font-weight` and border width constant across states. Idle states get `border border-transparent`; only the colour changes.
- **Never `select-none` on containers** (it blocks copying error text). It's fine on buttons and drag handles.
- **Prefer pseudo-classes** (`hover:`, `group-hover:`, `focus:`) to JS-driven hover or animation timers.

---

## 5. Control Flow, Types & Naming

- Braces on every `if`/`else`/loop, with the body on its own line (oxlint `curly` enforces this).
- Guard clauses over nesting; strict equality only.
- Don't swallow errors silently. An intentionally ignored error needs a `catch` comment saying why it's safe (e.g. `// Already closed`); otherwise log it or rethrow.
- Booleans are prefixed `is` / `has` / `can` / `should` (`isPaused`, `isActive`). Durations and timestamps carry units (`resetMs`, `METRICS_INTERVAL_MS`).
- No `any` where a real type exists. `erasableSyntaxOnly` is on: no `enum`, no constructor parameter properties.
- Shared types go in `src/types/`. Component prop interfaces stay beside their component.
- Hook actions may be closures inside the hook. Elsewhere, prefer top-level single-purpose functions over nested helpers in large functions.

---

## 6. Comments

Code explains *what*. Comments only explain *why*: invariants, browser quirks, protocol rules, or non-obvious ordering (e.g. why `FILE_START` isn't awaited, why pickers must run in a user gesture). Never narrate steps (`// send the message`, `// loop over files`).

---

## 7. Refactoring & Tests

- Deliver the complete refactor in one pass, not a partial cleanup.
- No scans inside loops (`.find`/`.filter` per iteration). Index once with a `Map`.
- Prefer immutable transformations over mutable accumulators.
- Tests find elements by role and accessible name, or by `data-testid` for things whose wording is likely to change (`drop-zone`, `pick-files`, `pick-folder`). Never assert on marketing copy; a test that only checks wording tests nothing.
- Behaviour changes are test-first. Unit tests go in `src/test/`. Protocol tests pair a real `TransferSender` and `TransferReceiver` via `MockDataConnection`. Hooks are tested through `renderHook` with fake services. UI that depends on a real browser (WebRTC, brand CSS) is covered by Playwright.

---

## 8. App Patterns

- **New protocol message:** add it to the `ControlMessage` union (`types/transfer.ts`), validate it in `parseControlMessage` (`services/transfer/protocol.ts`), and handle it in the `handleMessage` of the side that receives it (`TransferSender` or `TransferReceiver`; shared messages go in `TransferPeer`). Surface it to the UI only via `TransferEvents`/`ReceiverEvents`. Test it with a connected sender/receiver pair.
- **New setting:** add it to `AppSettings`, `DEFAULT_SETTINGS` (`hooks/useSettings.ts`) and `SettingsModal`. If a service consumes it, sync it in `useSettings`'s effect. The modal edits a local draft and saves on submit.
- **File pickers** (`showSaveFilePicker`, `showDirectoryPicker`) run only from a user click. Choose storage once, up front, and reuse it for every file.
- **Brand-visible string:** update `src/branding.ts`, and `index.html` / `vite.config.ts` if the static head or manifest shows it. Editing the inline script in `index.html` means regenerating its CSP hash in `vercel.json` (`csp.test.ts` fails until you do).
