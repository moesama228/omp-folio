export interface QuotaBalance {
	value: number;
	currency: string;
	granted?: number;
	toppedUp?: number;
}

export interface QuotaEntry {
	label: string;
	/** Remaining share in [0, 1], not a percentage or a token count. */
	remaining?: number;
	/** Absolute account balance for API-key providers such as DeepSeek. */
	balance?: QuotaBalance;
	resetsAt?: number;
}

export interface QuotaSnapshot {
	key: string;
	state: "ready" | "unknown" | "error";
	entries: readonly QuotaEntry[];
	fetchedAt?: number;
	message?: string;
}

