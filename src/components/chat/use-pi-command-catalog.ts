import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { commandScopeMatches, createPiCommandCache, PI_RUNTIME_CHANGED_EVENT, REFRESH_PI_COMMANDS_EVENT } from "@/lib/pi-command-cache";
import { createPiCommandSuggestions, createPiExtensionCommandNames } from "@/lib/pi-command-suggestions";
import type { PiCommand } from "@/lib/pi-runtime";

export function usePiCommandCatalog({ scopeKey, load, readOnly = false }: {
	scopeKey: string | null;
	load: () => Promise<{ commands: PiCommand[] }>;
	readOnly?: boolean;
}) {
	const cache = useMemo(() => {
		void scopeKey;
		return createPiCommandCache<PiCommand>(async () => (await load()).commands);
	}, [load, scopeKey]);
	const snapshot = useSyncExternalStore(cache.subscribe, cache.get, cache.get);
	const loadCommands = useCallback((force = false) => readOnly ? Promise.resolve(null) : cache.load(force), [cache, readOnly]);
	const loadExtensionCommandNames = useCallback(async () => {
		// Revalidate at submission time, so a new command never becomes LLM text
		// merely because the completion list was loaded before an extension reload.
		const commands = await loadCommands(true);
		return commands ? createPiExtensionCommandNames([...commands]) : null;
	}, [loadCommands]);
	useEffect(() => {
		const matches = (event: Event) => {
			const detail: unknown = (event as CustomEvent<unknown>).detail;
			return typeof detail === "object" && detail !== null && "sessionKey" in detail && commandScopeMatches(scopeKey, detail.sessionKey);
		};
		const refresh = (event: Event) => {
			if (!matches(event) || readOnly) return;
			cache.invalidate();
			void cache.load(true).then((result) => { if (!result && cache.get().error) toast.error(cache.get().error!); });
		};
		const invalidate = (event: Event) => { if (matches(event)) cache.invalidate(); };
		window.addEventListener(REFRESH_PI_COMMANDS_EVENT, refresh);
		window.addEventListener(PI_RUNTIME_CHANGED_EVENT, invalidate);
		return () => {
			window.removeEventListener(REFRESH_PI_COMMANDS_EVENT, refresh);
			window.removeEventListener(PI_RUNTIME_CHANGED_EVENT, invalidate);
		};
	}, [cache, readOnly, scopeKey]);
	const commandSuggestions = useMemo(() => createPiCommandSuggestions([...snapshot.commands]), [snapshot.commands]);
	return { commandSuggestions, loadCommands, loadExtensionCommandNames };
}
