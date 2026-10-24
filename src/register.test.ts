import { expect, test } from "bun:test";
import { getComposerStyle } from "@oh-my-pi/pi-tui/components/composer/registry";
import { getComposerShapeOptions } from "@oh-my-pi/pi-tui/overlays/composer-shape-registry";
import { ensureFolioShape } from "./register";
import { CAPLINE_SHAPE_ID, GAUGE_SHAPE_ID, SHAPE_ID } from "./shape";

test("Folio shapes install once in both selector and renderer registries", () => {
	ensureFolioShape();
	ensureFolioShape();
	const options = getComposerShapeOptions();
	for (const id of [SHAPE_ID, GAUGE_SHAPE_ID, CAPLINE_SHAPE_ID]) {
		expect(options.filter(option => option.value === id)).toHaveLength(1);
		expect(getComposerStyle(id).id).toBe(id);
	}
});

test("Folio shapes preserve native status and their vertical chrome contracts", () => {
	const chrome = {
		width: 20,
		accentColor: (text: string) => text,
		surfaceColor: (text: string) => text,
	};
	for (const id of [SHAPE_ID, GAUGE_SHAPE_ID]) {
		const style = getComposerStyle(id);
		expect(style.verticalChrome).toBe(2);
		expect(style.statusAttachment).toBe("none");
		expect(style.bottomBar).toBe("full");
		expect(style.renderTop(chrome as never)).toBeDefined();
		expect(style.renderBottom(chrome as never)).toBeDefined();
	}
	const capline = getComposerStyle(CAPLINE_SHAPE_ID);
	expect(capline.verticalChrome).toBe(1);
	expect(capline.statusAttachment).toBe("none");
	expect(capline.bottomBar).toBe("full");
	expect(capline.renderTop(chrome as never)).toBeUndefined();
	expect(capline.renderBottom(chrome as never)).toBeDefined();
});
