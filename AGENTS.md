# AGENTS.md

Guidance for changes in **omp Folio**, an omp `Composer Shape` plugin. Target is omp **19.2.1**; the host binary is not modified.

## Non-negotiables

- Use omp's public host APIs and existing `pi-tui` components. Do not fork or patch omp.
- Never reimplement editing, keybindings, history, completion, paste, IME, scrolling, Git status, or usage fetching.
- `src/editor.ts` uses quota renderers and a Capline widget around the built-in composer. The native status bar remains the single source for model, mode, path, Git, PR, context, cost, and session name.
- Do not pin `composer.shape` in a project `.omp/config.yml`; the project layer overrides the Appearance menu. Use the global setting.
- Keep README text-and-icon only. No screenshots, banners, or generated assets.
- Treat `.omp/` as local project state; it is gitignored. The tracked plugin entry is `package.json`'s `omp.extensions`.
- Releases use `npm version patch` plus a pushed `v*` tag; `.github/workflows/publish.yml` publishes through npm Trusted Publishing. Change versions only through `npm version`.
- Runtime host packages are `peerDependencies`; keep matching exact versions in `devDependencies` for local checks.

## Shape lifecycle

- Register each shape with `pi.registerComposerShape` during extension initialization. The host owns registration and disposal.
- `SHAPE_ID = "omp-composer-folio-gutter"`; additional stable ids are `GAUGE_SHAPE_ID = "omp-composer-folio-gauge"` and `CAPLINE_SHAPE_ID = "omp-composer-folio-capline"`. The only legacy id is `omp-composer-dock`, used for one-time migration in `index.ts`. Keep existing ids stable; future styles use new ids.
- Host prepaint still paints an unknown shape as `box` before extensions load. That frame cannot be removed plugin-side; do not work around it by modifying omp.

## Layout

- Use the 19.2.1 ComposerShape row and surface hooks with a full native bottom bar. Keep the host-calculated cursor coordinates.
- Gutter/Gauge use the last input row's trailing space at 88 columns and above. Stack when fewer than 22–26 cells plus the gap remain, on narrow screens, or in IME-safe mode.
- Capline uses an above-editor widget with a blank rail, complete-entry wrapping and two columns of right padding.
- Decorate the native terminal status panel and reserve the far right of its bar for the provider. Preserve other hook rows and the native segment painter and hit targets. Keep the badge within one third of the width (at most 28 columns) and omit it below 24 columns.
- The quota rail and capline are quota-only. Do not add model, context, cost, or project segments there; the native status bar owns them.
- No vertical divider. Quota content is right-aligned; icon color uses the same session accent as the left rail.
- `QuotaPanel` rules:
  - `⏱` for subscription windows, `$` for absolute balances (Nerd preset keeps its `\uf155` glyph).
  - Values are bold; labels use the longest label width in the current snapshot, never a fixed column.
  - Percentage is **remaining**, not used: `100%` = full, `0%` = empty. `<=25%` warning, `<=10%` error.
  - Gauge draws at most 10 cells only for known percentages; normal meters use accent, low meters use warning/error. Balances and unknown states have no meter.
  - Unknown, stale, ambiguous, or failed states use a short icon + word; never invent a percentage.
- For named sessions with session accents enabled, use the host border painter for input rails. Otherwise use the theme accent. Capline widget rails and icons use the theme accent.

## Quota data

- Read `ctx.modelRegistry.authStorage.usage.reports()`; reuse host OAuth/account and usage caches.
- Provider selectors already handled: `anthropic`, `openai-codex`, `kimi-code`, `cursor`, `xai-oauth` (alias `xai`), `google-antigravity`, `devin`; generic providers use exact/shared scope.
- Cursor selects the auto/API pool from the current model. Antigravity selects the model's counter. Kimi uses 5h/7d. SuperGrok uses weekly/monthly subscription windows, not the on-demand cap. Devin keeps credits and daily/weekly quota.
- Account matching:
  - Prefer the session-pinned OAuth account.
  - Before a session pin, accept the sole stored account for that provider.
  - Multiple unpinned accounts remain `unknown`; never sum accounts.
  - Cursor/Devin API-key reports are accepted only when all reports share one identity.
- DeepSeek has no `UsageReport`: call `GET /user/balance`, display absolute currency (`¥42.00`), cache success for 5 minutes and failure for 30 seconds. Never log the key, response body, or identity.
- Refresh promptly on model changes using provider-scoped reports, on `session_start`, `agent_start`, `agent_end`, `turn_end`, and a 30-second managed timer. Drop stale async results when provider/model/session/account changes.
- Mark data stale after 10 minutes; never refresh from inside `render`.

## Repository rules

- `index.ts`: wiring, lifecycle, migration, async quota refresh.
- `src/register.ts`: extension-owned shape registration.
- `src/shape.ts`: ComposerShape definitions.
- `src/editor.ts`: quota rows and Capline widget.
- `src/quota-panel.ts`: shared visual quota layouts.
- `src/quota.ts`: usage-provider adaptation and DeepSeek balance.
- `src/types.ts`: shared quota types.
- Keep new dependencies out unless they remove real code. Use TypeScript strict and existing component primitives.
- Update README when user-facing behavior, installation, provider support, or compatibility changes. Keep it short.
- Preserve the `omp-folio` package name and current shape id unless a migration is included.

## Releasing

Versioning is manual; commit messages are not parsed. `npm version` is the only version source and creates both the version commit and the annotated `v*` tag.

First `0.1.0` is published manually. Before the first CI release, configure npm Trusted Publishing for `moesama228/omp-folio`, workflow `publish.yml`, with direct `npm publish` allowed. Do not add release-please or changesets.

Daily release:

```sh
npm version patch
git push --follow-tags
```

- Use `npm version minor` or `npm version major` when the change requires it; default to `patch`.
- Run `npm version` from a clean `main`; do not manually edit `package.json` version.
- Never create or move tags manually. The pushed tag must match `v<package.json version>`.
- `.github/workflows/publish.yml` triggers only on `v*`, runs typecheck/tests, then publishes through npm Trusted Publishing.

## Validation

Run from the repository:

```sh
./node_modules/.bin/tsc --noEmit
BUN_BE_BUN=1 omp test ./src/quota.test.ts ./src/quota-panel.test.ts ./src/register.test.ts ./src/provider-status.test.ts
```

Before yielding, also exercise the changed runtime path in a real omp PTY. For visual or lifecycle changes check wide (>=88), narrow (70), IME-safe, shape switching, and the final frame after quit. For quota changes use `--model provider/model` and confirm the expected window/balance.

Add tests only for real behavioral seams: provider scoping, account ambiguity, remaining/balance conversion, output redaction, or shape lifecycle. Do not test static labels, defaults, or source text.

## Known limits

- Prepaint `box` flash remains (host order).
- TSP/Tern native composer draws its own chrome; character shapes do not apply.
- Multi-account providers without a session pin show `unknown` by design.
- A provider without a host usage endpoint needs a `UsageProvider` registered via `pi.registerProvider(provider, { usage })`, or a documented balance branch like DeepSeek. There is no quota-specific config file.
