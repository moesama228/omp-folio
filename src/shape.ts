import { getComposerStyle, padding, type ComposerStyle } from "@oh-my-pi/pi-tui";

export const SHAPE_ID = "omp-composer-folio-gutter";

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
