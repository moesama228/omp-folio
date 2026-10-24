import { getComposerStyle, padding, type ComposerStyle } from "@oh-my-pi/pi-tui";

export const SHAPE_ID = "omp-composer-folio-gutter";
export const GAUGE_SHAPE_ID = "omp-composer-folio-gauge";
export const CAPLINE_SHAPE_ID = "omp-composer-folio-capline";

const rail = getComposerStyle("rail");
const blankRail: ComposerStyle["renderTop"] = ctx =>
	ctx.accentColor("▎") + ctx.surfaceColor(padding(Math.max(0, ctx.width - 1)));

/**
 * Folio Gutter: the host rail surface plus its native standalone status bar.
 * The native bar is the only place that renders preset status segments; the
 * editor wrapper adds the quota rail and none of the host's status logic is
 * reimplemented.
 */
export const folioShape: ComposerStyle = {
	...rail,
	id: SHAPE_ID,
	verticalChrome: 2,
	bottomBarGap: false,
	renderTop: blankRail,
	renderBottom: blankRail,
};

/** Folio Gauge: the same rail chrome with remaining-share meters in the quota rail. */
export const gaugeShape: ComposerStyle = {
	...folioShape,
	id: GAUGE_SHAPE_ID,
};

/** Folio Capline: the editor supplies the top quota row; only the bottom blank rail remains. */
export const caplineShape: ComposerStyle = {
	...folioShape,
	id: CAPLINE_SHAPE_ID,
	verticalChrome: 1,
	renderTop: () => undefined,
};

export function isFolioShape(id: unknown): boolean {
	return id === SHAPE_ID || id === GAUGE_SHAPE_ID || id === CAPLINE_SHAPE_ID;
}
