import { expect, test } from "bun:test";
import { visibleWidth } from "@oh-my-pi/pi-tui/text/width";
import type { QuotaSnapshot } from "./types";
import { currentTheme } from "@oh-my-pi/pi-tui/theme/runtime";
import { folioShape, GAUGE_SHAPE_ID } from "./shape";
import { QuotaPanel } from "./quota-panel";

test("fraction entries render a colored percentage", () => {
	const panel = new QuotaPanel();
	panel.update({
		key: "k",
		state: "ready",
		entries: [{ label: "7d", remaining: 0.84 }],
		fetchedAt: Date.now(),
	});
	const text = Bun.stripANSI(panel.render(28).join("\n"));
	expect(text).toContain("7d 84%");
	expect(text).not.toContain("█");
	expect(panel.render(28)[0]).toStartWith(" ");
});

test("balance entries render currency without a fake percentage", () => {
	const panel = new QuotaPanel();
	panel.update({
		key: "k",
		state: "ready",
		entries: [{ label: "CNY", balance: { value: 110, currency: "CNY" } }],
		fetchedAt: Date.now(),
	});
	const text = Bun.stripANSI(panel.render(28).join("\n"));
	expect(text).toContain("¥110.00");
	expect(text).not.toContain("CNY");
	expect(text).not.toContain("%");
});

test("emoji cost icons fall back to a tintable dollar sign", () => {
	const panel = new QuotaPanel(text => `\x1b[38;5;45m${text}\x1b[39m`);
	panel.update({
		key: "k",
		state: "ready",
		entries: [{ label: "CNY", balance: { value: 110, currency: "CNY" } }],
		fetchedAt: Date.now(),
	});
	const line = panel.render(28)[0];
	expect(Bun.stripANSI(line)).toContain("$");
	expect(line).toContain("\x1b[38;5;45m$");
	expect(line).not.toContain("💲");
});

test("Gauge converts remaining shares into ten-cell meters including both boundaries", () => {
	const panel = new QuotaPanel(text => text, "gauge");
	panel.update({
		key: "k",
		state: "ready",
		entries: [{ label: "7d", remaining: 0.57 }, { label: "5h", remaining: 1 }, { label: "1h", remaining: 0 }],
		fetchedAt: Date.now(),
	});
	const lines = panel.render(32).map(line => Bun.stripANSI(line));
	expect(lines[0]).toMatch(/7d\s+57% █{6}░{4}/);
	expect(lines[1]).toMatch(/5h\s+100% █{10}/);
	expect(lines[2]).toMatch(/1h\s+0% ░{10}/);
});

for (const mode of ["gauge", "capline"] as const) {
	test(`${mode} keeps balances absolute without a percentage or meter`, () => {
		const panel = new QuotaPanel(text => text, mode);
		panel.update({
			key: "k",
			state: "ready",
			entries: [{ label: "CNY", balance: { value: 110, currency: "CNY" } }],
			fetchedAt: Date.now(),
		});
		const text = Bun.stripANSI(panel.render(32).join("\n"));
		expect(text).toContain("¥110.00");
		expect(text).not.toContain("%");
		expect(text).not.toContain("█");
	});
}

test("Capline keeps a fitting quota set on one line", () => {
	const panel = new QuotaPanel(text => text, "capline");
	panel.update({
		key: "k",
		state: "ready",
		entries: [{ label: "7d", remaining: 0.57 }, { label: "5h", remaining: 1 }],
		fetchedAt: Date.now(),
	});
	const lines = panel.render(80);
	expect(lines).toHaveLength(1);
	expect(Bun.stripANSI(lines[0]!)).toContain("7d 57% · 5h 100%");
});

