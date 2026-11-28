import { expect, test } from "bun:test";
import { visibleWidth } from "@oh-my-pi/pi-tui/text/width";
import "@oh-my-pi/pi-coding-agent/ui/styles/status/status-line";
import { UiNode } from "@oh-my-pi/pi-tui";
import { paintNode, painterFor, staticEnvironment } from "@oh-my-pi/pi-tui/term/paint";
import { currentTheme } from "@oh-my-pi/pi-tui/theme/runtime";
import { attachProviderStatus, providerStatus } from "./provider-status";

test("provider status sanitizes controls and fits its share of the native footer", () => {
	for (const width of [24, 70, 120]) {
		const badge = providerStatus("\x1b]0;spoofed-title\x07自定义-provider-with-a-long-name\nnext", width)!;
		expect(badge).not.toContain("spoofed-title");
		expect(badge).not.toMatch(/[\r\n\x07]/);
		expect(visibleWidth(badge)).toBeLessThanOrEqual(Math.min(28, width / 3));
	}
	expect(providerStatus("deepseek", 23)).toBeUndefined();
	expect(providerStatus(undefined, 120)).toBeUndefined();
});

test("provider uses the native bar's last cells and leaves other hook rows intact", () => {
	const seg = new UiNode("seg", { role: "omp.status.model", side: "left", term: { pieces: [{ t: "Model" }] } });
	const bar = new UiNode("status", { role: "omp.status", children: seg }, "bar");
	const hook = new UiNode("text", { role: "omp.status.hook", text: "other extension" });
	const panel = new UiNode("col", {
		role: "omp.status.panel", term: { placement: { bar: "full" } }, children: [bar, hook],
	});
	const startupPanel = new UiNode("col", {
		role: "omp.status.panel", term: { placement: { bar: "none" } }, children: [bar, hook],
	});
	const original = painterFor(panel);
	const detach = attachProviderStatus(() => "opencode-go");
	try {
		const { rows } = paintNode(staticEnvironment(currentTheme()), panel, 70);
		const [status, other] = rows.map(row => Bun.stripANSI(row));
		expect(rows).toHaveLength(2);
		expect(status).toContain("Model");
		expect(status).toEndWith("◇ opencode-go  ");
		expect(visibleWidth(status)).toBe(70);
		expect(other).toBe("other extension");
		const narrow = paintNode(staticEnvironment(currentTheme()), startupPanel, 23);
		expect(narrow.rows.map(row => Bun.stripANSI(row).trim())).toEqual(["Model", "other extension"]);
	} finally {
		detach();
		expect(painterFor(panel)).toBe(original);
		for (const node of [startupPanel, panel, hook, bar, seg]) node.dispose();
	}
});
