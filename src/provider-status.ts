import { sanitizeDisplaySingleLine } from "@oh-my-pi/pi-coding-agent/extensibility/inventory/display-text";
import type { StatusPanelLook } from "@oh-my-pi/pi-coding-agent/ui/status/status-line";
import { stack } from "@oh-my-pi/pi-tui/term/painters/layout";
import { UiNode } from "@oh-my-pi/pi-tui";
import { defineRolePainter, painterFor, type Painter } from "@oh-my-pi/pi-tui/term/paint";
import { truncate, visibleWidth } from "@oh-my-pi/pi-tui/text/width";

export function providerStatus(provider: string | undefined, width: number): string | undefined {
	const name = sanitizeDisplaySingleLine(provider ?? "").trim();
	if (!name || width < 24) return undefined;
	return "◇ " + truncate(name, Math.min(28, Math.floor(width / 3)) - 2);
}

/** Reserve space only on the native panel's bar. Its painter still lays out every segment and click target. */
export function attachProviderStatus(provider: () => string | undefined): () => void {
	const probe = new UiNode("col", { role: "omp.status.panel" });
	const native = painterFor(probe);
	if (!native) {
		probe.dispose();
		return () => {};
	}
	const paint: Painter = (node, cx) => {
		const activeProvider = provider();
		if (!activeProvider) return native(node, cx);
		const placement = (node.props() as { term?: StatusPanelLook }).term?.placement;
		const bar = node.children().find(child => child.kind === "status" && child.key() === "bar");
		if (!bar || placement?.autocomplete) return native(node, cx);
		const badge = providerStatus(activeProvider, cx.width);
		const paintBar = () => {
			if (!badge) return cx.paint(bar, cx.width);
			const badgeWidth = visibleWidth(badge);
			const block = cx.paint(bar, cx.width - badgeWidth - 4);
			const row = block.rows[0] ?? "";
			const gap = Math.max(2, cx.width - visibleWidth(row) - badgeWidth - 2);
			return { ...block, rows: [row + " ".repeat(gap) + cx.theme.fg("muted", badge) + "  "] };
		};
		// On startup placement can still reflect prepaint's box until autocomplete
		// first opens. All Folio shapes request the native full bar.
		if (placement?.bar === "none") return stack([paintBar(), native(node, cx)], 0);
		return native(node, { ...cx, paint: (child, width, height) =>
			child === bar ? paintBar() : cx.paint(child, width, height) });
	};
	defineRolePainter("col", "omp.status.panel", paint);
	return () => {
		if (painterFor(probe) === paint) defineRolePainter("col", "omp.status.panel", native);
		probe.dispose();
	};
}
