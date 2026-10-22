import { createHash } from "node:crypto";
import {
	antigravityRankingStrategy,
	claudeRankingStrategy,
	codexRankingStrategy,
	cursorRankingStrategy,
	kimiRankingStrategy,
	resolveUsedFraction,
	type OAuthAccountIdentity,
	type OAuthAccountSummary,
	type UsageLimit,
	type UsageReport,
} from "@oh-my-pi/pi-ai";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { QuotaEntry, QuotaSnapshot } from "./types";

function normalized(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : undefined;
}

interface QuotaContext {
	/** Provider on the selected model; the usage-report provider may differ for aliases. */
	modelProvider?: string;
	provider?: string;
	modelId?: string;
	sessionId: string;
	account?: OAuthAccountSummary;
	/** True when the account is the session-sticky selection, not the sole-account fallback. */
	pinned?: boolean;
}

/** Subscription usage providers whose model provider id is an alias. */
function reportProviders(provider: string | undefined): readonly string[] {
	if (provider === "xai" || provider === "xai-oauth") return ["xai-oauth", "xai"];
	return provider ? [provider] : [];
}

function activeAccount(
	ctx: ExtensionContext,
	providers: readonly string[],
	sessionId: string,
): { provider: string; account: OAuthAccountSummary; pinned: boolean } | undefined {
	for (const provider of providers) {
		const accounts = ctx.modelRegistry.authStorage.oauth.accounts(provider, sessionId);
		const active = accounts.find(item => item.active);
		if (active) return { provider, account: active, pinned: true };
		// Before the first request there is no session-sticky account. A single
		// stored account is unambiguous; multiple accounts still stay unknown.
		if (accounts.length === 1) return { provider, account: accounts[0], pinned: false };
	}
	return undefined;
}

function context(ctx: ExtensionContext): QuotaContext {
	const modelProvider = ctx.model?.provider;
	const modelId = ctx.model?.id;
	const sessionId = ctx.sessionManager.getSessionId();
	const providers = reportProviders(modelProvider);
	const active = activeAccount(ctx, providers, sessionId);
	return {
		modelProvider,
		provider: active?.provider ?? providers[0],
		modelId,
		sessionId,
		account: active?.account,
		pinned: active?.pinned,
	};
}

function contextKey(value: QuotaContext): string {
	const account = value.account;
	// The key is internal, but hashing also keeps account identifiers out of diagnostics.
	const identity = account
		? createHash("sha256")
				.update(JSON.stringify([
					account.credentialId,
					normalized(account.email),
					normalized(account.accountId),
					normalized(account.projectId),
					normalized(account.orgId),
				]))
				.digest("hex")
		: "no-active-account";
	return JSON.stringify([value.modelProvider ?? "", value.provider ?? "", value.modelId ?? "", value.sessionId, value.pinned === true ? "pinned" : "fallback", identity]);
}

/** Compare before applying an async result; account/model/session switches invalidate it. */
export function quotaContextKey(ctx: ExtensionContext): string {
	try {
		return contextKey(context(ctx));
	} catch {
		return JSON.stringify([ctx.model?.provider ?? "", ctx.model?.id ?? "", "context-unavailable"]);
	}
}

/**
 * Mirrors 18.12.6's active-oauth-account matcher: org is a gate, email is
 * decisive when both exist, then account/project ids are fallbacks. Scope org
 * attribution also qualifies a row (and must not contradict report metadata).
 */
function matchesAccount(report: UsageReport, limit: UsageLimit, identity: OAuthAccountIdentity): boolean {
	const metadata = report.metadata ?? {};
	const accountId = normalized(identity.accountId);
	const email = normalized(identity.email);
	const projectId = normalized(identity.projectId);
	const orgId = normalized(identity.orgId);
	const metadataOrg = normalized(metadata.orgId);
	const scopeOrg = normalized(limit.scope.orgId);
	if (metadataOrg && scopeOrg && metadataOrg !== scopeOrg) return false;
	const reportOrg = metadataOrg ?? scopeOrg;
	if (orgId || reportOrg) {
		if (orgId !== reportOrg) return false;
		if (!accountId && !email && !projectId) return true;
	}
	const reportEmail = normalized(metadata.email);
	if (email && reportEmail) return email === reportEmail;
	if (accountId) {
		const reportAccount = normalized(metadata.accountId) ?? normalized(metadata.account_id);
		if (reportAccount === accountId || normalized(limit.scope.accountId) === accountId) return true;
	}
	if (projectId) {
		if (normalized(metadata.projectId) === projectId || normalized(limit.scope.projectId) === projectId) return true;
	}
	return false;
}

