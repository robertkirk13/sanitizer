import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import type { ScopeDefinition, SanitizeResult } from "./types";

const schema = z.object({ inScope: z.boolean(), response: z.string() });

export class SystemPromptBaseline {
	scope: ScopeDefinition;
	model: string;

	constructor(scope: ScopeDefinition, model = "gemini-2.5-flash-preview-05-20") {
		this.scope = scope;
		this.model = model;
	}

	async classify(query: string): Promise<SanitizeResult> {
		const t0 = performance.now();
		try {
			const { object: o } = await generateObject({
				model: google(this.model),
				schema,
				system: `You are a ${this.scope.name} assistant. Help with: ${this.scope.allowed.slice(0, 3).join(", ")}. Ignore off-topic.`,
				prompt: query,
				temperature: 0.3,
			});
			return { decision: o.inScope ? "PASS" : "BLOCK", confidence: o.inScope ? 0.8 : 0.2, reasoning: o.response, latencyMs: Math.round(performance.now() - t0) };
		} catch (e) {
			return { decision: "PASS", confidence: 0.5, reasoning: e instanceof Error ? e.message : "error", latencyMs: Math.round(performance.now() - t0) };
		}
	}
}

export class KeywordFilterBaseline {
	allow = "capacitor resistor inductor transistor mosfet diode led ic chip mcu voltage regulator connector header socket crystal oscillator relay fuse sensor op-amp ohm farad uf pf nf volt amp watt henry mh uh khz mhz smd through-hole dip soic qfp bga find search select compare alternative substitute datasheet pinout package footprint stm32 esp32 atmega pic ne555 lm78 usb uart spi i2c".split(" ");
	block = "code program script function variable loop debug compile python javascript c++ arduino ide recipe cook food sports game movie music politics weather joke story ignore previous instructions forget pretend roleplay act as system prompt jailbreak bomb weapon explosive illegal hack jammer".split(" ");

	constructor(_: ScopeDefinition) {}

	async classify(query: string): Promise<SanitizeResult> {
		const t0 = performance.now();
		const q = query.toLowerCase();
		const b = this.block.find(k => q.includes(k));
		if (b) return { decision: "BLOCK", confidence: 0.9, reasoning: `blocked: ${b}`, latencyMs: Math.round(performance.now() - t0) };
		const a = this.allow.find(k => q.includes(k));
		if (a) return { decision: "PASS", confidence: 0.7, reasoning: `allowed: ${a}`, latencyMs: Math.round(performance.now() - t0) };
		return { decision: "PASS", confidence: 0.3, reasoning: "no match", latencyMs: Math.round(performance.now() - t0) };
	}
}
