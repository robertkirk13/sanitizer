import { InputSanitizer } from "./sanitizer";
import { SystemPromptBaseline, KeywordFilterBaseline } from "./baselines";
import { generateDataset } from "./generate-dataset";
import type { QueryDataPoint, SanitizeResult, EvaluationResult, ScopeDefinition } from "./types";

async function evalMethod(name: string, fn: (q: string) => Promise<SanitizeResult>, data: QueryDataPoint[]) {
	const results: { q: QueryDataPoint; r: SanitizeResult; ok: boolean }[] = [];
	for (let i = 0; i < data.length; i++) {
		process.stdout.write(`\r  ${i + 1}/${data.length}`);
		try {
			const r = await fn(data[i].query);
			results.push({ q: data[i], r, ok: r.decision === data[i].expectedDecision });
			if (name !== "Keywords") await new Promise(r => setTimeout(r, 100));
		} catch {
			results.push({ q: data[i], r: { decision: "BLOCK", confidence: 0, reasoning: "err", latencyMs: 0 }, ok: false });
		}
	}

	const cats = ["core_domain", "adjacent_domain", "general_chat", "adversarial"] as const;
	const catStats = cats.map(c => {
		const d = results.filter(x => x.q.category === c);
		const blocked = d.filter(x => x.r.decision === "BLOCK").length;
		return { category: c, total: d.length, blocked, passed: d.length - blocked, blockRate: d.length ? blocked / d.length : 0, accuracy: d.length ? d.filter(x => x.ok).length / d.length : 0 };
	});

	const core = results.filter(x => x.q.category === "core_domain");
	const shouldBlock = results.filter(x => x.q.expectedDecision === "BLOCK");
	const lats = results.map(x => x.r.latencyMs);

	return {
		results,
		eval: {
			method: name, totalQueries: data.length, results: catStats,
			metrics: {
				falsePositiveRate: core.length ? core.filter(x => x.r.decision === "BLOCK").length / core.length : 0,
				leakageRate: shouldBlock.length ? shouldBlock.filter(x => x.r.decision === "PASS").length / shouldBlock.length : 0,
				avgLatencyMs: Math.round(lats.reduce((a, b) => a + b, 0) / lats.length),
			},
		} as EvaluationResult,
	};
}

function print(evals: EvaluationResult[]) {
	console.log("\n" + "=".repeat(80) + "\nRESULTS\n" + "=".repeat(80));
	const cats = { core_domain: "Core (Valid)", adjacent_domain: "Adjacent", general_chat: "General", adversarial: "Adversarial" };
	for (const [k, label] of Object.entries(cats)) {
		const row = [label.padEnd(15)];
		for (const e of evals) {
			const c = e.results.find(r => r.category === k);
			row.push(c ? `${(c.blockRate * 100).toFixed(0)}%`.padEnd(12) : "N/A");
		}
		console.log(row.join(" "));
	}
	console.log("\nFPR: " + evals.map(e => `${e.method}: ${(e.metrics.falsePositiveRate * 100).toFixed(1)}%`).join(", "));
	console.log("Leak: " + evals.map(e => `${e.method}: ${(e.metrics.leakageRate * 100).toFixed(1)}%`).join(", "));
	console.log("Latency: " + evals.map(e => `${e.method}: ${e.metrics.avgLatencyMs}ms`).join(", "));
}

async function run(subset?: number) {
	const scope: ScopeDefinition = await Bun.file("./scopes/pcb-component-search.json").json();
	let data = await generateDataset();
	if (subset) {
		const n = Math.floor(subset / 4);
		data = [...data.filter(d => d.category === "core_domain").slice(0, n), ...data.filter(d => d.category === "adjacent_domain").slice(0, n), ...data.filter(d => d.category === "general_chat").slice(0, n), ...data.filter(d => d.category === "adversarial").slice(0, n)];
	}
	console.log(`\nEvaluating on ${data.length} queries...`);

	const methods = [
		{ name: "SysPrompt", fn: (q: string) => new SystemPromptBaseline(scope).classify(q) },
		{ name: "Keywords", fn: (q: string) => new KeywordFilterBaseline(scope).classify(q) },
		{ name: "Sanitizer", fn: (q: string) => new InputSanitizer(scope).classify(q) },
	];

	const evals: EvaluationResult[] = [];
	for (const m of methods) {
		console.log(`\n${m.name}:`);
		const { eval: e } = await evalMethod(m.name, m.fn, data);
		evals.push(e);
	}
	print(evals);
}

if (import.meta.main) {
	const i = process.argv.indexOf("--subset");
	await run(i > -1 ? parseInt(process.argv[i + 1]) : undefined);
}

export { run as runEvaluation, evalMethod as evaluateMethod, print as printResults };
