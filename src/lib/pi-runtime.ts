import * as core from "./pi-runtime-core";
import { extensionUiStore } from "./pi-extension-ui-state";
import { PI_RUNTIME_CHANGED_EVENT } from "./pi-command-cache";
import type { PiloRuntimeEvent } from "./pi-runtime-types";

export * from "./pi-runtime-core";

let extensionBridge: Promise<void> | null = null;
function ensureExtensionBridge(): Promise<void> {
	if (extensionBridge) return extensionBridge;
	extensionBridge = core.listenRuntimeEvents((event) => {
		extensionUiStore.ingest(event);
		if (event.type === "process_state" && (event.state === "stopped" || event.state === "failed")) {
			window.dispatchEvent(new CustomEvent(PI_RUNTIME_CHANGED_EVENT, { detail: { sessionKey: event.sessionKey } }));
		}
	}).then(() => undefined).catch((error) => { extensionBridge = null; throw error; });
	return extensionBridge;
}

export function primeRuntimeEventChannel() {
	void ensureExtensionBridge().catch(() => undefined);
}

export async function listenRuntimeEvents(handler: (event: PiloRuntimeEvent) => void, scope?: { sessionKey: string | undefined }): Promise<() => void> {
	await ensureExtensionBridge();
	return core.listenRuntimeEvents(handler, scope);
}
