# Input Sanitizer

Firewall for AI agents. Blocks off-topic/jailbreak queries before they hit your main model.

## Setup

```
bun install
export GOOGLE_GENERATIVE_AI_API_KEY=...
```

## Usage


```
bun run sanitize "Find me a 10uF capacitor"
bun run sanitize -i                          # interactive
bun run demo                                 # compare methods
bun run evaluate --subset 40                 # benchmark
```

## API

```ts
import { createSanitizer } from "./src";
const san = await createSanitizer("./scopes/pcb-component-search.json");
const r = await san.sanitize("query here");
// { decision: "PASS"|"BLOCK", confidence, reasoning, latencyMs }


```

## Scope format

```json
{
  "name": "My Tool",
  "description": "...",
  "allowed":  ["topic1", "topic2"],
  "forbidden": ["offtopic1"],
  "examples": { "valid": ["..."],"invalid": ["..."] }
}
```

## Dataset

`data/queries.csv` - edit to add test cases


```
query,category,expected
Find capacitor,core_domain,PASS
Write code,adjacent_domain,BLOCK
```

## Results

Block rates on 200 queries (PCB component search scope):

| Query Type | Prompting | Keywords | Ours |
|------------|-----------|----------|------|
| Core (want low) | 0% | 6% | 1% |
| Adjacent | 0% | 30% | 96% |
| General | 0% | 18% | 99% |
| Adversarial | 0% | 64% | 98% |

- FPR: 0% / 6% / 1%
- Leakage: 100% / 63% / 2%
- Latency: ~25ms / ~0ms / ~200ms
