import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatSessionRuntimeState } from "@/components/chat/chat-page-utils";
import type { PiAgentState, PiModel, PiSessionStats, PiThinkingLevel } from "@/lib/pi-runtime";
import { mergePiModelMetadata } from "@/lib/pi-model-metadata";
import type { SessionIndexEntry } from "@/lib/sessions";
import type { RemoteRpc } from "./use-remote-chat-transport";
import type { WebPiloClient } from "./web-pilo-client";

type Options = { client: WebPiloClient | null; rpc: RemoteRpc; activeProjectId: string; draftId: string; selectedSession: SessionIndexEntry | null };

export function useRemoteChatAgentConfig({ client, rpc, activeProjectId, draftId, selectedSession }: Options) {
	const [agentState, setAgentState] = useState<PiAgentState | null>(null);
	const [chatState, setChatState] = useState<ChatSessionRuntimeState | null>(null);
	const [models, setModels] = useState<PiModel[]>([]);
	const [modelLoading, setModelLoading] = useState(false);
	const [thinkingLevels, setThinkingLevels] = useState<PiThinkingLevel[]>([]);
	const [draftModel, setDraftModel] = useState<PiModel | null>(null);
	const [draftThinkingLevel, setDraftThinkingLevel] = useState<PiThinkingLevel | null>(null);
	const draftCatalogRequestRef = useRef(0);
	const liveRequestRef = useRef(0);
	const sessionPath = selectedSession?.sessionPath ?? null;
	useEffect(() => () => { draftCatalogRequestRef.current += 1; liveRequestRef.current += 1; }, [activeProjectId, sessionPath, draftId]);

	const refreshAgentConfig = useCallback(async () => {
		const requestId = ++liveRequestRef.current;
		setModelLoading(true);
		try {
			const [state, modelResult, thinkingResult, stats, cached] = await Promise.all([
				rpc<PiAgentState>({ type: "get_state" }),
				rpc<{ models: PiModel[] }>({ type: "get_available_models" }),
				rpc<{ levels: PiThinkingLevel[] }>({ type: "get_available_thinking_levels" }),
				rpc<PiSessionStats>({ type: "get_session_stats" }),
				client?.loadModels(activeProjectId).catch(() => null) ?? Promise.resolve(null),
			]);
			if (liveRequestRef.current !== requestId) return;
			setAgentState(state);
			setModels(mergePiModelMetadata(modelResult.models, cached?.models ?? []));
			setThinkingLevels(thinkingResult.levels);
			setChatState({ name: state.sessionName, tokens: stats.tokens, cost: stats.cost, contextTokens: stats.contextUsage?.tokens, contextWindow: stats.contextUsage?.contextWindow, contextPercent: stats.contextUsage?.percent });
		} catch {
			// Keep the last usable catalog when an optional metadata request fails.
		} finally { if (liveRequestRef.current === requestId) setModelLoading(false); }
	}, [rpc, client, activeProjectId]);

	const loadDraftCatalog = useCallback((projectId: string) => {
		const requestId = ++draftCatalogRequestRef.current;
		setModelLoading(true);
		return (client?.loadModels(projectId) ?? Promise.resolve(null)).then((catalog) => {
			if (draftCatalogRequestRef.current !== requestId || !catalog) return;
			setModels(catalog.models);
			setDraftModel((current) => current ?? catalog.defaultModel);
			setDraftThinkingLevel((current) => current ?? catalog.defaultThinkingLevel);
		}).catch((error) => {
			if (draftCatalogRequestRef.current === requestId) console.warn("Failed to load remote model catalog", error);
		}).finally(() => { if (draftCatalogRequestRef.current === requestId) setModelLoading(false); });
	}, [client]);

	/* oxlint-disable react/set-state-in-effect -- Explicit draft selection preloads the host catalog. */
	useEffect(() => {
		void draftId;
		if (selectedSession || !activeProjectId) return;
		void loadDraftCatalog(activeProjectId);
		return () => { draftCatalogRequestRef.current += 1; };
	}, [activeProjectId, draftId, loadDraftCatalog, selectedSession]);
	/* oxlint-enable react/set-state-in-effect */
	return { agentState, setAgentState, chatState, setChatState, models, setModels, modelLoading, thinkingLevels, setThinkingLevels, draftModel, setDraftModel, draftThinkingLevel, setDraftThinkingLevel, refreshAgentConfig, loadDraftCatalog };
}