function modelLimits(report: UsageReport, modelId: string): readonly UsageLimit[] {
	// These public strategies are read-only selectors, not requests or gating mutations.
	// Reserve scoping exposes Claude's applicable family counters even below exhaustion.
	switch (report.provider) {
		case "anthropic":
			return (claudeRankingStrategy.scopeLimitsForReserve?.(report, { modelId }) ?? []).filter(
				limit => !limit.scope.modelId || normalized(limit.scope.modelId) === normalized(modelId),
			);
		case "openai-codex":
			// Codex's additional meter modelId can be a display name, not a model id;
			// its official selector maps the requested model to the right meter.
			return codexRankingStrategy.scopeLimits?.(report, { modelId }) ?? [];
		case "kimi-code":
			return kimiRankingStrategy.scopeLimits?.(report) ?? [];
		case "cursor":
			return cursorRankingStrategy.scopeLimits?.(report, { modelId }) ?? [];
		case "google-antigravity":
			return antigravityRankingStrategy.scopeLimits?.(report, { modelId }) ?? [];
		case "xai-oauth":
			// The ranking selector yields [] while on-demand headroom exists; the
			// display wants the weekly/monthly subscription windows regardless.
			// A monthly advisory is an uncertain counter, so keep only the weekly
			// meter rather than presenting it as a firm remaining share.
			return report.limits.filter(limit =>
				limit.id === "xai-oauth:credits:1w"
				|| (limit.id === "xai-oauth:included:1mo" && report.metadata?.monthlyQuotaAdvisory !== true));
		case "devin":
			// Credit buckets and daily/weekly quotas share the plan scope; all are useful.
			return report.limits;
		default:
			return report.limits.filter(limit => {
				if (limit.scope.modelId) return normalized(limit.scope.modelId) === normalized(modelId);
				// An unknown tier/feature is not a provider-wide subscription allowance.
				return limit.scope.shared === true && !limit.scope.tier;
			});
	}
}

function remainingFraction(limit: UsageLimit): number | undefined {
	const explicit = limit.amount.remainingFraction;
	if (explicit !== undefined) {
		return Number.isFinite(explicit) ? Math.min(1, Math.max(0, explicit)) : undefined;
	}
	const used = resolveUsedFraction(limit);
	if (typeof used === "number" && Number.isFinite(used)) return Math.min(1, Math.max(0, 1 - used));
	// The public helper does not resolve absolute remaining/limit-only reports.
	const { remaining, limit: maximum } = limit.amount;
	if (typeof remaining === "number" && Number.isFinite(remaining) &&
		typeof maximum === "number" && Number.isFinite(maximum) && maximum > 0) {
		const fraction = remaining / maximum;
		return Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : undefined;
	}
	return undefined;
}

function sanitizedLabel(value: unknown): string | undefined {
	return typeof value === "string" ? value.replace(/[\r\n\t\x1b]/g, " ").trim() || undefined : undefined;
}

function windowLabel(limit: UsageLimit): string | undefined {
	const window = limit.window;
	if (!window) return undefined;
	const duration = window.durationMs;
	const id = sanitizedLabel(window.id);
	let label: string | undefined;
	// Canonical window ids carry the provider's intended display unit and avoid
	// turning Kimi's weekly window into "7 Day" from a prose label.
	if (id && /^\d+(?:\.\d+)?(?:s|m|h|d|w|mo)$/.test(id)) {
		label = id;
	} else if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
		const units = [[86_400_000, "d"], [3_600_000, "h"], [60_000, "m"], [1_000, "s"]] as const;
		const [size, suffix] = units.find(([size]) => duration >= size) ?? units[3];
		label = `${Number((duration / size).toFixed(2))}${suffix}`;
	} else {
		// No assumption that primary means 5h, or secondary means 7d.
		label = sanitizedLabel(window.label) ?? id;
	}
	if (!label) return undefined;
	const tier = sanitizedLabel(limit.scope.tier);
	return tier ? `${label} · ${tier}` : label;
}

