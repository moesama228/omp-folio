import { fgOrPlain, padding, truncateToWidth, visibleWidth } from "@oh-my-pi/pi-tui";
import { sanitizeDisplaySingleLine } from "@oh-my-pi/pi-tui/overlays/extensions/display-text";
import type { StatusLineComponent } from "@oh-my-pi/pi-tui/status-line/component";
import { isFolioShape } from "./shape.ts";

interface ProviderStatusOptions {
	shape(): string | undefined;
	provider(): string | undefined;
	accentColor(text: string): string;
}

type BottomBar = Pick<StatusLineComponent, "renderBottomBar">;
const DECORATION = Symbol.for("omp-folio.provider-status");
type DecoratedBar = BottomBar & { [DECORATION]?: { options: ProviderStatusOptions } };

/** Decorate the real status instance; the host still selects, fetches and renders every native segment. */
export function attachFolioProviderStatus(source: unknown, options: ProviderStatusOptions): void {
	if (!source || typeof source !== "object" || !("renderBottomBar" in source)
		|| typeof source.renderBottomBar !== "function") return;
	const bar = source as DecoratedBar;
	const previous = bar[DECORATION];
	if (previous) {
		previous.options = options;
		return;
	}
	const state = { options };
	bar[DECORATION] = state;
	const renderNative = bar.renderBottomBar.bind(bar);
	bar.renderBottomBar = (width, groups, previewTitle) => {
		const current = state.options;
		const provider = sanitizeDisplaySingleLine(current.provider() ?? "").trim();
		if (!isFolioShape(current.shape()) || groups !== "full" || !provider || width < 24) {
			return renderNative(width, groups, previewTitle);
		}
		// Keep the identity secondary and bounded; native segment priorities handle
		// the remaining width, including path shortening and low-priority elision.
		const budget = Math.min(28, Math.floor(width / 3));
		const label = current.accentColor("◇") + " " + fgOrPlain("muted", truncateToWidth(provider, budget - 2));
		const labelWidth = visibleWidth(label);
		const native = renderNative(width - labelWidth - 3, groups, previewTitle);
		return native + padding(Math.max(2, width - visibleWidth(native) - labelWidth - 1)) + label + " ";
	};
}
