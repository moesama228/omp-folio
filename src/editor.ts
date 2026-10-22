import {
	Row,
	padding,
	sliceByColumn,
	theme,
	visibleWidth,
	type Component,
	type TUI,
} from "@oh-my-pi/pi-tui";
import type { CustomEditor } from "@oh-my-pi/pi-tui/prompt/custom-editor";
import { getEditorTheme } from "@oh-my-pi/pi-tui/theme";
import { QuotaPanel } from "./quota-panel.ts";
import type { QuotaSnapshot } from "./types.ts";

export interface FolioEditorOptions {
	enabled(): boolean;
	quota(): QuotaSnapshot;
	/** Theme-aware session accent; applied to the rail and blank chrome. */
	accentColor(text: string): string;
}

const SPLIT_MIN_WIDTH = 88;
const RAIL_MIN_WIDTH = 22;
const RAIL_MAX_WIDTH = 26;

/** Decorate the actual host editor: all input, history, Vim and completion stay in omp. */
export function attachFolioEditor(editor: CustomEditor, tui: TUI, options: FolioEditorOptions): CustomEditor {
	const renderInput = editor.render.bind(editor);
	const setInputMaxHeight = editor.setMaxHeight.bind(editor);
	const setImeSafeCursorLayout = editor.setImeSafeCursorLayout.bind(editor);
	const panel = new QuotaPanel(options.accentColor);
	let inputLines: readonly string[] = [];
	let maxHeight: number | undefined;
	let imeSafe = false;
	const input: Component = {
		render(width) {
			inputLines = renderInput(width);
			return inputLines;
		},
	};
	const divider = () => "    ";
	const columns = new Row({
		children: [{ content: input, grow: 1 }, { content: panel, width: 24, padding: { top: 1, bottom: 1, right: 1 } }],
		gap: divider,
	});

	editor.setMaxHeight = height => {
		maxHeight = height;
		setInputMaxHeight(height);
	};
	editor.setImeSafeCursorLayout = enabled => {
		imeSafe = enabled;
		setImeSafeCursorLayout(enabled);
	};

	editor.render = width => {
		if (!options.enabled()) {
			setInputMaxHeight(maxHeight);
			return renderInput(width);
		}
		panel.update(options.quota());
		// IME-safe mode explicitly requires no right-hand cells after the caret.
		// Stack the same information rather than defeating that terminal guarantee.
		const split = width >= SPLIT_MIN_WIDTH && !imeSafe;
		const sidebarWidth = Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, Math.floor(width * 0.2)));
		const sideRows = split ? [] : panel.render(Math.max(1, width - 4));
		setInputMaxHeight(maxHeight === undefined ? undefined : Math.max(3, maxHeight - sideRows.length));

		if (split) {
			columns.setChildren([
				{ content: input, grow: 1 },
				{ content: panel, width: sidebarWidth, padding: { top: 1, bottom: 1, right: 1 } },
			]);
			const rows = columns.render(width);
			// Row fills the shorter pane with spaces; continue the existing rail there.
			return rows.map((line, index) => surface(index < inputLines.length
				? line : options.accentColor("▎") + sliceByColumn(line, 1, width)));
		}
		const rows = renderInput(width);
		return [
			...rows,
			...sideRows.map(line => surface(options.accentColor("▎") + " " + line + padding(Math.max(0, width - 2 - visibleWidth(line))))),
		];
	};
	// Keep the supplied TUI on the existing editor; the host also uses this for repaints.
	editor.tui = tui;
	// The host reapplies its own editor theme on every shape/settings sync. Wrap
	// setTheme so the session-derived rail accent survives those resets, but only
	// while Folio Gutter is the active shape.
	const applyTheme = editor.setTheme.bind(editor);
	editor.setTheme = next => applyTheme(options.enabled()
		? { ...next, accentColor: options.accentColor }
		: next);
	applyTheme({ ...getEditorTheme(), ...(options.enabled() ? { accentColor: options.accentColor } : {}) });
	return editor;
}

function surface(text: string): string {
	return theme.bgFill("userMessageBg", theme.fgOnBg("userMessageText", "userMessageBg", text));
}
