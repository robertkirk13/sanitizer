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
