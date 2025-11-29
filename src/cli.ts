#!/usr/bin/env bun
import { createSanitizer } from "./sanitizer";

const HELP = `Usage: bun run sanitize <query> [options]
  -i          interactive mode
  --batch     process file
   --scope     scope json
  --threshold classification threshold
  --refusal   generate refusals
  --json      json output`;

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
	console.log(HELP);
	process.exit(0);
}

const get = (flag: string) => {
	const i = args.indexOf(flag);
	return i > -1 ? args[i + 1] : null;
};
const has = (flag: string) => args.includes(flag);

const scope = get("--scope") || "./scopes/pcb-component-search.json";
const threshold = parseFloat(get("--threshold") || "0.5");
const query = args.find(
	(a) =>
		!a.startsWith("-") &&
		a !== get("--scope") &&
		a !== get("--batch") &&
		a !== get("--threshold"),
);

type Result = Awaited<
	ReturnType<typeof import("./sanitizer").InputSanitizer.prototype.sanitize>
>;

function print(r: Result) {
	if (has("--json")) {
		console.log(JSON.stringify(r, null, 2));
		return;
	}
	console.log(
		`\n[${r.decision}] ${(r.confidence * 100).toFixed(1)}% | ${r.latencyMs}ms\n${r.reasoning}`,
	);
	if (r.refusal) console.log(`\nRefusal: ${r.refusal.message}`);
	console.log();
}

if (has("-i")) {
	// interactive
	const sanitizer = await createSanitizer(scope);
	console.log("Ready. 'quit' to exit");
	const rl = require("readline").createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	const go = () =>
		rl.question("> ", async (q: string) => {
			if (q === "quit") {
				rl.close();
				return;
			}
			if (q)
				print(
					await sanitizer.sanitize(q, {
						threshold,
						generateRefusal: has("--refusal"),
					}),
				);
			go();
		});
	go();
} else if (get("--batch")) {
	// batch
	const sanitizer = await createSanitizer(scope);
	const qs = (await Bun.file(get("--batch") as string).text())
		.split("\n")
		.filter(Boolean);
	for (const q of qs) {
		const r = await sanitizer.sanitize(q.trim(), {
			threshold,
			generateRefusal: has("--refusal"),
		});
		console.log(`[${r.decision}] ${q.slice(0, 60)}`);
	}
} else if (query) {
	// single
	const sanitizer = await createSanitizer(scope);
	print(
		await sanitizer.sanitize(query, {
			threshold,
			generateRefusal: has("--refusal"),
		}),
	);
} else {
	console.log(HELP);
}
