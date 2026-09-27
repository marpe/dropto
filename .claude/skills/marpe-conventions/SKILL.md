---
name: marpe-conventions
description: >-
  Use when creating, editing, refactoring, or reviewing React components, hooks, Tailwind
  styles, forms, or transfer/session logic in the DropWave / dropto.space app (this repo).
---

# marpe Conventions (DropWave / dropto.space)

Coding, UI and naming standards for this React 19 + TypeScript + Tailwind 3 codebase. Architecture, protocol invariants and commands live in `CLAUDE.md` — read it first; this skill covers *how code should look*.

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
- **Encapsulate conceptual units.** Existing examples: `TransferCompleteCard` (success/corrupted states plus confetti), `PinEntryCard`, `MetricsDashboard`, `PeerApprovalModal`, `IceServerRow`, `Footer`. New concepts get the same treatment (e.g. a mode switcher, share box, file-queue row).
- **Per-item state belongs in the row component.** Rows with their own edit, draft, copied or visibility state own it. Parents pass data and domain callbacks, never ID-keyed `Record<string, …>` state maps.
- **Modals** use `components/ui/Modal` (overlay, panel, size `sm`/`md`). Pass `onClose` for a close button plus Escape; omit it when the user must choose (e.g. `PeerApprovalModal`). Parents mount modals conditionally — no `isOpen` props. Never use `alert()` / `confirm()` / `prompt()`.
- **Transient "done" flags** (copied, saved) use `useCopyToClipboard` or the same pattern: timer cleared on re-trigger and unmount, and the flag set only when the action actually succeeded.

### Shared UI primitives — reach for these before hand-styling
- `components/ui/Button` — `variant`: `primary` | `secondary` | `danger` (secondary that turns red on hover: Decline, Cancel transfer) | `ghost` (dialog Cancel, inline actions); `size`: `sm` | `md` | `lg`. Per-site tweaks go via `className` (merged by `cn`). Add a variant rather than restyling a raw `<button>`.
- `components/ui/IconButton` — icon-only button with a required `title`; `iconButtonClassName()` (`ui/iconButtonStyles.ts`) styles icon links the same way.
- `components/ui/Card` — the raised section surface (`padding`: `sm` | `md` | `lg`). Never re-type `rounded-3xl bg-white dark:bg-supabase-surface border …`.
- `components/ui/StatusCard` — centred state screen: `badge`, `title`, `description`, actions as children (waiting, failed, complete, PIN).
- `components/ui/IconBadge` — tinted icon tile (`tone`: `brand` | `danger` | `warning`, `size`: `md` | `lg`, `isPulsing` for "waiting on the other device").
- `components/ui/Notice` — inline callout (`tone`: `brand` | `warning` | `danger`, optional `title`).
- `components/ui/TextInput` — `size` `sm` (settings fields) or `lg` (centred mono codes/PINs).
- `components/ui/ProgressBar` — `primary` | `subtle`; animates `transform`, not `width`.
- `components/ui/Pill` — small uppercase brand tag. `components/ui/AppLogo` — the header mark.
- `components/ui/Spinner` — colour comes from `text-*` (it draws in `currentColor`), size from `w-/h-`.
- `components/ui/GitHubIcon`.
- `components/ui/FileTypeIcon` — lucide glyph + Catppuccin colour for a file name/MIME type (`utils/fileKind.ts`).
- Icons: `lucide-react` first. A custom SVG becomes a component in `components/ui/` accepting `className` (see `AppLogo`, `GitHubIcon`). No inline `<svg>` blocks in views.

---

## 3. Button Labels

- **Inside forms, dialogs and modals, use short verbs:** *Save*, *Cancel*, *Accept*, *Decline*, *Retry*, *Copy*. The surrounding UI supplies the noun.
- **A page's primary call-to-action may carry a noun** when nothing else on screen names the action (e.g. *Select Files*, *Connect & Download*).
- Don't bulk-relabel existing buttons; e2e tests select several by text.

---

## 4. Theme & Styling Tokens

The app supports **light and dark** themes (`useDarkMode`, `dark:` variants). Every neutral colour needs its `dark:` counterpart.

| Purpose | Use | Notes |
| :--- | :--- | :--- |
| Brand accent | `brand-50` … `brand-950` | CSS variables: green for DropWave, orange on dropto.space (`src/index.css`, keyed on `data-brand`) |
| Dark surfaces | `supabase-bg`, `supabase-surface`, `supabase-card`, `supabase-border` | e.g. `dark:bg-supabase-surface` |
| Neutrals | Tailwind `zinc-*` | always paired with `dark:` |
| Danger / warning / success | Tailwind `red-*` / `amber-*` / `brand-*` | |
| Micro-labels | `text-2xs` | the only size below `text-xs` |
| File-type accents | `ctp-*` (Catppuccin: `red`, `mauve`, `blue`, …, `overlay1`) | Latte in light, Mocha under `.dark` (`src/index.css`); pick via `components/ui/FileTypeIcon`, not ad hoc |

- **No arbitrary colour values** (`bg-[#3ECF8E]`). Colours that must be JS values (confetti palette, theme-color) live in `src/branding.ts`; SVG fills use `style={{ stopColor: 'rgb(var(--brand-500))' }}`.
- **Never hardcode the brand.** The name, room-code prefix and brand colours come from `getActiveBrand()` / `brand-*`, because the same build is DropWave and dropto.space.
- **Nothing smaller than `text-xs`** except `text-2xs`. No `text-[Npx]`.
- **Text on accent backgrounds:** buttons on `bg-brand-500` use `text-supabase-bg` (dark text reads on both green and orange). Don't use `text-white` there.
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
- Behaviour changes are test-first. Unit tests go in `src/test/`. Protocol tests pair a real `TransferSender` and `TransferReceiver` via `MockDataConnection`. Hooks are tested through `renderHook` with fake services. UI that depends on a real browser (WebRTC, brand CSS) is covered by Playwright.

---

## 8. App Patterns

- **New protocol message:** add it to the `ControlMessage` union (`types/transfer.ts`), validate it in `parseControlMessage` (`services/transfer/protocol.ts`), and handle it in the `handleMessage` of the side that receives it (`TransferSender` or `TransferReceiver`; shared messages go in `TransferPeer`). Surface it to the UI only via `TransferEvents`/`ReceiverEvents`. Test it with a connected sender/receiver pair.
- **New setting:** add it to `AppSettings`, `DEFAULT_SETTINGS` (`hooks/useSettings.ts`) and `SettingsModal`. If a service consumes it, sync it in `useSettings`'s effect. The modal edits a local draft and saves on submit.
- **File pickers** (`showSaveFilePicker`, `showDirectoryPicker`) run only from a user click. Choose storage once, up front, and reuse it for every file.
- **New brand or brand-visible string:** update `src/branding.ts` and the boot script in `index.html` together, then regenerate the CSP hash in `vercel.json`. `branding.test.ts` and `csp.test.ts` fail until they agree.