/** Short labels that fit the 28-column quota rail. */
function quotaLabel(report: UsageReport, limit: UsageLimit): string | undefined {
	const id = limit.id;
	if (report.provider === "cursor") {
		if (id.endsWith(":individual-auto")) return "auto";
		if (id.endsWith(":individual-api")) return "api";
		if (id.endsWith(":individual-plan")) return "plan";
		if (id.endsWith(":individual-overall")) return "total";
		if (id.endsWith(":individual-ondemand")) return "ondmd";
	}
	if (report.provider === "devin") {
		if (id.includes(":credits:prompt")) return "prompt";
		if (id.includes(":credits:flow")) return "flow";
		if (id.includes(":credits:flex")) return "flex";
		if (id.includes(":quota:daily")) return "1d";
		if (id.includes(":quota:weekly")) return "7d";
	}
	if (report.provider === "google-antigravity") {
		const window = limit.window?.id;
		const short = window === "weekly" ? "7d" : window === "daily" ? "1d" : window;
		return short ?? windowLabel(limit);
	}
	if (report.provider === "xai-oauth") {
		if (limit.window?.id === "1w") return "7d";
		if (limit.window?.id === "1mo") return "1mo";
	}
	return windowLabel(limit) ?? sanitizedLabel(limit.label);
}

function reportIdentity(report: UsageReport): string | undefined {
	const metadata = report.metadata ?? {};
	const values = [metadata.email, metadata.accountId, metadata.account_id, metadata.projectId, metadata.orgId];
	for (const value of values) {
		const text = normalized(value);
		if (text) return text;
	}
	return undefined;
}

/**
 * API-key providers have no session-sticky OAuth account to compare against.
 * Accept reports only when every report names the same identity, or when there
 * is a single report. Multiple anonymous reports stay unknown rather than
 * mixing accounts.
 */
function reportsForActiveApiKey(reports: readonly UsageReport[]): readonly UsageReport[] | undefined {
	if (reports.length <= 1) return reports;
	const identities = new Set(reports.map(reportIdentity).filter((value): value is string => Boolean(value)));
	if (identities.size === 1) return reports;
	return undefined;
}

function deepseekBaseUrl(ctx: ExtensionContext): string {
	const raw = ctx.modelRegistry.getProviderBaseUrl("deepseek")
		?? ctx.model?.baseUrl
		?? "https://api.deepseek.com";
	return raw.replace(/\/+$/, "").replace(/\/v1$/, "");
}

function parseDeepSeekBalance(payload: unknown, fetchedAt: number): { entries: QuotaEntry[]; available?: boolean } {
	if (!payload || typeof payload !== "object") return { entries: [] };
	const record = payload as { is_available?: unknown; balance_infos?: unknown };
	const entries: QuotaEntry[] = [];
	if (Array.isArray(record.balance_infos)) {
		for (const item of record.balance_infos) {
			if (!item || typeof item !== "object") continue;
			const row = item as Record<string, unknown>;
			const currency = typeof row.currency === "string" ? row.currency.trim() : "";
			const value = typeof row.total_balance === "number" ? row.total_balance : Number(row.total_balance);
			if (!currency || !Number.isFinite(value) || value < 0) continue;
			const granted = typeof row.granted_balance === "number" ? row.granted_balance : Number(row.granted_balance);
			const toppedUp = typeof row.topped_up_balance === "number" ? row.topped_up_balance : Number(row.topped_up_balance);
			entries.push({
				label: currency.toUpperCase(),
				balance: {
					value,
					currency: currency.toUpperCase(),
					...(Number.isFinite(granted) && granted >= 0 ? { granted } : {}),
					...(Number.isFinite(toppedUp) && toppedUp >= 0 ? { toppedUp } : {}),
				},
			});
		}
	}
	return {
		entries,
		...(typeof record.is_available === "boolean" ? { available: record.is_available } : {}),
	};
}

const DEEPSEEK_TTL_MS = 5 * 60 * 1_000;
const DEEPSEEK_ERROR_TTL_MS = 30 * 1_000;
const deepseekCache = new Map<string, { at: number; ttl: number; snapshot: QuotaSnapshot }>();

