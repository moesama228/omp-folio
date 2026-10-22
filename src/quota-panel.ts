import {
	Ellipsis,
	fgOrPlain,
	getWidthConfigEpoch,
	theme,
	truncateToWidth,
	visibleWidth,
} from "@oh-my-pi/pi-tui";
import type { QuotaEntry, QuotaSnapshot } from "./types.ts";

const STALE_AFTER_MS = 10 * 60 * 1_000;

const muted = (text: string): string => fgOrPlain("muted", text);
const normal = (text: string): string => fgOrPlain("text", text);
const warning = (text: string): string => fgOrPlain("warning", text);
const error = (text: string): string => fgOrPlain("error", text);
const emphasize = (text: string): string => {
	const bold = (theme as unknown as { bold?: (value: string) => string } | undefined)?.bold;
	return bold ? bold(normal(text)) : normal(text);
};

function icon(name: "time" | "cost" | "warning", fallback: string): string {
	const icons = (theme as unknown as { icon?: Partial<Record<typeof name, string>> } | undefined)?.icon;
	return icons?.[name] || fallback;
}

function costIcon(): string {
	const glyph = icon("cost", "$");
	// Color emoji ignore ANSI foreground; use the text dollar so session accent applies.
	return /\p{Emoji_Presentation}/u.test(glyph) ? "$" : glyph;
}

function isStale(quota: QuotaSnapshot): boolean {
	return quota.fetchedAt !== undefined && Number.isFinite(quota.fetchedAt)
		&& Date.now() - quota.fetchedAt > STALE_AFTER_MS;
}

function currencySymbol(currency: string): string {
	const code = currency.toUpperCase();
	if (code === "CNY" || code === "RMB") return "¥";
	if (code === "USD") return "$";
	return `${code} `;
}

function formatBalance(entry: QuotaEntry): string | undefined {
	const balance = entry.balance;
	if (!balance || !Number.isFinite(balance.value)) return undefined;
	return `${currencySymbol(balance.currency)}${balance.value.toFixed(2)}`;
}

function shortStatus(message: string | undefined): string {
	if (!message) return "未知";
	if (message.includes("多账号")) return "多账号";
	if (message.includes("不可用")) return "不可用";
	if (message.includes("失败")) return "获取失败";
	if (message.includes("缺失")) return "无数据";
	return message;
}

function percentStyle(remaining: number): (text: string) => string {
	if (remaining <= 0.1) return error;
	if (remaining <= 0.25) return warning;
	return normal;
}

/** Icon-led quota rail; labels and wording mirror the host's usage segment. */
export class QuotaPanel {
	#snapshot: QuotaSnapshot = { key: "", state: "unknown", entries: [] };
	#accent: (text: string) => string;
	#cache: { width: number; epoch: number; theme: unknown; stale: boolean; accent: string; source: readonly string[] } | undefined;

	constructor(accent: (text: string) => string = muted) {
		this.#accent = accent;
	}

	update(snapshot: QuotaSnapshot): void {
		if (snapshot === this.#snapshot) return;
		this.#snapshot = snapshot;
		this.#cache = undefined;
	}

	invalidate(): void {
		this.#cache = undefined;
	}

	render(width: number): readonly string[] {
		const renderWidth = Number.isFinite(width) ? Math.max(1, Math.trunc(width)) : 1;
		const epoch = getWidthConfigEpoch();
		const stale = isStale(this.#snapshot);
		const accentSample = this.#accent("");
		if (this.#cache?.width === renderWidth && this.#cache.epoch === epoch
			&& this.#cache.theme === theme && this.#cache.stale === stale
			&& this.#cache.accent === accentSample) {
			return this.#cache.source;
		}
		const snapshot = this.#snapshot;
		const entries = snapshot.entries;
		const balances = entries.filter(entry => entry.balance);
		const allBalance = entries.length > 0 && balances.length === entries.length;
		const labelWidth = Math.max(0, ...entries.map(entry => visibleWidth(entry.label)));
		const prefixIcon = allBalance ? costIcon() : icon("time", "⏱");
		const prefix = `${this.#accent(prefixIcon)} `;
		const prefixWidth = visibleWidth(prefix);
		const lines: string[] = [];
		const lead = (index: number): string => index === 0 ? prefix : " ".repeat(prefixWidth);
		if (entries.length === 0) {
			const body = snapshot.state === "error" ? error("获取失败") : muted(shortStatus(snapshot.message));
			lines.push(`${prefix}${body}`);
		} else {
			entries.forEach((entry, index) => {
				if (allBalance) {
					const value = formatBalance(entry);
					if (!value) {
						lines.push(`${lead(index)}${muted("未知")}`);
						return;
					}
					const label = entries.length > 1 ? `${muted(entry.label.padEnd(labelWidth))} ` : "";
					lines.push(`${lead(index)}${label}${emphasize(value)}`);
					return;
				}
				if (entry.remaining === undefined) {
					lines.push(`${lead(index)}${muted(entry.label.padEnd(labelWidth))} ${muted("未知")}`);
					return;
				}
				const percent = emphasize(percentStyle(entry.remaining)(`${Math.round(entry.remaining * 100)}%`));
				lines.push(`${lead(index)}${muted(entry.label.padEnd(labelWidth))} ${percent}`);
			});
		}
		if (snapshot.message && entries.length > 0) {
			lines.push(`${muted(icon("warning", "⚠"))} ${warning(shortStatus(snapshot.message))}`);
		}
		if (stale) lines.push(`${muted(icon("warning", "⚠"))} ${warning("过期")}`);
		// Right-align the whole block to the rail's right edge. The status bar's
		// session name already uses that margin; left-aligning a short balance
		// left a conspicuous empty column inside the rail.
		const contentWidth = Math.max(0, ...lines.map(line => visibleWidth(line)));
		const leftPad = Math.max(0, renderWidth - contentWidth);
		const aligned = lines.map(line => " ".repeat(leftPad) + line);
		const clipped = aligned.map(line => visibleWidth(line) > renderWidth
			? truncateToWidth(line, renderWidth, Ellipsis.Omit)
			: line);
		this.#cache = { width: renderWidth, epoch, theme, stale, accent: accentSample, source: clipped };
		return clipped;
	}
}
