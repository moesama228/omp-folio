import { expect, test } from "bun:test";
import { getComposerStyle } from "@oh-my-pi/pi-tui/components/composer/registry";
import { ensureFolioShape } from "./register";
import { SHAPE_ID } from "./shape";

test("dock shape installs once and resolves to the dock chrome", () => {
	ensureFolioShape();
	ensureFolioShape();
	const style = getComposerStyle(SHAPE_ID);
	expect(style.id).toBe(SHAPE_ID);
	expect(style.verticalChrome).toBe(2);
	expect(style.statusAttachment).toBe("none");
	expect(style.bottomBar).toBe("full");
});
