import assert from "node:assert/strict";
import test from "node:test";
import { createExtensionUiStore, extensionRequestDeadline, filterExtensionOptions, validExtensionResponse, type ExtensionRequest } from "../src/lib/pi-extension-ui-state.ts";

function request(overrides: Partial<ExtensionRequest> = {}): ExtensionRequest {
	return { type: "extension_ui_request", sessionKey: "session-a", generation: 1, id: "r1", method: "confirm", title: "Confirm", message: null, options: [], placeholder: null, prefill: null, timeout: null, notifyType: null, statusKey: null, statusText: null, widgetKey: null, widgetLines: null, widgetPlacement: null, text: null, ...overrides };
}

test("keyed statuses update and clear without prototype-sensitive objects", () => {
	const store = createExtensionUiStore();
	store.ingest(request({ method: "setStatus", statusKey: "__proto__", statusText: "ready" }));
	assert.equal(store.get("session-a").statuses.get("__proto__"), "ready");
	store.ingest(request({ method: "setStatus", statusKey: "__proto__", statusText: null }));
	assert.equal(store.get("session-a").statuses.size, 0);
});
test("widgets honor placement, replace by key, and clear", () => {
	const store = createExtensionUiStore();
	store.ingest(request({ method: "setWidget", widgetKey: "plan", widgetLines: ["one"], widgetPlacement: "belowEditor" }));
	assert.equal(store.get("session-a").widgets.get("plan")?.placement, "belowEditor");
	store.ingest(request({ method: "setWidget", widgetKey: "plan", widgetLines: ["two"] }));
	assert.deepEqual(store.get("session-a").widgets.get("plan")?.lines, ["two"]);
	store.ingest(request({ method: "setWidget", widgetKey: "plan", widgetLines: null }));
	assert.equal(store.get("session-a").widgets.size, 0);
});
test("isolates sessions and rejects late events from earlier generations", () => {
	const store = createExtensionUiStore();
	store.ingest(request({ method: "setTitle", title: "A" }));
	store.ingest(request({ sessionKey: "session-b", method: "setTitle", title: "B" }));
	store.ingest(request({ generation: 2, method: "setTitle", title: "new" }));
	store.ingest(request({ method: "setTitle", title: "late" }));
	assert.equal(store.get("session-a").title, "new");
	assert.equal(store.get("session-b").title, "B");
});
test("process exit clears interaction and persistent UI until a new generation", () => {
	const store = createExtensionUiStore();
	store.ingest(request());
	store.ingest({ type: "process_state", sessionKey: "session-a", generation: 1, state: "stopped" });
	store.ingest(request({ id: "late" }));
	assert.equal(store.get("session-a").pending.length, 0);
	store.ingest(request({ generation: 2 }));
	assert.equal(store.get("session-a").pending.length, 1);
});
test("deadlines begin on receipt, not when a queued dialog becomes visible", () => {
	const store = createExtensionUiStore();
	store.ingest(request(), 1000);
	store.ingest(request({ id: "queued", timeout: 50 }), 1000);
	store.expire("session-a", 1050);
	assert.deepEqual(store.get("session-a").pending.map((item) => item.request.id), ["r1"]);
	store.ingest(request({ id: "queued", timeout: 50 }), 1100);
	assert.equal(store.get("session-a").pending.length, 1);
});
test("replayed IDs do not reset timeouts or resurrect resolved requests", () => {
	const store = createExtensionUiStore();
	store.ingest(request({ timeout: 100 }), 1000);
	store.ingest(request({ timeout: 100 }), 1050);
	assert.equal(store.get("session-a").pending[0].expiresAtMs, 1100);
	store.settle("session-a", 1, "r1");
	store.ingest(request(), 1200);
	assert.equal(store.get("session-a").pending.length, 0);
});
test("only one local response may be in flight; failures can be retried explicitly", () => {
	const store = createExtensionUiStore();
	store.ingest(request());
	assert.equal(store.claim("session-a", 1, "r1"), true);
	assert.equal(store.claim("session-a", 1, "r1"), false);
	store.release("session-a", 1, "r1");
	assert.equal(store.claim("session-a", 1, "r1"), true);
	store.settle("session-a", 1, "r1");
	assert.equal(store.claim("session-a", 1, "r1"), false);
});
test("expired or wrong-generation requests cannot be approved", () => {
	const store = createExtensionUiStore();
	store.ingest(request({ timeout: 10 }), 1000);
	assert.equal(store.claim("session-a", 1, "r1", 1010), false);
	store.ingest(request({ generation: 2 }));
	assert.equal(store.claim("session-a", 1, "r1"), false);
});
test("option filtering retains exact values and original duplicate indices", () => {
	assert.deepEqual(filterExtensionOptions(["Alpha One", "Alpha One", "Beta"], " alpha ONE "), [{ value: "Alpha One", index: 0 }, { value: "Alpha One", index: 1 }]);
	assert.equal(validExtensionResponse(request({ method: "select", options: ["raw value"] }), { value: "raw value" }), true);
	assert.equal(validExtensionResponse(request({ method: "select", options: ["raw value"] }), { value: "0" }), false);
	assert.equal(validExtensionResponse(request(), { confirmed: false }), true);
	assert.equal(validExtensionResponse(request(), { value: "true" }), false);
});
test("timeout validation and empty input semantics", () => {
	assert.equal(extensionRequestDeadline(null, 10), null);
	assert.equal(extensionRequestDeadline(NaN, 10), null);
	assert.equal(extensionRequestDeadline(-1, 10), null);
	assert.equal(extensionRequestDeadline(0, 10), 10);
	assert.equal(validExtensionResponse(request({ method: "input" }), { value: "" }), true);
});

test("an explicit restart after exit accepts a recreated runtime generation", () => {
	const store = createExtensionUiStore();
	store.ingest(request({ generation: 3 }));
	store.ingest({ type: "process_state", sessionKey: "session-a", generation: 3, state: "stopped" });
	store.ingest({ type: "process_state", sessionKey: "session-a", generation: 1, state: "starting" });
	store.ingest(request({ id: "new-lifetime" }));
	assert.equal(store.get("session-a").closed, false);
	assert.equal(store.get("session-a").pending[0].request.id, "new-lifetime");
});
