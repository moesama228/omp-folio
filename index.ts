import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";
import { signal } from "@oh-my-pi/pi-tui";
import { currentTheme } from "@oh-my-pi/pi-tui/theme/runtime";
import { caplineWidget, type FolioView } from "./src/editor.ts";
import { quotaContextKey, readQuota } from "./src/quota.ts";
import { attachProviderStatus } from "./src/provider-status.ts";
import { registerFolio } from "./src/register.ts";
import { CAPLINE_SHAPE_ID, isFolioShape, SHAPE_ID } from "./src/shape.ts";
import type { QuotaSnapshot } from "./src/types.ts";

export default function composerFolio(pi: ExtensionAPI): void {
	const shape = lookup("composer.shape");
	const sessionAccent = lookup("statusLine.sessionAccent");
	// One-time rename from the first Dock prototype. Keep the setting stable
	// across this launch even if a project layer still carries the old value.
	const LEGACY_SHAPE_ID = "omp-composer-dock";
	if (shape?.get(pi.pi.settings) === LEGACY_SHAPE_ID) {
		try {
			shape.set(pi.pi.settings, SHAPE_ID);
		} catch {
			// Settings may be unavailable in headless probes; the runtime override below is still safe.
		}
		if (shape.get(pi.pi.settings) === LEGACY_SHAPE_ID) {
			try {
				shape.override(pi.pi.settings, SHAPE_ID);
			} catch {}
		}
	}
	let context: ExtensionContext | undefined;
	const imeSafe = lookup("tui.imeSafeCursor");
	let request = 0;
	let stopped = false;
	let inFlightKey: string | undefined;
	const snapshot = signal<QuotaSnapshot>({ key: "", state: "unknown", entries: [], message: "正在读取" });
	const currentShape = (): string | undefined => {
		const value: unknown = shape?.get(pi.pi.settings);
		return typeof value === "string" ? value : undefined;
	};
	const enabled = () => isFolioShape(currentShape());
	const view: FolioView = {
		accent: text => currentTheme().fg("accent", text),
		sessionAccent: () => sessionAccent?.get(pi.pi.settings) !== false && !!context?.sessionManager.getSessionName(),
		imeSafe: () => imeSafe?.get(pi.pi.settings) === true,
		quota() {
			const value = snapshot();
			const key = context && quotaContextKey(context);
			return !key || key === value.key ? value : { key, state: "unknown", entries: [], message: "正在读取" };
		},
	};
	registerFolio(pi, view);
	const provider = signal<string | undefined>(undefined);
	let detachStatus: (() => void) | undefined;
	const refresh = async (): Promise<void> => {
		if (stopped || !context || !enabled()) return;
		provider.set(context.model?.provider);
		const ctx = context;
		const key = quotaContextKey(ctx);
		if (inFlightKey === key) return;
		inFlightKey = key;
		const sequence = ++request;
		if (snapshot.peek().key !== key) {
			snapshot.set({ key, state: "unknown", entries: [], message: "正在读取" });
		}
		try {
			const next = await readQuota(ctx);
			if (!stopped && sequence === request && context === ctx && next.key === quotaContextKey(ctx)) {
				snapshot.set(next);
			}
		} finally {
			if (sequence === request) inFlightKey = undefined;
		}
	};

	let stopShapeListener: (() => void) | undefined;
	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI || ctx.agent.kind !== "main") return;
		context = ctx;
		stopped = false;
		request++;
		inFlightKey = undefined;
		detachStatus?.();
		detachStatus = attachProviderStatus(provider);
		// A panel painted before session_start still has its original cached block.
		// A transient status entry invalidates its children so it picks up the painter.
		ctx.ui.setStatus("omp-folio", "◇");
		ctx.ui.setStatus("omp-folio", undefined);
		const syncShape = () => {
			const id = currentShape();
			// Prepaint may have cached the box fallback for this same id. Applying
			// Folio's explicit padding invalidates the host's measured field.
			if (id && isFolioShape(id)) ctx.ui.composer?.setShape(id, 1);
			ctx.ui.setWidget("omp-folio-capline", id === CAPLINE_SHAPE_ID
				? () => caplineWidget(view) : undefined, { placement: "aboveEditor" });
			if (enabled()) void refresh();
			else provider.set(undefined);
		};
		stopShapeListener?.();
		stopShapeListener = shape?.listen(pi.pi.settings, syncShape);
		// 19.2.1 has no extension event for session-only model switches.
		// Compare just the active model here; account and usage reads stay on refresh.
		let previousModel = ctx.model;
		ctx.setInterval(() => {
			const model = ctx.model;
			if (model?.provider === previousModel?.provider && model?.id === previousModel?.id) return;
			previousModel = model;
			void refresh();
		}, 200);
		ctx.setInterval(() => { void refresh(); }, 30_000);
		syncShape();
	});
	pi.on("agent_start", () => { void refresh(); });
	pi.on("agent_end", () => { void refresh(); });
	pi.on("turn_end", () => { void refresh(); });
	pi.on("session_shutdown", () => {
		stopped = true;
		request++;
		stopShapeListener?.();
		stopShapeListener = undefined;
		provider.set(undefined);
		detachStatus?.();
		detachStatus = undefined;
	});
}
