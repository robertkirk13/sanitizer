export interface ScopeDefinition {
	name: string;
	description: string;
	allowed: string[];
	forbidden: string[];
	examples: {
		valid: string[];
		invalid: string[];
	};
}

//
export interface SanitizeResult {
	decision: "PASS" | "BLOCK";
	confidence: number;
	reasoning: string;
	latencyMs: number;
	tokensUsed?: number;
	estimatedCostUsd?: number;
}

export interface RefusalResponse {
	message: string;
	suggestion?: string;
}

export interface QueryDataPoint {
	id: string;
	query: string;
	category: "core_domain" | "adjacent_domain" | "general_chat" | "adversarial";
	expectedDecision: "PASS" | "BLOCK";
}

export interface EvaluationResult {
	method: string;
	totalQueries: number;
	results: {
		category: string;
		total: number;
		blocked: number;
		passed: number;
		blockRate: number;
		accuracy: number;
	}[];
	metrics: {
		falsePositiveRate: number;
		leakageRate: number;
		avgLatencyMs: number;
		totalTokens: number;
		totalCostUsd: number;
		costPer1000Queries: number;
	};
}

export interface SanitizeOptions {
	threshold?: number;
	generateRefusal?: boolean;
}
