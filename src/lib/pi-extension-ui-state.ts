import type { PiloRuntimeEvent } from "./pi-runtime-types";

export type ExtensionRequest = Extract<PiloRuntimeEvent, { type: "extension_ui_request" }>;
export type ExtensionResponse = { value?: string; confirmed?: boolean; cancelled?: boolean };
export type ExtensionWidget = { key: string; lines: string[]; placement: "aboveEditor" | "belowEditor" };
export type PendingExtensionRequest = { request: ExtensionRequest; receivedAtMs: number; expiresAtMs: number | null };
export type ExtensionUiSnapshot = {
	generation: number;
	closed: boolean;
	statuses: ReadonlyMap<string, string>;
	widgets: ReadonlyMap<string, ExtensionWidget>;
	title: string | null;
	pending: readonly PendingExtensionRequest[];
};

export const EMPTY_EXTENSION_UI: ExtensionUiSnapshot = {
	generation: -1, closed: false, statuses: new Map(), widgets: new Map(), title: null, pending: [],
};
const DIALOG_METHODS = new Set(["select", "confirm", "input", "editor"]);
export function isExtensionDialog(request: Pick<ExtensionRequest, "method">): boolean {
	return DIALOG_METHODS.has(request.method);
}
export function extensionRequestDeadline(timeout: number | null | undefined, receivedAtMs: number): number | null {
	return typeof timeout === "number" && Number.isFinite(timeout) && timeout >= 0
		? receivedAtMs + timeout : null;
}
export function filterExtensionOptions(options: readonly string[], query: string) {
	const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	// Keep original indices and strings: duplicate labels are legal in Pi.
	return options.map((value, index) => ({ value, index }))
		.filter(({ value }) => words.every((word) => value.toLowerCase().includes(word)));
}
export function validExtensionResponse(request: ExtensionRequest, response: ExtensionResponse): boolean {
	if (response.cancelled === true) return true;
	if (request.method === "confirm") return typeof response.confirmed === "boolean";
	if (typeof response.value !== "string") return false;
	return request.method !== "select" || request.options.includes(response.value);
}

/** Per-WebView ephemeral state. No extension content or approvals are persisted. */
export function createExtensionUiStore() {
	const states = new Map<string, ExtensionUiSnapshot>();
	const listeners = new Map<string, Set<() => void>>();
	const settled = new Map<string, Set<string>>();
	const responding = new Set<string>();
	const identity = (key: string, generation: number, id: string) => JSON.stringify([key, generation, id]);
	const publish = (key: string, state: ExtensionUiSnapshot) => {
		states.set(key, state);
		for (const listener of listeners.get(key) ?? []) listener();
	};
	const get = (key: string | null | undefined): ExtensionUiSnapshot => key ? states.get(key) ?? EMPTY_EXTENSION_UI : EMPTY_EXTENSION_UI;
	const remember = (key: string, id: string) => {
		const ids = settled.get(key) ?? new Set<string>();
		ids.add(id);
		while (ids.size > 2048) ids.delete(ids.values().next().value!);
		settled.set(key, ids);
	};
	const settle = (key: string, generation: number, id: string) => {
		responding.delete(identity(key, generation, id));
		const state = get(key);
		if (state.generation !== generation) return;
		remember(key, id);
		if (state.pending.some((item) => item.request.id === id)) {
			publish(key, { ...state, pending: state.pending.filter((item) => item.request.id !== id) });
		}
	};
	const expire = (key: string, now = Date.now()) => {
		const state = get(key);
		const expired = state.pending.filter((item) => item.expiresAtMs !== null && item.expiresAtMs <= now);
		if (expired.length === 0) return;
		const ids = new Set(expired.map((item) => item.request.id));
		for (const id of ids) { remember(key, id); responding.delete(identity(key, state.generation, id)); }
		publish(key, { ...state, pending: state.pending.filter((item) => !ids.has(item.request.id)) });
	};
	return {
		get,
		subscribe(key: string | null | undefined, listener: () => void) {
			if (!key) return () => {};
			const scoped = listeners.get(key) ?? new Set<() => void>();
			scoped.add(listener); listeners.set(key, scoped);
			return () => { scoped.delete(listener); if (scoped.size === 0) listeners.delete(key); };
		},
		ingest(event: PiloRuntimeEvent, now = Date.now()) {
			if (!event.sessionKey || (event.type !== "extension_ui_request" && event.type !== "process_state")) return;
			const key = event.sessionKey;
			let state = get(key);
			// Pi's legacy runtime may recreate a session object with generation 1.
			// An ordered starting event after a closed runtime begins a new lifetime.
			if (event.type === "process_state" && event.state === "starting" && state.closed) {
				settled.delete(key);
				state = { ...EMPTY_EXTENSION_UI, generation: event.generation };
			}
			if (event.generation < state.generation) return;
			if (event.generation > state.generation) {
				settled.delete(key);
				for (const token of responding) { if (token.startsWith(JSON.stringify([key]).slice(0, -1) + ",")) responding.delete(token); }
				state = { ...EMPTY_EXTENSION_UI, generation: event.generation };
			}
			if (event.type === "process_state") {
				if (event.state === "stopped" || event.state === "failed" || event.state === "stopping") {
					publish(key, { ...EMPTY_EXTENSION_UI, generation: event.generation, closed: true });
				} else publish(key, state);
				return;
			}
			if (state.closed) return;
			if (event.method === "setStatus" && event.statusKey) {
				const statuses = new Map(state.statuses);
				if (!event.statusText) statuses.delete(event.statusKey);
				else if (statuses.has(event.statusKey) || statuses.size < 64) statuses.set(event.statusKey, event.statusText.slice(0, 4096));
				publish(key, { ...state, statuses });
			} else if (event.method === "setWidget" && event.widgetKey) {
				const widgets = new Map(state.widgets);
				if (!event.widgetLines?.length) widgets.delete(event.widgetKey);
				else if (widgets.has(event.widgetKey) || widgets.size < 16) widgets.set(event.widgetKey, {
					key: event.widgetKey, lines: event.widgetLines.slice(0, 200).map((line) => line.slice(0, 2048)),
					placement: event.widgetPlacement === "belowEditor" ? "belowEditor" : "aboveEditor",
				});
				publish(key, { ...state, widgets });
			} else if (event.method === "setTitle") {
				publish(key, { ...state, title: event.title?.slice(0, 512) || null });
			} else if (isExtensionDialog(event)) {
				if (settled.get(key)?.has(event.id) || state.pending.some((item) => item.request.id === event.id)) return;
				const expiresAtMs = extensionRequestDeadline(event.timeout, now);
				if (expiresAtMs !== null && expiresAtMs <= now) { remember(key, event.id); publish(key, state); return; }
				publish(key, { ...state, pending: [...state.pending, { request: event, receivedAtMs: now, expiresAtMs }] });
			} else if (get(key) !== state) publish(key, state);
		},
		settle,
		expire,
		claim(key: string, generation: number, id: string, now = Date.now()): boolean {
			expire(key, now);
			const state = get(key);
			const token = identity(key, generation, id);
			if (state.closed || state.generation !== generation || responding.has(token) || !state.pending.some((item) => item.request.id === id)) return false;
			responding.add(token);
			return true;
		},
		release(key: string, generation: number, id: string) { responding.delete(identity(key, generation, id)); },
		clear() {
			const keys = [...states.keys()];
			states.clear(); settled.clear(); responding.clear();
			for (const key of keys) for (const listener of listeners.get(key) ?? []) listener();
		},
	};
}

export const extensionUiStore = createExtensionUiStore();
