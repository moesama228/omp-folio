import { installExtensionComposerShape } from "@oh-my-pi/pi-tui/overlays/composer-shape-registry";
import { caplineShape, folioShape, gaugeShape } from "./shape.ts";

/**
 * Install the Folio styles and their Appearance entries as soon as this module is
 * evaluated.
 *
 * `pi.registerComposerShape` only records the definition; the host installs it
 * in `initHooksAndCustomTools`, after the first interactive frame. Installing
 * here, during extension module evaluation, puts the real style in the process
 * registry before that frame. The host therefore has no shape to dispose in
 * `InteractiveMode.stop()`, which also keeps the final flush frame in the selected
 * Folio style instead of falling back to `box`.
 *
 * The symbol keeps this idempotent across module copies and reloads.
 */
const INSTALLED = Symbol.for("omp-folio.installed");

type InstallState = typeof globalThis & { [INSTALLED]?: true };
const DEFINITIONS = [
	{ label: "Folio Gutter", description: "左侧输入，右侧额度轨，下方原生状态栏", style: folioShape },
	{ label: "Folio Gauge", description: "左侧输入，右侧余量刻度，下方原生状态栏", style: gaugeShape },
	{ label: "Folio Capline", description: "顶部额度账签，全宽输入，下方原生状态栏", style: caplineShape },
];

export function ensureFolioShape(): void {
	const state = globalThis as InstallState;
	if (state[INSTALLED]) return;
	for (const definition of DEFINITIONS) installExtensionComposerShape(definition);
	state[INSTALLED] = true;
}

ensureFolioShape();
