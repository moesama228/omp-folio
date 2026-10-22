import { expect, test } from "bun:test";
import { setSymbolPreset, setTheme, stripTerminalSequences } from "@oh-my-pi/pi-tui";
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
	expect(text).toContain("7d");
	expect(text).toContain("7d 84%");
	expect(text).toContain("84%");
	expect(text).not.toContain("█");
	expect(text).not.toContain("订阅剩余");
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
	expect(text).not.toContain("余额");
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
