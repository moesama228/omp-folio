import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";
import { CustomEditor } from "@oh-my-pi/pi-tui/prompt/custom-editor";
import { theme, type EditorTheme, type KeybindingsManager, type TUI } from "@oh-my-pi/pi-tui";
import { getSessionAccentAnsi, getSessionAccentHex } from "@oh-my-pi/pi-tui/theme";
import { attachFolioEditor } from "./src/editor.ts";
import { quotaContextKey, readQuota } from "./src/quota.ts";
import { ensureFolioShape } from "./src/register.ts";
import { SHAPE_ID } from "./src/shape.ts";
import type { QuotaSnapshot } from "./src/types.ts";

type EditorFactory = (tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => CustomEditor;
type FolioFactory = EditorFactory & { folioBaseFactory: EditorFactory | undefined; folioShapeId: string };

export default function composerFolio(pi: ExtensionAPI): void {
	ensureFolioShape();
	// The host only forces an extension to bind before the first frame when it
	// registered a provider, shortcut, composer shape, or file fallback. We
	// install the shape directly (see src/register.ts), so keep this extension
	// on the eager path with a no-op fallback. It is consulted only when a
	// native write is denied, and answering false means "not handled".
	pi.registerFileWriteFallback(async () => false);
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
	let editor: CustomEditor | undefined;
	let request = 0;
	let stopped = false;
	let inFlightKey: string | undefined;
	let snapshot: QuotaSnapshot = { key: "", state: "unknown", entries: [], message: "正在读取" };
	const enabled = () => shape?.get(pi.pi.settings) === SHAPE_ID;
	// Match the host editor border: hash the session name into the theme's accent
	// space. The native status line uses the same derivation, so the left rail and
	// the status bar move together when a session is renamed.
	const accentColor = (text: string): string => {
		const name = sessionAccent?.get(pi.pi.settings) === false
			? undefined
			: context?.sessionManager.getSessionName();
		const hex = name ? getSessionAccentHex(name, theme.sessionAccentInputs) : undefined;
		const ansi = getSessionAccentAnsi(hex);
		return ansi ? `${ansi}${text}\x1b[39m` : theme.fg("accent", text);
	};
	const currentQuota = (): QuotaSnapshot => {
		if (!context) return snapshot;
		const key = quotaContextKey(context);
		if (key !== snapshot.key) queueMicrotask(() => { void refresh(); });
		return key === snapshot.key ? snapshot : { key, state: "unknown", entries: [], message: "正在读取" };
	};
	const repaint = () => editor?.tui?.requestRender();
	const refresh = async (): Promise<void> => {
		if (stopped || !context || !enabled()) return;
		const ctx = context;
		const key = quotaContextKey(ctx);
		if (inFlightKey === key) return;
		inFlightKey = key;
		const sequence = ++request;
		if (snapshot.key !== key) {
			snapshot = { key, state: "unknown", entries: [], message: "正在读取" };
			repaint();
		}
		try {
			const next = await readQuota(ctx);
			if (!stopped && sequence === request && context === ctx && next.key === quotaContextKey(ctx)) {
				snapshot = next;
				repaint();
			}
		} finally {
			if (sequence === request) inFlightKey = undefined;
		}
	};

	let wrapped = false;
	let stopShapeListener: (() => void) | undefined;
	// Replacing the editor always repaints. Wait until Folio Gutter is actually
	// selected so another shape is not flashed and then overwritten.
	const installEditor = (ctx: ExtensionContext): void => {
		if (wrapped || !ctx.hasUI || !enabled()) return;
		wrapped = true;
		const previous = ctx.ui.getEditorComponent() as FolioFactory | EditorFactory | undefined;
		const base = previous && "folioShapeId" in previous && previous.folioShapeId === SHAPE_ID
			? previous.folioBaseFactory : previous;
		const factory: FolioFactory = Object.assign((tui: TUI, theme: EditorTheme, keys: KeybindingsManager) => {
			editor = attachFolioEditor(base ? base(tui, theme, keys) : new CustomEditor(tui, theme, keys), tui, {
				enabled,
				quota: currentQuota,
				accentColor,
			});
			return editor;
		}, { folioBaseFactory: base, folioShapeId: SHAPE_ID });
		ctx.ui.setEditorComponent(factory);
	};

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI || ctx.agent.kind !== "main") return;
		context = ctx;
		editor = undefined;
		stopped = false;
		installEditor(ctx);
		stopShapeListener?.();
		stopShapeListener = shape?.listen(pi.pi.settings, () => {
			installEditor(ctx);
			repaint();
		});
		ctx.setInterval(() => { void refresh(); }, 30_000);
		void refresh();
	});
	pi.on("agent_start", () => { void refresh(); });
	pi.on("agent_end", () => { void refresh(); });
	pi.on("turn_end", () => { void refresh(); });
	pi.on("session_shutdown", () => {
		stopped = true;
		request++;
		stopShapeListener?.();
		stopShapeListener = undefined;
		// Keep the editor and context until the host's final history flush: the
		// style stays registered, so the last frame remains a complete Folio Gutter frame
		// instead of a box fallback with a dock sidebar.
		wrapped = false;
	});
}
