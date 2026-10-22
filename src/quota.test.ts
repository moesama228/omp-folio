import { describe, expect, test } from "bun:test";
import {
	parseClaudeUsagePayload,
	parseCodexRateLimitHeaders,
	type OAuthAccountSummary,
	type UsageAmount,
	type UsageLimit,
	type UsageReport,
} from "@oh-my-pi/pi-ai";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { quotaContextKey, readQuota } from "./quota";

const account: OAuthAccountSummary = {
	position: 0,
	credentialId: 12,
	active: true,
	email: "person@example.test",
	accountId: "account-one",
};
const hour = 3_600_000;
const fetchedAt = 1_790_000_000_000;

// Only the public ExtensionContext boundary is substituted; provider parsing,
// model scope selection, identity checks, and remaining calculations are real.
function fixture(reports: UsageReport[] | null, options: {
	provider?: string;
	modelId?: string;
	accounts?: OAuthAccountSummary[];
	read?: () => Promise<UsageReport[] | null>;
	apiKey?: string;
	credentialId?: number;
	baseUrl?: string;
} = {}) {
	const model = {
		provider: options.provider ?? "openai-codex",
		id: options.modelId ?? "gpt-5.3-codex",
		...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
	};
	const accounts = options.accounts ?? [{ ...account }];
	let sessionId = "session-one";
	const ctx = {
		model,
		sessionManager: { getSessionId: () => sessionId },
		modelRegistry: {
			getProviderBaseUrl: () => undefined,
			getApiKey: async () => options.apiKey,
			authStorage: {
				oauth: { accounts: () => accounts },
				keys: {
					getWithCredential: async () => options.apiKey
						? { apiKey: options.apiKey, credentialId: options.credentialId }
						: undefined,
				},
				usage: { reports: options.read ?? (async () => reports) },
			},
		},
	} as unknown as ExtensionContext;
	return { ctx, model, accounts, setSession: (id: string) => { sessionId = id; } };
}

function codex(amount: UsageAmount = { usedFraction: 0.25, unit: "percent" }): UsageReport {
	return {
		provider: "openai-codex",
		fetchedAt,
		metadata: { email: account.email, accountId: account.accountId },
		limits: [{
			id: "openai-codex:primary",
			label: "Primary window",
			scope: { provider: "openai-codex", shared: true, windowId: "primary" },
			window: { id: "primary", label: "Primary window", durationMs: 3 * hour, resetsAt: fetchedAt + hour },
			amount,
		}],
	};
}

async function remaining(amount: UsageAmount) {
	return (await readQuota(fixture([codex(amount)]).ctx)).entries.map(entry => entry.remaining);
}

function kimi(): UsageReport {
	const base = {
		provider: "kimi-code",
		fetchedAt,
		metadata: { accountId: account.accountId },
	};
	const make = (id: string, windowId: string, durationMs: number, used: number): UsageLimit => ({
		id,
		label: windowId === "7d" ? "Weekly limit" : "5 hour limit",
		scope: { provider: "kimi-code", accountId: account.accountId, windowId, shared: true },
		window: { id: windowId, label: windowId, durationMs },
		amount: { used, limit: 100, usedFraction: used / 100, unit: "percent" },
	});
	return {
		...base,
		limits: [
			make("kimi-code:0", "7d", 7 * 24 * hour, 20),
			make("kimi-code:1", "5h", 5 * hour, 35),
			make("kimi-code:2", "limit_7d", 7 * 24 * hour, 90),
		],
	};
}

function cursor(): UsageReport {
	const scope = { provider: "cursor", windowId: "monthly" };
	const window = { id: "monthly", label: "Monthly", durationMs: 30 * 24 * hour };
	return {
		provider: "cursor",
		fetchedAt,
		metadata: { email: account.email, accountId: account.accountId },
		limits: [
			{ id: "cursor:usd:individual-auto", label: "Auto", scope, window, amount: { used: 30, limit: 100, usedFraction: 0.3, unit: "usd" } },
			{ id: "cursor:usd:individual-api", label: "API", scope, window, amount: { used: 80, limit: 100, usedFraction: 0.8, unit: "usd" } },
		],
	};
}

