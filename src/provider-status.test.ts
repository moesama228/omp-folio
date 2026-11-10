import { expect, test } from "bun:test";
import { truncateToWidth, visibleWidth } from "@oh-my-pi/pi-tui";
import { attachFolioProviderStatus } from "./provider-status";
import { CAPLINE_SHAPE_ID, GAUGE_SHAPE_ID, SHAPE_ID } from "./shape";

function fixture() {
	let shape = SHAPE_ID;
	let provider: string | undefined = "opencode-go";
	const widths: number[] = [];
	const bar = {
		text: "native model · path · context",
		renderBottomBar(width: number, _groups: "left" | "full", _previewTitle?: string) {
			widths.push(width);
			return truncateToWidth(this.text, width);
		},
	};
	const options = { shape: () => shape, provider: () => provider, accentColor: (text: string) => text };
	return { bar, options, widths, setShape: (value: string) => { shape = value; }, setProvider: (value?: string) => { provider = value; } };
}

test("status decoration is idempotent and follows provider and shape changes", () => {
	const f = fixture();
	attachFolioProviderStatus(f.bar, f.options);
	attachFolioProviderStatus(f.bar, f.options);
	for (const shape of [SHAPE_ID, GAUGE_SHAPE_ID, CAPLINE_SHAPE_ID]) {
		f.setShape(shape);
		const line = Bun.stripANSI(f.bar.renderBottomBar(120, "full"));
		expect(line).toContain(f.bar.text);
		expect(line.trimEnd().endsWith("◇ opencode-go")).toBe(true);
		expect(line.match(/opencode-go/g)).toHaveLength(1);
		expect(visibleWidth(line)).toBe(120);
	}
	expect(f.widths).toHaveLength(3);
	f.setProvider("deepseek");
	expect(f.bar.renderBottomBar(120, "full")).not.toContain("opencode-go");
	f.setShape("box");
	expect(f.bar.renderBottomBar(120, "full")).toBe(f.bar.text);
	expect(f.widths.at(-1)).toBe(120);
});

test("status decoration preserves native rendering when unavailable or not applicable", () => {
	const f = fixture();
	attachFolioProviderStatus(undefined, f.options);
	attachFolioProviderStatus({ describeComposerFacts: () => ({}) }, f.options);
	attachFolioProviderStatus(f.bar, f.options);
	expect(f.bar.renderBottomBar(70, "left")).toBe(f.bar.text);
	expect(f.widths.at(-1)).toBe(70);
	f.setProvider(undefined);
	expect(f.bar.renderBottomBar(70, "full")).toBe(f.bar.text);
	f.setProvider("opencode-go");
	expect(f.bar.renderBottomBar(16, "full")).toBe(truncateToWidth(f.bar.text, 16));
	expect(f.widths.at(-1)).toBe(16);
});

test("provider identity is bounded and sanitized while native status gets its own width", () => {
	const f = fixture();
	attachFolioProviderStatus(f.bar, f.options);
	f.setProvider("\x1b]0;spoofed-title\x07自定义-provider-with-a-long-name\nnext");
	for (const width of [24, 70, 120]) {
		const line = f.bar.renderBottomBar(width, "full");
		expect(visibleWidth(line)).toBe(width);
		expect(line).not.toMatch(/[\r\n\x07]/);
		expect(line).not.toContain("spoofed-title");
		expect(f.widths.at(-1)).toBeGreaterThanOrEqual(width / 2);
		expect(f.widths.at(-1)).toBeLessThan(width);
	}
});
