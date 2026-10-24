import { expect, test } from "bun:test";
import { setSymbolPreset, setTheme, stripTerminalSequences, visibleWidth } from "@oh-my-pi/pi-tui";
import { QuotaPanel } from "./quota-panel";

test("fraction entries render a colored percentage", async () => {
	await setTheme("titanium");
	const panel = new QuotaPanel();
	panel.update({
		key: "k",
		state: "ready",
		entries: [{ label: "7d", remaining: 0.84 }],
		fetchedAt: Date.now(),
	});
	const text = stripTerminalSequences(panel.render(28).join("\n"));
	expect(text).toContain("7d 84%");
	expect(text).not.toContain("█");
	expect(panel.render(28)[0]).toStartWith(" ");
});

test("balance entries render currency without a fake percentage", async () => {
	await setTheme("titanium");
	const panel = new QuotaPanel();
	panel.update({
		key: "k",
		state: "ready",
		entries: [{ label: "CNY", balance: { value: 110, currency: "CNY" } }],
		fetchedAt: Date.now(),
	});
	const text = stripTerminalSequences(panel.render(28).join("\n"));
	expect(text).toContain("¥110.00");
	expect(text).not.toContain("CNY");
	expect(text).not.toContain("%");
});

test("emoji cost icons fall back to a tintable dollar sign", async () => {
	await setTheme("titanium");
	await setSymbolPreset("unicode");
	try {
		const panel = new QuotaPanel(text => `\x1b[38;5;45m${text}\x1b[39m`);
		panel.update({
			key: "k",
			state: "ready",
			entries: [{ label: "CNY", balance: { value: 110, currency: "CNY" } }],
			fetchedAt: Date.now(),
		});
		const line = panel.render(28)[0];
		expect(stripTerminalSequences(line)).toContain("$");
		expect(line).toContain("\x1b[38;5;45m$");
		expect(line).not.toContain("💲");
	} finally {
		await setSymbolPreset("unicode");
	}
});

test("Gauge converts remaining shares into ten-cell meters including both boundaries", async () => {
	await setTheme("titanium");
	const panel = new QuotaPanel(text => text, "gauge");
	panel.update({
		key: "k",
		state: "ready",
		entries: [{ label: "7d", remaining: 0.57 }, { label: "5h", remaining: 1 }, { label: "1h", remaining: 0 }],
		fetchedAt: Date.now(),
	});
	const lines = panel.render(32).map(line => stripTerminalSequences(line));
	expect(lines[0]).toMatch(/7d\s+57% █{6}░{4}/);
	expect(lines[1]).toMatch(/5h\s+100% █{10}/);
	expect(lines[2]).toMatch(/1h\s+0% ░{10}/);
});

for (const mode of ["gauge", "capline"] as const) {
	test(`${mode} keeps balances absolute without a percentage or meter`, async () => {
		await setTheme("titanium");
		const panel = new QuotaPanel(text => text, mode);
		panel.update({
			key: "k",
			state: "ready",
			entries: [{ label: "CNY", balance: { value: 110, currency: "CNY" } }],
			fetchedAt: Date.now(),
		});
		const text = stripTerminalSequences(panel.render(32).join("\n"));
		expect(text).toContain("¥110.00");
		expect(text).not.toContain("%");
		expect(text).not.toContain("█");
	});
}

test("Capline keeps a fitting quota set on one line", async () => {
	await setTheme("titanium");
	const panel = new QuotaPanel(text => text, "capline");
	panel.update({
		key: "k",
		state: "ready",
		entries: [{ label: "7d", remaining: 0.57 }, { label: "5h", remaining: 1 }],
		fetchedAt: Date.now(),
	});
	const lines = panel.render(80);
	expect(lines).toHaveLength(1);
	expect(stripTerminalSequences(lines[0]!)).toContain("7d 57% · 5h 100%");
});

test("Capline wraps complete entries without losing values or exceeding width", async () => {
	await setTheme("titanium");
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
	const text = stripTerminalSequences(lines.join("\n"));
	expect(lines.length).toBeGreaterThan(1);
	for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(28);
	for (const expected of ["prompt 50%", "flow 40%", "flex 30%", "7d 20%"]) {
		expect(text).toContain(expected);
	}
});

test("Gauge unknown and error states never render meter cells", async () => {
	await setTheme("titanium");
	for (const [state, expected] of [["unknown", "未知"], ["error", "获取失败"]] as const) {
		const panel = new QuotaPanel(text => text, "gauge");
		panel.update({ key: "k", state, entries: [], message: expected, fetchedAt: Date.now() });
		const text = stripTerminalSequences(panel.render(32).join("\n"));
		expect(text).toContain(expected);
		expect(text).not.toContain("█");
		expect(text).not.toContain("░");
	}
});

for (const mode of ["gauge", "capline"] as const) {
	test(`${mode} wraps oversized entries without losing content`, async () => {
		await setTheme("titanium");
		const panel = new QuotaPanel(text => text, mode);
		panel.update({
			key: "k",
			state: "ready",
			entries: [{ label: "very-long-quota-label", remaining: 0.37 }],
			fetchedAt: Date.now(),
		});
		const lines = panel.render(16);
		const text = stripTerminalSequences(lines.join(""));
		expect(lines.length).toBeGreaterThan(1);
		for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(16);
		expect(text.replaceAll(" ", "")).toContain("very-long-quota-label37%");
	});
}

test("Gauge uses the session accent for subscription icons and normal meters", async () => {
	await setTheme("titanium");
	await setSymbolPreset("unicode");
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
