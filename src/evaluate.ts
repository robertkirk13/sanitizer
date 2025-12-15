import { InputSanitizer } from "./sanitizer";
import { SystemPromptBaseline, KeywordFilterBaseline, LlamaGuardBaseline } from "./baselines";
import { generateDataset } from "./generate-dataset";
import type { QueryDataPoint, SanitizeResult, EvaluationResult, ScopeDefinition } from "./types";

let CONCURRENCY = 50;

async function evalMethod(name: string, fn: (q: string) => Promise<SanitizeResult>, data: QueryDataPoint[], debug = false, concurrency = CONCURRENCY) {
	const results: { q: QueryDataPoint; r: SanitizeResult; ok: boolean }[] = new Array(data.length);
	let completed = 0;
	
	const processQuery = async (idx: number): Promise<void> => {
		const q = data[idx];
		try {
			const r = await fn(q.query);
			results[idx] = { q, r, ok: r.decision === q.expectedDecision };
			
			if (debug && idx < 3) {
				console.log(`\n    [DEBUG] Query: "${q.query.slice(0, 50)}..."`);
				console.log(`    [DEBUG] Expected: ${q.expectedDecision}, Got: ${r.decision}, Confidence: ${r.confidence}`);
				console.log(`    [DEBUG] Reasoning: ${r.reasoning?.slice(0, 100)}`);
			}
		} catch (e) {
			if (debug && idx < 5) {
				console.log(`\n    [DEBUG ERROR] ${e instanceof Error ? e.message : "unknown"}`);
			}
			results[idx] = { q, r: { decision: "BLOCK", confidence: 0, reasoning: "err", latencyMs: 0, tokensUsed: 0, estimatedCostUsd: 0 }, ok: false };
		}
		completed++;
		process.stdout.write(`\r  ${completed}/${data.length}`);
	};

	const queue = [...data.keys()];
	const workers = Array(Math.min(concurrency, data.length)).fill(null).map(async () => {
		while (queue.length > 0) {
			const idx = queue.shift();
			if (idx !== undefined) await processQuery(idx);
		}
	});
	await Promise.all(workers);

	const cats = ["core_domain", "adjacent_domain", "general_chat", "adversarial"] as const;
	const catStats = cats.map(c => {
		const d = results.filter(x => x.q.category === c);
		const blocked = d.filter(x => x.r.decision === "BLOCK").length;
		return { 
			category: c, 
			total: d.length, 
			blocked, 
			passed: d.length - blocked, 
			blockRate: d.length ? blocked / d.length : 0, 
			accuracy: d.length ? d.filter(x => x.ok).length / d.length : 0 
		};
	});

	const core = results.filter(x => x.q.category === "core_domain");
	const shouldBlock = results.filter(x => x.q.expectedDecision === "BLOCK");
	const lats = results.map(x => x.r.latencyMs);
	
	const totalTokens = results.reduce((sum, x) => sum + (x.r.tokensUsed ?? 0), 0);
	const totalCostUsd = results.reduce((sum, x) => sum + (x.r.estimatedCostUsd ?? 0), 0);
	const costPer1000 = data.length > 0 ? (totalCostUsd / data.length) * 1000 : 0;

	return {
		results,
		eval: {
			method: name, totalQueries: data.length, results: catStats,
			metrics: {
				falsePositiveRate: core.length ? core.filter(x => x.r.decision === "BLOCK").length / core.length : 0,
				leakageRate: shouldBlock.length ? shouldBlock.filter(x => x.r.decision === "PASS").length / shouldBlock.length : 0,
				avgLatencyMs: Math.round(lats.reduce((a, b) => a + b, 0) / lats.length),
				totalTokens,
				totalCostUsd,
				costPer1000Queries: costPer1000,
			},
		} as EvaluationResult,
	};
}

function print(evals: EvaluationResult[]) {
	console.log("\n" + "=".repeat(90) + "\nRESULTS\n" + "=".repeat(90));
	
	const header = ["Category".padEnd(15), ...evals.map(e => e.method.padEnd(14))];
	console.log(header.join(" "));
	console.log("-".repeat(90));
	
	const cats = { core_domain: "Core (Valid)", adjacent_domain: "Adjacent", general_chat: "General", adversarial: "Adversarial" };
	for (const [k, label] of Object.entries(cats)) {
		const row = [label.padEnd(15)];
		for (const e of evals) {
			const c = e.results.find(r => r.category === k);
			row.push(c ? `${(c.blockRate * 100).toFixed(0)}% blocked`.padEnd(14) : "N/A".padEnd(14));
		}
		console.log(row.join(" "));
	}
	
	console.log("\n" + "-".repeat(90));
	console.log("METRICS");
	console.log("-".repeat(90));
	
	console.log("False Positive Rate (lower is better):");
	console.log("  " + evals.map(e => `${e.method}: ${(e.metrics.falsePositiveRate * 100).toFixed(1)}%`).join("  |  "));
	
	console.log("\nLeakage Rate (lower is better):");
	console.log("  " + evals.map(e => `${e.method}: ${(e.metrics.leakageRate * 100).toFixed(1)}%`).join("  |  "));
	
	console.log("\nAvg Latency:");
	console.log("  " + evals.map(e => `${e.method}: ${e.metrics.avgLatencyMs}ms`).join("  |  "));
	
	console.log("\n" + "-".repeat(90));
	console.log("COST ANALYSIS (Groq pricing)");
	console.log("-".repeat(90));
	
	console.log("Total Tokens Used:");
	console.log("  " + evals.map(e => `${e.method}: ${e.metrics.totalTokens.toLocaleString()}`).join("  |  "));
	
	console.log("\nTotal Cost (this evaluation):");
	console.log("  " + evals.map(e => `${e.method}: $${e.metrics.totalCostUsd.toFixed(4)}`).join("  |  "));
	
	console.log("\nCost per 1,000 queries:");
	console.log("  " + evals.map(e => `${e.method}: $${e.metrics.costPer1000Queries.toFixed(4)}`).join("  |  "));
	
	console.log("\nProjected monthly cost (100K queries/day):");
	const monthlyQueries = 100_000 * 30;
	console.log("  " + evals.map(e => {
		const monthlyCost = (e.metrics.costPer1000Queries / 1000) * monthlyQueries;
		return `${e.method}: $${monthlyCost.toFixed(2)}`;
	}).join("  |  "));
	
	console.log("\n" + "=".repeat(90));
}

