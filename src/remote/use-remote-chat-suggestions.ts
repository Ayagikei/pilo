import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { piSessionSuggestions, type ComposerSuggestion } from "@/components/chat/chat-composer-suggestions";
import { createFileSuggestions } from "@/components/chat/chat-file-suggestions";
import { usePiCommandCatalog } from "@/components/chat/use-pi-command-catalog";
import type { PiCommand } from "@/lib/pi-runtime";
import type { WebPiloClient } from "./web-pilo-client";

type Options = {
	client: WebPiloClient | null;
	activeProjectId: string;
	readOnly: boolean;
	ensureDraftRuntime: () => Promise<void>;
	rpc: <T>(command: Record<string, unknown>, timeoutMs?: number) => Promise<T>;
};

export function useRemoteChatSuggestions({ client, activeProjectId, readOnly, ensureDraftRuntime, rpc }: Options) {
	const { t } = useTranslation();
	const [fileSuggestions, setFileSuggestions] = useState<ComposerSuggestion[]>([]);
	const timer = useRef<number | null>(null);
	const sequence = useRef(0);
	const load = useCallback(async () => { await ensureDraftRuntime(); return rpc<{ commands: PiCommand[] }>({ type: "get_commands" }); }, [ensureDraftRuntime, rpc]);
	const catalog = usePiCommandCatalog({ scopeKey: activeProjectId, load, readOnly });
	const handleSuggestionTrigger = useCallback((trigger: "@" | "/" | null, query: string) => {
		const request = ++sequence.current;
		if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
		if (trigger === "/") { setFileSuggestions([]); void catalog.loadCommands(); return; }
		if (trigger !== "@" || !client || !activeProjectId || readOnly) { setFileSuggestions([]); return; }
		const normalized = query.trim();
		timer.current = window.setTimeout(() => {
			timer.current = null;
			void client.searchFiles(activeProjectId, normalized).then((paths) => {
				if (sequence.current === request) setFileSuggestions(createFileSuggestions(paths, normalized));
			}).catch((error) => {
				if (sequence.current !== request) return;
				console.warn("Failed to load remote file suggestions", error); setFileSuggestions([]);
			});
		}, 120);
	}, [activeProjectId, client, catalog.loadCommands, readOnly]);
	useEffect(() => () => { sequence.current += 1; if (timer.current !== null) window.clearTimeout(timer.current); }, [activeProjectId]);
	const composerSuggestions = useMemo(() => [...fileSuggestions, ...piSessionSuggestions(t), ...catalog.commandSuggestions], [catalog.commandSuggestions, fileSuggestions, t]);
	return { composerSuggestions, handleSuggestionTrigger, loadExtensionCommandNames: catalog.loadExtensionCommandNames };
}