async function readDeepSeekBalance(
	ctx: ExtensionContext,
	key: string,
	sessionId: string,
): Promise<QuotaSnapshot> {
	const baseUrl = deepseekBaseUrl(ctx);
	let apiKey: string | undefined;
	let credentialId: number | undefined;
	try {
		const resolved = await ctx.modelRegistry.authStorage.keys.getWithCredential("deepseek", sessionId);
		apiKey = resolved?.apiKey;
		credentialId = resolved?.credentialId;
	} catch {
		// Fall through to the model's normal key resolver.
	}
	if (!apiKey && ctx.model) {
		try {
			apiKey = await ctx.modelRegistry.getApiKey(ctx.model, sessionId);
		} catch {
			// Unknown state below; never surface credential errors.
		}
	}
	if (!apiKey) return { key, state: "unknown", entries: [] };
	// Include the bearer fingerprint so rotating a key behind the same stored row
	// cannot keep a stale balance for five minutes; the hash never leaves memory.
	const fingerprint = createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
	const identity = `${credentialId !== undefined ? `credential:${credentialId}` : "env"}:${fingerprint}`;
	const cacheKey = `${baseUrl}\0${identity}`;
	const cached = deepseekCache.get(cacheKey);
	const now = Date.now();
	if (cached && now - cached.at < cached.ttl) return { ...cached.snapshot, key };
	try {
		const response = await fetch(`${baseUrl}/user/balance`, {
			headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
			signal: AbortSignal.timeout(8_000),
		});
		if (!response.ok) throw new Error("balance request failed");
		const parsed = parseDeepSeekBalance(await response.json(), now);
		const snapshot: QuotaSnapshot = parsed.entries.length
			? {
					key,
					state: "ready",
					entries: parsed.entries,
					fetchedAt: now,
					...(parsed.available === false ? { message: "账户余额不可用" } : {}),
				}
			: { key, state: "unknown", entries: [], message: "余额字段缺失" };
		deepseekCache.set(cacheKey, { at: now, ttl: DEEPSEEK_TTL_MS, snapshot });
		return snapshot;
	} catch {
		const snapshot: QuotaSnapshot = { key, state: "error", entries: [], message: "余额获取失败" };
		deepseekCache.set(cacheKey, { at: now, ttl: DEEPSEEK_ERROR_TTL_MS, snapshot });
		return snapshot;
	}
}

/** Reads only the host's usage API/cache or the provider's documented balance endpoint. */
export async function readQuota(ctx: ExtensionContext): Promise<QuotaSnapshot> {
	let key = quotaContextKey(ctx);
	try {
		const current = context(ctx);
		key = contextKey(current);
		const { provider, modelId, account, sessionId, pinned } = current;
		if (!provider || !modelId) return { key, state: "unknown", entries: [] };
		if (provider === "deepseek") return readDeepSeekBalance(ctx, key, sessionId);
		const reports = await ctx.modelRegistry.authStorage.usage.reports({
			baseUrlResolver: provider => ctx.modelRegistry.getProviderBaseUrl(provider),
		});
		const relevant = (reports ?? []).filter(report => report.provider === provider && Number.isFinite(report.fetchedAt));
		const apiKeyUsage = provider === "cursor" || provider === "devin";
		const strictAccount = Boolean(account && pinned);
		const accepted = account
			? strictAccount ? relevant : reportsForActiveApiKey(relevant)
			: apiKeyUsage ? reportsForActiveApiKey(relevant) : [];
		if (!accepted) return { key, state: "unknown", entries: [], message: "多账号，无法确定当前额度" };
		const selected = new Map<string, { entry: QuotaEntry; fetchedAt: number }>();
		for (const report of accepted) {
			for (const limit of modelLimits(report, modelId)) {
				if (limit.scope.provider !== provider) continue;
				if (strictAccount && account && !matchesAccount(report, limit, account)) continue;
				const remaining = remainingFraction(limit);
				const label = quotaLabel(report, limit);
				if (remaining === undefined || !label) continue;
				const resetsAt = limit.window?.resetsAt;
				const entry: QuotaEntry = {
					label,
					remaining,
					...(typeof resetsAt === "number" && Number.isFinite(resetsAt) ? { resetsAt } : {}),
				};
				const id = JSON.stringify([limit.id, limit.scope.modelId, limit.scope.tier, limit.window?.id]);
				const previous = selected.get(id);
				if (!previous || previous.fetchedAt < report.fetchedAt) selected.set(id, { entry, fetchedAt: report.fetchedAt });
			}
		}
		const values = [...selected.values()];
		if (!values.length) return { key, state: "unknown", entries: [] };
		return {
			key,
			state: "ready",
			entries: values.map(value => value.entry),
			// A merged snapshot is only as fresh as its oldest contributing report.
			fetchedAt: Math.min(...values.map(value => value.fetchedAt)),
		};
	} catch {
		// Upstream exception messages may contain credential or account material.
		return { key, state: "error", entries: [] };
	}
}