function grok(): UsageReport {
	const scope = { provider: "xai-oauth", accountId: account.accountId, shared: true };
	return {
		provider: "xai-oauth",
		fetchedAt,
		metadata: { email: account.email, accountId: account.accountId },
		limits: [
			{
				id: "xai-oauth:credits:1w",
				label: "Weekly credits",
				scope: { ...scope, windowId: "1w" },
				window: { id: "1w", label: "Weekly", durationMs: 7 * 24 * hour },
				amount: { used: 20, limit: 100, usedFraction: 0.2, unit: "percent" },
			},
			{
				id: "xai-oauth:included:1mo",
				label: "Monthly included",
				scope: { ...scope, windowId: "1mo" },
				window: { id: "1mo", label: "Monthly", durationMs: 30 * 24 * hour },
				amount: { used: 50, limit: 100, usedFraction: 0.5, unit: "percent" },
			},
			{
				id: "xai-oauth:on-demand",
				label: "On demand",
				scope,
				amount: { used: 5, limit: 100, usedFraction: 0.05, unit: "usd" },
			},
		],
	};
}

function antigravity(): UsageReport {
	const scope = { provider: "google-antigravity", accountId: account.accountId, projectId: "project-one", windowId: "daily" };
	return {
		provider: "google-antigravity",
		fetchedAt,
		metadata: { email: account.email, accountId: account.accountId, projectId: "project-one" },
		limits: [
			{
				id: "google-antigravity:google:default:daily",
				label: "Gemini",
				scope,
				window: { id: "daily", label: "Daily", durationMs: 24 * hour },
				amount: { used: 10, limit: 100, usedFraction: 0.1, unit: "percent" },
			},
			{
				id: "google-antigravity:google:default:weekly",
				label: "Gemini",
				scope: { ...scope, windowId: "weekly" },
				window: { id: "weekly", label: "Weekly", durationMs: 7 * 24 * hour },
				amount: { used: 40, limit: 100, usedFraction: 0.4, unit: "percent" },
			},
		],
	};
}

function devin(): UsageReport {
	const scope = { provider: "devin", accountId: account.accountId, orgId: "org-one", tier: "Devin Pro" };
	return {
		provider: "devin",
		fetchedAt,
		metadata: { email: account.email, accountId: account.accountId, orgId: "org-one" },
		limits: [
			{
				id: "devin:credits:prompt",
				label: "Prompt Credits",
				scope: { ...scope, windowId: "monthly" },
				window: { id: "monthly", label: "Plan Period", durationMs: 30 * 24 * hour },
				amount: { used: 25, remaining: 75, limit: 100, usedFraction: 0.25, remainingFraction: 0.75, unit: "unknown" },
			},
			{
				id: "devin:quota:daily",
				label: "Daily Quota",
				scope: { ...scope, windowId: "1d" },
				window: { id: "1d", label: "Daily Quota", durationMs: 24 * hour },
				amount: { used: 20, limit: 100, usedFraction: 0.2, unit: "percent" },
			},
		],
	};
}

