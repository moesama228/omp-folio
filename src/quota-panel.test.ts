import { expect, test } from "bun:test";
import { setTheme, stripTerminalSequences } from "@oh-my-pi/pi-tui";
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
