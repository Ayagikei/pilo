import assert from "node:assert/strict";
import test from "node:test";
import { mergePiModelMetadata } from "../src/lib/pi-model-metadata.ts";

const model = { id: "one", name: "One", provider: "a", reasoning: true };

test("enriches available models without adding stale unavailable models", () => {
	const live = [model];
	const cached = [{ ...model, scopeOrder: 0 }, { ...model, id: "gone", scopeOrder: 1 }];
	const result = mergePiModelMetadata(live, cached);
	assert.equal(result.length, 1);
	assert.equal(result[0].scopeOrder, 0);
	assert.equal("scopeOrder" in model, false);
});
test("explicit live scope clearing wins over stale metadata", () => {
	const result = mergePiModelMetadata([{ ...model, scopeOrder: null }], [{ ...model, scopeOrder: 0 }]);
	assert.equal(result[0].scopeOrder, null);
});
test("provider and ID are both required to match metadata", () => {
	const result = mergePiModelMetadata([model], [{ ...model, provider: "b", scopeOrder: 0 }]);
	assert.equal(result[0].scopeOrder, undefined);
	assert.equal(result[0], model);
});
