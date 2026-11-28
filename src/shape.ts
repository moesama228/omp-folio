import type { ComposerShape } from "@oh-my-pi/pi-coding-agent/ui/styles/composer/shapes";
import { visibleWidth } from "@oh-my-pi/pi-tui/text/width";
import { quotaRows, type FolioView } from "./editor.ts";

export const SHAPE_ID = "omp-composer-folio-gutter";
export const GAUGE_SHAPE_ID = "omp-composer-folio-gauge";
export const CAPLINE_SHAPE_ID = "omp-composer-folio-capline";

export function isFolioShape(id: unknown): boolean {
	return id === SHAPE_ID || id === GAUGE_SHAPE_ID || id === CAPLINE_SHAPE_ID;
}

export function folioShape(id: string, label: string, view: FolioView): ComposerShape & { label: string } {
	const capline = id === CAPLINE_SHAPE_ID;
	let accent = view.accent;
	const quota = quotaRows({ ...view, accent: text => accent(text) }, id === GAUGE_SHAPE_ID ? "gauge" : "list");
	const blank: NonNullable<ComposerShape["bottom"]> = cx =>
		(view.sessionAccent() ? cx.border : cx.accent)("▎") + cx.surface(" ".repeat(Math.max(0, cx.width - 1)));
	return {
		id, label, bottomBar: "full", filled: true, sideBorders: true,
		paddingX: 1, sideWidth: padding => padding + 1,
		top: capline ? undefined : blank,
		bottom: blank,
		row(cx) {
			accent = view.sessionAccent() ? cx.border : cx.accent;
			const rail = accent("▎");
			const draft = " ".repeat(cx.paddingX) + cx.gutter + cx.text;
			const space = Math.max(0, cx.width - 1 - visibleWidth(draft));
			const input = rail + cx.surface(draft + " ".repeat(space));
			if (capline || !cx.last) return [input];
			// The host computes wrapping and the cursor before invoking this row.
			// Only occupy spare trailing cells; a full draft gets its own entire row.
			const side = Math.min(26, Math.max(22, Math.floor(cx.width / 5)));
			const split = cx.width >= 88 && !view.imeSafe() && space >= side + 4;
			const quotaWidth = Math.max(1, split ? side : cx.width - 4);
			const lines = quota(quotaWidth);
			const output = [input];
			for (const [index, line] of lines.entries()) {
				const content = (split && index === 0) ? draft : "";
				// Position the whole panel once. Short rows keep their column within it.
				const gap = Math.max(0, cx.width - visibleWidth(content) - quotaWidth - 3);
				const trailing = 2 + Math.max(0, quotaWidth - visibleWidth(line));
				const row = rail + cx.surface(content + " ".repeat(gap) + line + " ".repeat(trailing));
				if (split && index === 0) output[0] = row;
				else output.push(row);
			}
			return output;
		},
	};
}
