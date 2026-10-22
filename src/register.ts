import { installExtensionComposerShape } from "@oh-my-pi/pi-tui/overlays/composer-shape-registry";
import { folioShape } from "./shape.ts";

/**
 * Install the Folio Gutter style and its Appearance entry as soon as this module is
 * evaluated.
 *
 * `pi.registerComposerShape` only records the definition; the host installs it
 * in `initHooksAndCustomTools`, after the first interactive frame. Installing
 * here, during extension module evaluation, puts the real style in the process
 * registry before that frame. The host therefore has no shape to dispose in
 * `InteractiveMode.stop()`, which also keeps the final flush frame in Folio Gutter
 * instead of falling back to `box`.
 *
 * The symbol keeps this idempotent across module copies and reloads.
 */
const INSTALLED = Symbol.for("omp-folio.installed");

type InstallState = typeof globalThis & { [INSTALLED]?: true };

export function ensureFolioShape(): void {
	const state = globalThis as InstallState;
	if (state[INSTALLED]) return;
	installExtensionComposerShape({
		label: "Folio Gutter",
		description: "左侧输入，右侧额度轨，下方原生状态栏",
		style: folioShape,
	});
	state[INSTALLED] = true;
}

ensureFolioShape();
