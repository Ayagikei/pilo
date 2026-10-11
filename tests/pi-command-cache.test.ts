import assert from "node:assert/strict";
import test from "node:test";
import { createPiCommandCache, commandScopeMatches, isPiUiResponse } from "../src/lib/pi-command-cache.ts";

test("shares in-flight loads and caches until TTL", async () => {
	let calls = 0, now = 1;
	const cache = createPiCommandCache(async () => { calls++; return ["first"]; }, () => now, 100);
	const first = cache.load();
	assert.equal(cache.load(), first);
	await first;
	await cache.load();
	assert.equal(calls, 1);
	now += 101;
	await cache.load();
	assert.equal(calls, 2);
	await cache.load(true);
	assert.equal(calls, 3);
});
test("late results after invalidation cannot repopulate commands", async () => {
	let resolve!: (value: string[]) => void;
	const cache = createPiCommandCache(() => new Promise<string[]>((done) => { resolve = done; }));
	const pending = cache.load();
	await Promise.resolve();
	cache.invalidate();
	resolve(["stale"]);
	assert.equal(await pending, null);
	assert.equal(cache.get().loaded, false);
	assert.deepEqual(cache.get().commands, []);
});
test("failed refresh preserves old list and can be retried", async () => {
	let fail = false;
	const cache = createPiCommandCache(async () => { if (fail) throw new Error("offline"); return ["ok"]; });
	await cache.load(); fail = true;
	assert.equal(await cache.load(true), null);
	assert.deepEqual(cache.get().commands, ["ok"]);
	assert.equal(cache.get().error, "offline");
	fail = false;
	assert.deepEqual(await cache.load(true), ["ok"]);
});
test("command refresh events respect session and project boundaries", () => {
	assert.equal(commandScopeMatches("p1", '["p1","s1"]'), true);
	assert.equal(commandScopeMatches('["p1","s1"]', '["p1","s1"]'), true);
	assert.equal(commandScopeMatches('["p1","s1"]', '["p1","s2"]'), false);
	assert.equal(commandScopeMatches("p2", '["p1","s1"]'), false);
	assert.equal(commandScopeMatches("p1", "invalid"), false);
});
test("UI response classification preserves raw ID and forbids missing ID", () => {
	const command = { type: "extension_ui_response", id: "plugin-request-7", confirmed: false };
	assert.equal(isPiUiResponse(command), true);
	assert.equal(command.id, "plugin-request-7");
	assert.throws(() => isPiUiResponse({ type: "extension_ui_response" }));
	assert.equal(isPiUiResponse({ type: "get_state" }), false);
});
