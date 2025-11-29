import type { QueryDataPoint } from "./types";

const CSV_PATH = "./data/queries.csv";

function parseCSV(text: string): QueryDataPoint[] {
	const lines = text.trim().split("\n");
	const out: QueryDataPoint[] = [];

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];
		const last = line.lastIndexOf(",");
		const secondLast = line.lastIndexOf(",", last - 1);

		out.push({
			id: `q${String(i).padStart(3, "0")}`,
			query: line.slice(0, secondLast),
			category: line.slice(secondLast + 1, last) as QueryDataPoint["category"],
			expectedDecision: line.slice(last + 1) as "PASS" | "BLOCK",
		});
	}
	return out;
}

export async function generateDataset() {
	return parseCSV(await Bun.file(CSV_PATH).text());
}

export async function saveDataset(path: string) {
	const data = await generateDataset();
	await Bun.write(path, JSON.stringify(data, null, 2));

	const c = data.filter((d) => d.category === "core_domain").length;
	const a = data.filter((d) => d.category === "adjacent_domain").length;
	const g = data.filter((d) => d.category === "general_chat").length;
	const x = data.filter((d) => d.category === "adversarial").length;

	console.log(`\nLoaded ${data.length} queries from ${CSV_PATH}`);
	console.log(`  Core: ${c}, Adjacent: ${a}, General: ${g}, Adversarial: ${x}`);
	console.log(`  Saved to: ${path}\n`);
}

if (import.meta.main) {
	await saveDataset(process.argv[2] || "./data/dataset.json");
}
