import { expect, test } from "bun:test";
import { composerShape, registerComposerShape } from "@oh-my-pi/pi-coding-agent/ui/styles/composer/shapes";
import { registerFolio } from "./register";
import { CAPLINE_SHAPE_ID, GAUGE_SHAPE_ID, SHAPE_ID } from "./shape";

test("host registration and disposal support reloading every Folio shape", () => {
	const ids = [SHAPE_ID, GAUGE_SHAPE_ID, CAPLINE_SHAPE_ID];
	for (let load = 0; load < 2; load++) {
		const disposers: (() => void)[] = [];
		registerFolio({ registerComposerShape(shape) { disposers.push(registerComposerShape(shape)); } }, {
			quota: () => ({ key: "", state: "unknown", entries: [] }),
			accent: text => text, imeSafe: () => false, sessionAccent: () => false,
		});
		try {
			for (const id of ids) expect(composerShape(id).id).toBe(id);
		} finally {
			for (const dispose of disposers) dispose();
		}
		for (const id of ids) expect(composerShape(id).id).toBe("box");
	}
});