interface RunOptions {
	subset?: number;
	includeLlamaGuard?: boolean;
	llamaGuardProvider?: "groq" | "ollama";
	llamaGuardOnly?: boolean;
	debug?: boolean;
	concurrency?: number;
}

async function run(options: RunOptions = {}) {
	const { subset, includeLlamaGuard, llamaGuardProvider = "groq", llamaGuardOnly, debug = false, concurrency = CONCURRENCY } = options;
	const scope: ScopeDefinition = await Bun.file("./scopes/pcb-component-search.json").json();
	let data = await generateDataset();
	
	if (subset) {
		const n = Math.floor(subset / 4);
		data = [
			...data.filter(d => d.category === "core_domain").slice(0, n), 
			...data.filter(d => d.category === "adjacent_domain").slice(0, n), 
			...data.filter(d => d.category === "general_chat").slice(0, n), 
			...data.filter(d => d.category === "adversarial").slice(0, n)
		];
	}
	
	console.log(`\nEvaluating on ${data.length} queries...`);

	type Method = { name: string; fn: (q: string) => Promise<SanitizeResult> };
	const methods: Method[] = [];

	if (llamaGuardOnly) {
		methods.push({
			name: `LlamaGuard (${llamaGuardProvider})`,
			fn: (q: string) => new LlamaGuardBaseline(scope, llamaGuardProvider).classify(q),
		});
	} else {
		methods.push(
			{ name: "SysPrompt", fn: (q: string) => new SystemPromptBaseline(scope).classify(q) },
			{ name: "Keywords", fn: (q: string) => new KeywordFilterBaseline(scope).classify(q) },
			{ name: "Sanitizer", fn: (q: string) => new InputSanitizer(scope).classify(q) },
		);

		if (includeLlamaGuard) {
			methods.push({
				name: `LlamaGuard (${llamaGuardProvider})`,
				fn: (q: string) => new LlamaGuardBaseline(scope, llamaGuardProvider).classify(q),
			});
		}
	}

	const evals: EvaluationResult[] = [];
	for (const m of methods) {
		console.log(`\n${m.name}: (concurrency: ${concurrency})`);
		const { eval: e } = await evalMethod(m.name, m.fn, data, debug, concurrency);
		evals.push(e);
	}
	print(evals);
}

if (import.meta.main) {
	const args = process.argv;
	const subsetIdx = args.indexOf("--subset");
	const subset = subsetIdx > -1 ? parseInt(args[subsetIdx + 1]) : undefined;
	const quick = args.includes("--quick") || args.includes("-q");
	const includeLlamaGuard = args.includes("--llama-guard");
	const llamaGuardOnly = args.includes("--llama-guard-only");
	const providerIdx = args.indexOf("--provider");
	const llamaGuardProvider = providerIdx > -1 ? (args[providerIdx + 1] as "groq" | "ollama") : "groq";
	const debug = args.includes("--debug");
	const concurrencyIdx = args.indexOf("--concurrency");
	const concurrency = concurrencyIdx > -1 ? parseInt(args[concurrencyIdx + 1]) : CONCURRENCY;

	const finalSubset = quick ? 20 : subset;

	if (quick) console.log("\n⚡ Quick mode: 5 samples per category");
	console.log(`🚀 Parallelism: ${concurrency} concurrent requests`);

	if (includeLlamaGuard || llamaGuardOnly) {
		console.log(`🦙 Llama Guard enabled (provider: ${llamaGuardProvider})`);
		if (llamaGuardProvider === "groq" && !process.env.GROQ_API_KEY) {
			console.error("❌ GROQ_API_KEY environment variable not set");
			process.exit(1);
		}
	}

	await run({ subset: finalSubset, includeLlamaGuard, llamaGuardProvider, llamaGuardOnly, debug, concurrency });
}

export { run as runEvaluation, evalMethod as evaluateMethod, print as printResults };
