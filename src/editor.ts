import { currentTheme } from "@oh-my-pi/pi-tui/theme/runtime";
import { visibleWidth } from "@oh-my-pi/pi-tui/text/width";
import { QuotaPanel } from "./quota-panel.ts";
import type { QuotaSnapshot } from "./types.ts";

export interface FolioView {
	quota(): QuotaSnapshot;
	accent(text: string): string;
	sessionAccent(): boolean;
	imeSafe(): boolean;
}

export function quotaRows(view: FolioView, mode: "list" | "gauge" | "capline") {
	const panel = new QuotaPanel(view.accent, mode);
	return (width: number) => {
		panel.update(view.quota());
		return panel.render(Math.max(1, width));
	};
}

export function caplineWidget(view: FolioView) {
	const rows = quotaRows(view, "capline");
	return { render(width: number) {
		const theme = currentTheme();
		return ["", ...rows(width - 4)].map(line => view.accent("▎") +
			theme.bg("userMessageBg", " " + line + " ".repeat(Math.max(0, width - 2 - visibleWidth(line)))));
	} };
}
