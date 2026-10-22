# AGENTS.md

Guidance for changes in **omp Folio**, an omp `Composer Shape` plugin. Target is omp **18.12.6**; the host binary is not modified.

## Non-negotiables

- Use omp's public host APIs and existing `pi-tui` components. Do not fork or patch omp.
- Never reimplement editing, keybindings, history, completion, paste, IME, scrolling, Git status, or usage fetching.
- `src/editor.ts` only decorates the real `CustomEditor`. The native status bar remains the single source for model, mode, path, Git, PR, context, cost, and session name.
- Do not pin `composer.shape` in a project `.omp/config.yml`; the project layer overrides the Appearance menu. Use the global setting.
- Keep README text-and-icon only. No screenshots, banners, or generated assets.
- Treat `.omp/` as local project state; it is gitignored. The tracked plugin entry is `package.json`'s `omp.extensions`.
- Releases use `npm version patch` plus a pushed `v*` tag; `.github/workflows/publish.yml` publishes through npm Trusted Publishing. Change versions only through `npm version`.
- Runtime host packages are `peerDependencies`; keep matching exact versions in `devDependencies` for local checks.

## Shape lifecycle

- `src/register.ts` installs `installExtensionComposerShape` at module evaluation, bypassing `pi.registerComposerShape`.
  - This makes the first interactive frame Folio Gutter.
  - The host's stop-time disposer only removes its own registration, so the final history flush still renders Folio Gutter.
  - A no-op file-write fallback keeps the extension on the eager startup path. It always returns `false`; do not replace it with real write behavior.
- `SHAPE_ID = "omp-composer-folio-gutter"`. The only legacy id is `omp-composer-dock`, used for one-time migration in `index.ts`. Keep the new id stable; future styles use new ids.
- Host prepaint still paints an unknown shape as `box` before extensions load. That frame cannot be removed plugin-side; do not work around it by modifying omp.
- Registering the same style through both `installExtensionComposerShape` and `pi.registerComposerShape` throws on duplicate installation. Keep the direct-install path.

## Layout

- `src/shape.ts`: host `rail` surface, `bottomBar: "full"`, `statusAttachment: "none"`, `verticalChrome: 2`, one blank rail above and below the input.
- `src/editor.ts`: split at `>= 88` columns. Quota rail is 22–26 columns; below 88 or with `tui.imeSafeCursor`, stack it under the input.
- The quota rail is quota-only. Do not add model, context, cost, or project segments there; the native status bar owns them.
- No vertical divider. Quota content is right-aligned in the rail; icon color uses the same session accent as the left rail.
- `QuotaPanel` rules:
  - `⏱` for subscription windows, `💲` for absolute balances.
  - Values are bold; labels use the longest label width in the current snapshot, never a fixed column.
  - Percentage is **remaining**, not used: `100%` = full, `0%` = empty. `<=25%` warning, `<=10%` error.
  - Unknown, stale, ambiguous, or failed states use a short icon + word; never invent a percentage.
- The left rail follows `statusLine.sessionAccent` via `getSessionAccentHex`; when disabled or unnamed, fall back to theme `accent`. Wrap `CustomEditor.setTheme` so host shape/settings sync cannot overwrite it.

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
- Refresh on `session_start`, `agent_start`, `agent_end`, `turn_end`, and a 30-second managed timer. Drop stale async results when provider/model/session/account changes.
- Mark data stale after 10 minutes; never refresh from inside `render`.

## Repository rules

- `index.ts`: wiring, lifecycle, migration, async quota refresh.
- `src/register.ts`: idempotent shape registration.
- `src/shape.ts`: ComposerStyle.
- `src/editor.ts`: editor/rail decoration.
- `src/quota-panel.ts`: visual quota rail.
- `src/quota.ts`: usage-provider adaptation and DeepSeek balance.
- `src/types.ts`: shared quota types.
- Keep new dependencies out unless they remove real code. Use TypeScript strict and existing component primitives.
- Update README when user-facing behavior, installation, provider support, or compatibility changes. Keep it short.
- Preserve the `omp-folio` package name and current shape id unless a migration is included.

## Validation

Run from the repository:

```sh
./node_modules/.bin/tsc --noEmit
BUN_BE_BUN=1 omp test ./src/quota.test.ts ./src/quota-panel.test.ts ./src/register.test.ts
```

Before yielding, also exercise the changed runtime path in a real omp PTY. For visual or lifecycle changes check wide (>=88), narrow (70), IME-safe, shape switching, and the final frame after quit. For quota changes use `--model provider/model` and confirm the expected window/balance.

Add tests only for real behavioral seams: provider scoping, account ambiguity, remaining/balance conversion, output redaction, or shape lifecycle. Do not test static labels, defaults, or source text.

## Known limits

- Prepaint `box` flash remains (host order).
- TSP/Tern native composer draws its own chrome; character shapes do not apply.
- Multi-account providers without a session pin show `unknown` by design.
- A provider without a host usage endpoint needs a `UsageProvider` registered via `pi.registerProvider(provider, { usage })`, or a documented balance branch like DeepSeek. There is no quota-specific config file.
