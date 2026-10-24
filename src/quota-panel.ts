import {
	Ellipsis,
	fgOrPlain,
	getWidthConfigEpoch,
	theme,
	truncateToWidth,
	visibleWidth,
	wrapLiteralLine,
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

type QuotaPanelMode = "list" | "gauge" | "capline";

interface FormattedEntry {
	label: string;
	value: string;
	remaining?: number;
}

function formatEntry(entry: QuotaEntry, allBalance: boolean, showLabel: boolean): FormattedEntry {
	if (allBalance) {
		const value = formatBalance(entry);
		return { label: showLabel ? entry.label : "", value: value ? emphasize(value) : muted("未知") };
	}
	const remaining = entry.remaining;
	return {
		label: entry.label,
		remaining,
		value: remaining === undefined
			? muted("未知")
			: emphasize(percentStyle(remaining)(`${Math.round(remaining * 100)}%`)),
	};
}


function meterStyle(remaining: number, accent: (text: string) => string): (text: string) => string {
	if (remaining <= 0.1) return error;
	if (remaining <= 0.25) return warning;
	return accent;
}

/** Shared quota formatting for list, gauge, and capline layouts. */
export class QuotaPanel {
	#snapshot: QuotaSnapshot = { key: "", state: "unknown", entries: [], message: "正在读取" };
	#accent: (text: string) => string;
	#mode: QuotaPanelMode;
	#cache: { width: number; epoch: number; theme: unknown; stale: boolean; accent: string; source: readonly string[] } | undefined;

	constructor(accent: (text: string) => string = muted, mode: QuotaPanelMode = "list") {
		this.#accent = accent;
		this.#mode = mode;
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
		const lines = this.#renderLines(renderWidth).flatMap(line => wrapLiteralLine(line, renderWidth));
		const blockWidth = this.#mode === "capline" ? 0 : Math.max(0, ...lines.map(line => visibleWidth(line)));
		const aligned = lines.map(line => {
			const contentWidth = this.#mode === "capline" ? visibleWidth(line) : blockWidth;
			return " ".repeat(Math.max(0, renderWidth - contentWidth)) + line;
		});
		const clipped = aligned.map(line => visibleWidth(line) > renderWidth
			? truncateToWidth(line, renderWidth, Ellipsis.Omit)
			: line);
		this.#cache = { width: renderWidth, epoch, theme, stale, accent: accentSample, source: clipped };
		return clipped;
	}

	#format(): { entries: readonly FormattedEntry[]; prefix: string; prefixWidth: number } {
		const source = this.#snapshot.entries;
		const balances = source.filter(entry => entry.balance);
		const allBalance = source.length > 0 && balances.length === source.length;
		const prefixIcon = allBalance ? costIcon() : icon("time", "⏱");
		const prefix = `${this.#accent(prefixIcon)} `;
		return {
			entries: source.map(entry => formatEntry(entry, allBalance, source.length > 1)),
			prefix,
			prefixWidth: visibleWidth(prefix),
		};
	}

	#emptyLine(prefix: string): string {
		const snapshot = this.#snapshot;
		const body = snapshot.state === "error" ? error("获取失败") : muted(shortStatus(snapshot.message));
		return `${prefix}${body}`;
	}

	#additionalLines(): string[] {
		const snapshot = this.#snapshot;
		const lines: string[] = [];
		if (snapshot.message && snapshot.entries.length > 0) {
			lines.push(`${muted(icon("warning", "⚠"))} ${warning(shortStatus(snapshot.message))}`);
		}
		if (isStale(snapshot)) lines.push(`${muted(icon("warning", "⚠"))} ${warning("过期")}`);
		return lines;
	}

	#renderLines(width: number): string[] {
		if (this.#mode === "gauge") return this.#renderGauge(width);
		if (this.#mode === "capline") return this.#renderCapline(width);
		return this.#renderList();
	}

	#renderList(): string[] {
		const { entries, prefix, prefixWidth } = this.#format();
		if (entries.length === 0) return [this.#emptyLine(prefix), ...this.#additionalLines()];
		const labelWidth = Math.max(0, ...entries.map(entry => visibleWidth(entry.label)));
		return [
			...entries.map((entry, index) => {
				const lead = index === 0 ? prefix : " ".repeat(prefixWidth);
				const label = entry.label ? `${muted(entry.label + " ".repeat(Math.max(0, labelWidth - visibleWidth(entry.label))))} ` : "";
				return `${lead}${label}${entry.value}`;
			}),
			...this.#additionalLines(),
		];
	}

	#renderGauge(width: number): string[] {
		const { entries, prefix, prefixWidth } = this.#format();
		if (entries.length === 0) return [this.#emptyLine(prefix), ...this.#additionalLines()];
		const labelWidth = Math.max(0, ...entries.map(entry => visibleWidth(entry.label)));
		const valueWidth = Math.max(0, ...entries.map(entry => visibleWidth(entry.value)));
		return [
			...entries.map((entry, index) => {
				const lead = index === 0 ? prefix : " ".repeat(prefixWidth);
				const label = entry.label ? `${muted(entry.label + " ".repeat(Math.max(0, labelWidth - visibleWidth(entry.label))))} ` : "";
				const value = " ".repeat(Math.max(0, valueWidth - visibleWidth(entry.value))) + entry.value;
				const base = `${lead}${label}${value}`;
				if (entry.remaining === undefined) return base;
				const meterWidth = Math.min(10, Math.max(0, width - visibleWidth(base) - 1));
				if (meterWidth === 0) return base;
				const filled = Math.round(entry.remaining * meterWidth);
				const meter = meterStyle(entry.remaining, this.#accent)("█".repeat(filled))
					+ muted("░".repeat(meterWidth - filled));
				return `${base} ${meter}`;
			}),
			...this.#additionalLines(),
		];
	}

	#renderCapline(width: number): string[] {
		const { entries, prefix, prefixWidth } = this.#format();
		if (entries.length === 0) return [this.#emptyLine(prefix), ...this.#additionalLines()];
		const items = [
			...entries.map(entry => `${entry.label ? `${muted(entry.label)} ` : ""}${entry.value}`),
			...this.#additionalLines(),
		];
		const separator = muted(" · ");
		const lines: string[] = [];
		let lead = prefix;
		let current = "";
		for (const item of items) {
			const candidate = current ? current + separator + item : item;
			if (current && visibleWidth(lead) + visibleWidth(candidate) > width) {
				lines.push(lead + current);
				lead = " ".repeat(prefixWidth);
				current = item;
			} else {
				current = candidate;
			}
		}
		if (current) lines.push(lead + current);
		return lines;
	}
}
