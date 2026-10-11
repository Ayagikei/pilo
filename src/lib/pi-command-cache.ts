export const REFRESH_PI_COMMANDS_EVENT = "pilo:refresh-pi-commands";
export const PI_RUNTIME_CHANGED_EVENT = "pilo:pi-runtime-changed";

export type CommandCatalogSnapshot<T> = {
	commands: readonly T[];
	loaded: boolean;
	loading: boolean;
	error: string | null;
};

export function createPiCommandCache<T>(loader: () => Promise<readonly T[]>, clock = Date.now, ttl = 30_000) {
	let snapshot: CommandCatalogSnapshot<T> = { commands: [], loaded: false, loading: false, error: null };
	let refreshedAt = 0;
	let epoch = 0;
	let pending: Promise<readonly T[] | null> | null = null;
	const listeners = new Set<() => void>();
	const publish = (next: CommandCatalogSnapshot<T>) => { snapshot = next; for (const listener of listeners) listener(); };
	return {
		get: () => snapshot,
		subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
		invalidate() {
			epoch += 1; pending = null; refreshedAt = 0;
			publish({ ...snapshot, loaded: false, loading: false });
		},
		load(force = false): Promise<readonly T[] | null> {
			if (pending) return pending;
			if (!force && snapshot.loaded && clock() - refreshedAt < ttl) return Promise.resolve(snapshot.commands);
			const version = ++epoch;
			publish({ ...snapshot, loading: true, error: null });
			const work = Promise.resolve().then(loader).then((commands) => {
				if (version !== epoch) return null;
				refreshedAt = clock();
				publish({ commands, loaded: true, loading: false, error: null });
				return commands;
			}).catch((error) => {
				if (version === epoch) publish({ ...snapshot, loading: false, error: String(error instanceof Error ? error.message : error) });
				return null;
			}).finally(() => { if (version === epoch) pending = null; });
			pending = work;
			return work;
		},
	};
}

export function commandScopeMatches(scope: string | null, target: unknown): boolean {
	if (!scope || typeof target !== "string") return false;
	if (scope === target) return true;
	try {
		const parts: unknown = JSON.parse(target);
		return Array.isArray(parts) && parts[0] === scope;
	} catch { return false; }
}

/** Pi UI responses preserve the extension request ID and have no RPC response. */
export function isPiUiResponse(command: Record<string, unknown>): boolean {
	if (command.type !== "extension_ui_response") return false;
	if (typeof command.id !== "string" || command.id.length === 0) throw new Error("Missing extension request ID");
	return true;
}
