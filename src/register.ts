import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { FolioView } from "./editor.ts";
import { CAPLINE_SHAPE_ID, folioShape, GAUGE_SHAPE_ID, SHAPE_ID } from "./shape.ts";

export function registerFolio(pi: Pick<ExtensionAPI, "registerComposerShape">, view: FolioView): void {
	pi.registerComposerShape(folioShape(SHAPE_ID, "Folio Gutter", view));
	pi.registerComposerShape(folioShape(GAUGE_SHAPE_ID, "Folio Gauge", view));
	pi.registerComposerShape(folioShape(CAPLINE_SHAPE_ID, "Folio Capline", view));
}