describe("subscription remaining quota", () => {
	test("missing reports or quantitative fields stay unknown, not 100%", async () => {
		for (const reports of [null, [], [codex({ unit: "percent" })]]) {
			const result = await readQuota(fixture(reports).ctx);
			expect(result.state).toBe("unknown");
			expect(result.entries).toEqual([]);
		}
	});

	test("zero, full, overage and explicit remaining use finite clamped fractions", async () => {
		expect(await remaining({ usedFraction: 0, unit: "percent" })).toEqual([1]);
		expect(await remaining({ usedFraction: 1, unit: "percent" })).toEqual([0]);
		expect(await remaining({ usedFraction: 1.25, unit: "percent" })).toEqual([0]);
		expect(await remaining({ usedFraction: -0.25, unit: "percent" })).toEqual([1]);
		expect(await remaining({ remainingFraction: 0, usedFraction: 0, unit: "percent" })).toEqual([0]);
		expect(await remaining({ remainingFraction: 1.5, unit: "percent" })).toEqual([1]);
		expect(await remaining({ remainingFraction: -0.5, unit: "percent" })).toEqual([0]);
		expect(await remaining({ used: 3, limit: 4, unit: "requests" })).toEqual([0.25]);
		expect(await remaining({ used: 75, unit: "percent" })).toEqual([0.25]);
		expect(await remaining({ remaining: 3, limit: 4, unit: "credits" })).toEqual([0.75]);
		expect(await remaining({ usedFraction: NaN, unit: "percent" })).toEqual([]);
		expect(await remaining({ usedFraction: Infinity, unit: "percent" })).toEqual([]);
		expect(await remaining({ remainingFraction: Infinity, unit: "percent" })).toEqual([]);
		expect(await remaining({ remaining: Infinity, limit: 4, unit: "credits" })).toEqual([]);
		expect(await remaining({ used: 0, limit: 0, unit: "tokens" })).toEqual([]);
	});

	test("multiple stored accounts without a session pin stay unknown", async () => {
		const { ctx } = fixture([codex()], {
			accounts: [
				{ ...account, active: false },
				{ ...account, credentialId: 13, email: "second@example.test", accountId: "account-two", active: false },
			],
		});
		expect((await readQuota(ctx)).state).toBe("unknown");
	});

	test("provider, seat identity and organization must belong to the active account", async () => {
		const wrongSeat = codex();
		wrongSeat.metadata = { email: "other@example.test", accountId: account.accountId };
		expect((await readQuota(fixture([wrongSeat]).ctx)).entries).toEqual([]);
		const wrongAccount = codex();
		wrongAccount.metadata = { accountId: "different-account" };
		expect((await readQuota(fixture([wrongAccount]).ctx)).entries).toEqual([]);
		const wrongProvider = codex();
		wrongProvider.provider = "anthropic";
		expect((await readQuota(fixture([wrongProvider]).ctx)).entries).toEqual([]);
		for (const orgId of [undefined, "another-org"]) {
			const report = codex();
			report.metadata = { ...report.metadata, orgId };
			const { ctx } = fixture([report], { accounts: [{ ...account, orgId: "active-org" }] });
			expect((await readQuota(ctx)).entries).toEqual([]);
		}
		const scoped = codex();
		scoped.metadata = { ...scoped.metadata, orgId: "active-org" };
		expect((await readQuota(fixture([scoped]).ctx)).entries).toEqual([]);
		scoped.limits[0].scope.orgId = "different-org";
		const { ctx } = fixture([scoped], { accounts: [{ ...account, orgId: "active-org" }] });
		expect((await readQuota(ctx)).entries).toEqual([]);
	});

	test("official email precedence supports shared Codex account ids without sharing seats", async () => {
		const report = codex();
		report.metadata = { email: " PERSON@EXAMPLE.TEST ", accountId: "shared-team-account" };
		expect((await readQuota(fixture([report]).ctx)).entries[0]?.remaining).toBe(0.75);
	});

	test("real Codex headers retain actual durations and never invent a missing primary", async () => {
		const report = parseCodexRateLimitHeaders({
			"x-codex-secondary-used-percent": "100",
			"x-codex-secondary-window-minutes": "2880",
			"x-codex-secondary-reset-at": "1790003600",
		}, fetchedAt)!;
		report.metadata = { ...report.metadata, email: account.email };
		const result = await readQuota(fixture([report]).ctx);
		expect(result.entries).toEqual([{ label: "2d", remaining: 0, resetsAt: fetchedAt + hour }]);
		expect(result.fetchedAt).toBe(fetchedAt);
	});

	test("Codex Spark uses its separate meter, excluding chat and unrelated features", async () => {
		const report = codex();
		const base = report.limits[0];
		report.limits.push(...["spark", "review"].map((tier): UsageLimit => ({
			...base,
			id: `openai-codex:${tier}:primary`,
			scope: { ...base.scope, tier, modelId: tier === "spark" ? "GPT-5.3-Codex-Spark" : "Code review" },
			amount: { unit: "percent", remainingFraction: tier === "spark" ? 0.4 : 0.9 },
		})));
		expect((await readQuota(fixture([report]).ctx)).entries.map(entry => entry.remaining)).toEqual([0.75]);
		const { ctx } = fixture([report], { modelId: "gpt-5.3-codex-spark" });
		expect((await readQuota(ctx)).entries.map(entry => entry.remaining)).toEqual([0.4]);
	});

	test("real Claude payload retains shared windows plus only the active model family", async () => {
		const report = parseClaudeUsagePayload({
			five_hour: { utilization: 0 },
			seven_day: { utilization: 100 },
			limits: [
				{ kind: "weekly_scoped", percent: 75, scope: { model: { display_name: "Sonnet" } } },
				{ kind: "weekly_scoped", percent: 30, scope: { model: { display_name: "Opus" } } },
			],
			extra_usage: { is_enabled: true, monthly_limit: 10000, used_credits: 2500 },
		}, { email: account.email, orgId: "workspace" }, undefined, fetchedAt)!;
		const { ctx } = fixture([report], {
			provider: "anthropic",
			modelId: "claude-sonnet-4-5",
			accounts: [{ ...account, orgId: "workspace" }],
		});
		const result = await readQuota(ctx);
		expect(result.entries).toEqual([
			{ label: "5h", remaining: 1 },
			{ label: "7d", remaining: 0 },
			{ label: "7d · sonnet", remaining: 0.25 },
		]);
	});

	test("other providers require an exact model or explicit untiered shared scope", async () => {
		const report = codex();
		report.provider = "custom-provider";
		const base = report.limits[0];
		report.limits = [
			{ ...base, id: "exact", scope: { provider: report.provider, modelId: "current-model" } },
			{ ...base, id: "other", scope: { provider: report.provider, modelId: "other-model" } },
			{ ...base, id: "ambiguous", scope: { provider: report.provider } },
			{ ...base, id: "feature", scope: { provider: report.provider, tier: "search", shared: true } },
			{ ...base, id: "shared", scope: { provider: report.provider, shared: true } },
		];
		const { ctx } = fixture([report], { provider: report.provider, modelId: "current-model" });
		expect((await readQuota(ctx)).entries.map(entry => entry.remaining)).toEqual([0.75, 0.75]);
	});

	test("duplicate cached rows use the newest report without stamping a fresh time", async () => {
		const old = codex();
		const fresh = codex({ remainingFraction: 0.5, unit: "percent" });
		fresh.fetchedAt += 1000;
		const result = await readQuota(fixture([fresh, old]).ctx);
		expect(result.entries.map(entry => entry.remaining)).toEqual([0.5]);
		expect(result.fetchedAt).toBe(fetchedAt + 1000);
	});

	test("async results preserve the starting key so a switched context can discard them", async () => {
		const { promise: reports, resolve } = Promise.withResolvers<UsageReport[]>();
		const { ctx, model, accounts, setSession } = fixture(null, { read: () => reports });
		const initial = quotaContextKey(ctx);
		expect(initial).not.toContain(account.email!);
		const pending = readQuota(ctx);
		model.id = "gpt-5.4";
		expect(quotaContextKey(ctx)).not.toBe(initial);
		const modelKey = quotaContextKey(ctx);
		accounts[0].orgId = "new-org";
		expect(quotaContextKey(ctx)).not.toBe(modelKey);
		const identityKey = quotaContextKey(ctx);
		setSession("session-two");
		expect(quotaContextKey(ctx)).not.toBe(identityKey);
		resolve([codex()]);
		expect((await pending).key).toBe(initial);
	});

	test("failure exposes no exception, token, or identity details", async () => {
		const { ctx } = fixture(null, { read: async () => { throw new Error("Bearer secret person@example.test"); } });
		const result = await readQuota(ctx);
		expect(result.state).toBe("error");
		expect(result.entries).toEqual([]);
		expect(JSON.stringify(result)).not.toMatch(/Bearer|secret|person@example/);
	});

	test("Kimi 5h/7d windows use the provider selector and canonical labels", async () => {
		const { ctx } = fixture([kimi()], {
			provider: "kimi-code",
			modelId: "kimi-k2",
			accounts: [{ ...account, orgId: undefined }],
		});
		const result = await readQuota(ctx);
		expect(result.entries).toEqual([
			{ label: "7d", remaining: 0.8 },
			{ label: "5h", remaining: 0.65 },
		]);
	});

	test("Cursor selects the active model billing pool", async () => {
		const { ctx } = fixture([cursor()], { provider: "cursor", modelId: "composer-2.5" });
		const result = await readQuota(ctx);
		expect(result.entries.map(entry => [entry.label, entry.remaining])).toEqual([["auto", 0.7]]);
	});

	test("Cursor API-key reports are accepted only when their identity is unambiguous", async () => {
		const one = fixture([cursor()], { provider: "cursor", modelId: "composer-2.5", accounts: [] });
		expect((await readQuota(one.ctx)).entries.map(entry => entry.label)).toEqual(["auto"]);
		const other = cursor();
		other.metadata = { email: "other@example.test" };
		const many = fixture([cursor(), other], { provider: "cursor", modelId: "composer-2.5", accounts: [] });
		const result = await readQuota(many.ctx);
		expect(result.state).toBe("unknown");
		expect(result.entries).toEqual([]);
	});

	test("Grok uses the SuperGrok selector and excludes on-demand credit", async () => {
		const { ctx } = fixture([grok()], { provider: "xai-oauth", modelId: "grok-4" });
		const result = await readQuota(ctx);
		expect(result.entries.map(entry => [entry.label, entry.remaining])).toEqual([
			["7d", 0.8],
			["1mo", 0.5],
		]);
	});

	test("Antigravity scopes to the active model counter", async () => {
		const { ctx } = fixture([antigravity()], { provider: "google-antigravity", modelId: "gemini-3-pro" });
		const result = await readQuota(ctx);
		expect(result.entries.map(entry => [entry.label, entry.remaining])).toEqual([
			["1d", 0.9],
			["7d", 0.6],
		]);
	});

	test("Devin keeps credit buckets and daily/weekly quota with short labels", async () => {
		const { ctx } = fixture([devin()], {
			provider: "devin",
			modelId: "devin",
			accounts: [{ ...account, orgId: "org-one" }],
		});
		const result = await readQuota(ctx);
		expect(result.entries.map(entry => [entry.label, entry.remaining])).toEqual([
			["prompt", 0.75],
			["1d", 0.8],
		]);
	});

	test("DeepSeek returns an absolute balance instead of inventing a fraction", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => new Response(JSON.stringify({
			is_available: true,
			balance_infos: [{ currency: "CNY", total_balance: "110.00", granted_balance: "10.00", topped_up_balance: "100.00" }],
		}), { status: 200 })) as unknown as typeof fetch;
		try {
			const { ctx } = fixture(null, {
				provider: "deepseek",
				modelId: "deepseek-v4-flash",
				accounts: [],
				apiKey: "sk-test",
				credentialId: 901,
			});
			const result = await readQuota(ctx);
			expect(result.state).toBe("ready");
			expect(result.entries).toEqual([{
				label: "CNY",
				balance: { value: 110, currency: "CNY", granted: 10, toppedUp: 100 },
			}]);
			expect(result.entries[0]?.remaining).toBeUndefined();
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("DeepSeek failure stays unknown and does not expose the key", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
		try {
			const { ctx } = fixture(null, {
				provider: "deepseek",
				modelId: "deepseek-v4-flash",
				accounts: [],
				apiKey: "sk-secret",
				credentialId: 902,
			});
			const result = await readQuota(ctx);
			expect(result.state).toBe("error");
			expect(result.entries).toEqual([]);
			expect(JSON.stringify(result)).not.toContain("sk-secret");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