test("Capline wraps complete entries without losing values or exceeding width", () => {
	const panel = new QuotaPanel(text => text, "capline");
	panel.update({
		key: "k",
		state: "ready",
		entries: [
			{ label: "prompt", remaining: 0.5 },
			{ label: "flow", remaining: 0.4 },
			{ label: "flex", remaining: 0.3 },
			{ label: "7d", remaining: 0.2 },
		],
		fetchedAt: Date.now(),
	});
	const lines = panel.render(28);
	const text = Bun.stripANSI(lines.join("\n"));
	expect(lines.length).toBeGreaterThan(1);
	for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(28);
	for (const expected of ["prompt 50%", "flow 40%", "flex 30%", "7d 20%"]) {
		expect(text).toContain(expected);
	}
});

test("Gauge unknown and error states never render meter cells", () => {
	for (const [state, expected] of [["unknown", "未知"], ["error", "获取失败"]] as const) {
		const panel = new QuotaPanel(text => text, "gauge");
		panel.update({ key: "k", state, entries: [], message: expected, fetchedAt: Date.now() });
		const text = Bun.stripANSI(panel.render(32).join("\n"));
		expect(text).toContain(expected);
		expect(text).not.toContain("█");
		expect(text).not.toContain("░");
	}
});

for (const mode of ["gauge", "capline"] as const) {
	test(`${mode} wraps oversized entries without losing content`, () => {
		const panel = new QuotaPanel(text => text, mode);
		panel.update({
			key: "k",
			state: "ready",
			entries: [{ label: "very-long-quota-label", remaining: 0.37 }],
			fetchedAt: Date.now(),
		});
		const lines = panel.render(16);
		const text = Bun.stripANSI(lines.join(""));
		expect(lines.length).toBeGreaterThan(1);
		for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(16);
		expect(text.replaceAll(" ", "")).toContain("very-long-quota-label37%");
	});
}

test("Gauge uses the session accent for subscription icons and normal meters", () => {
	const accent = (text: string) => `\x1b[38;5;45m${text}\x1b[39m`;
	const panel = new QuotaPanel(accent, "gauge");
	panel.update({
		key: "k",
		state: "ready",
		entries: [{ label: "7d", remaining: 0.8 }],
		fetchedAt: Date.now(),
	});
	const line = panel.render(32)[0]!;
	expect(line).toContain(accent("⏱"));
	expect(line).toContain(accent("█".repeat(8)));
});

test("mixed-width remaining values preserve both quota columns", () => {
	const panel = new QuotaPanel();
	panel.update({ key: "go", state: "ready", entries: [
		{ label: "5h", remaining: 1 }, { label: "7d", remaining: 1 }, { label: "1mo", remaining: 0.69 },
	] });
	const rows = panel.render(24).map(row => Bun.stripANSI(row));
	const labels = rows.map(row => visibleWidth(row.slice(0, row.search(/5h|7d|1mo/))));
	expect(new Set(labels).size).toBe(1);
	for (const row of rows) expect(visibleWidth(row.slice(0, row.indexOf("%")))).toBe(23);
});

test("the composer keeps an unknown Gauge row aligned with metered rows", () => {
	const snapshot: QuotaSnapshot = { key: "gauge", state: "ready", entries: [
		{ label: "5h", remaining: 1 }, { label: "7d" }, { label: "1mo", remaining: 0.69 },
	] };
	const plain = (s: string) => s;
	const shape = folioShape(GAUGE_SHAPE_ID, "Gauge", {
		quota: () => snapshot, accent: plain, sessionAccent: () => false, imeSafe: () => false,
	});
	const theme = currentTheme();
	for (const width of [70, 88, 120]) {
		const rows = shape.row({ width, paddingX: 1, theme, box: theme.symbols.box,
			border: plain, accent: plain, surface: plain, text: "draft", pad: "", gutter: "",
			first: true, last: true, overflow: 0 }).map(row => Bun.stripANSI(row));
		const entries = rows.filter(row => /5h|7d|1mo/.test(row));
		expect(entries).toHaveLength(3);
		expect(new Set(entries.map(row => visibleWidth(row.slice(0, row.search(/5h|7d|1mo/))))).size).toBe(1);
		for (const row of rows) expect(visibleWidth(row)).toBe(width);
	}
});
