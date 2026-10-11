import assert from "node:assert/strict";
import test from "node:test";
import { filterPiModels, piScopeAvailability, parsePiModelListScope } from "../src/lib/pi-model-filter.ts";

const models = [
	{ id: "same", name: "Fast Model", provider: "alpha", scopeOrder: 2 },
	{ id: "same", name: "Deep Model", provider: "beta", scopeOrder: 0 },
	{ id: "other", name: "Outside", provider: "alpha", scopeOrder: null },
];

test("scoped filtering includes zero, orders by Pi scope, and never mutates the catalog", () => {
	const original = structuredClone(models);
	assert.deepEqual(filterPiModels(models, "scoped", ""), [models[1], models[0]]);
	assert.deepEqual(models, original);
});
test("all keeps catalog order and duplicate IDs from different providers", () => {
	assert.deepEqual(filterPiModels(models, "all", ""), models);
	assert.deepEqual(filterPiModels(models, "all", " SAME   BETA "), [models[1]]);
});
test("matches name, ID and provider with AND semantics", () => {
	assert.deepEqual(filterPiModels(models, "all", "fast ALPHA"), [models[0]]);
	assert.deepEqual(filterPiModels(models, "scoped", "outside"), []);
	assert.deepEqual(filterPiModels(models, "all", "fast beta"), []);
});
test("empty and unknown scopes do not fall back to all", () => {
	const empty = [{ ...models[0], scopeOrder: null }];
	const unknown = [{ id: "x", name: "x", provider: "x" }];
	assert.equal(piScopeAvailability(empty), "empty");
	assert.equal(piScopeAvailability(unknown), "unknown");
	assert.equal(piScopeAvailability([]), "unknown");
	assert.equal(piScopeAvailability(models), "available");
	assert.deepEqual(filterPiModels(unknown, "scoped", ""), []);
	assert.deepEqual(filterPiModels(empty, "scoped", ""), []);
});
test("rejects corrupt scope numbers and stored preferences", () => {
	for (const scopeOrder of [NaN, Infinity, -1]) {
		assert.deepEqual(filterPiModels([{ ...models[0], scopeOrder }], "scoped", ""), []);
	}
	assert.equal(parsePiModelListScope("scoped"), "scoped");
	assert.equal(parsePiModelListScope("all"), "all");
	assert.equal(parsePiModelListScope("invalid"), null);
});
