import { useCallback, useEffect, useRef } from "react";

import { projectMcpApprovalServer } from "@/components/chat/use-pi-session-features";
import { usePiExtensionDialog } from "@/components/chat/use-pi-extension-dialog";
import { useExtensionUiState } from "@/components/chat/use-extension-ui-state";
import { extensionUiStore, isExtensionDialog, type ExtensionRequest, type ExtensionResponse } from "@/lib/pi-extension-ui-state";
import { useRemoteExtensionUi as useCoreExtensionUi } from "./use-remote-extension-ui-core";

export function useRemoteExtensionUi(options: Parameters<typeof useCoreExtensionUi>[0]) {
	const core = useCoreExtensionUi(options);
	const { activeSessionKey, rpc } = options;
	const snapshot = useExtensionUiState(activeSessionKey);
	const send = useCallback(async (request: ExtensionRequest, response: ExtensionResponse) => {
		if (request.sessionKey !== activeSessionKey) throw new Error("The session changed; please retry in the original session.");
		await rpc<void>({ type: "extension_ui_response", id: request.id, ...response });
	}, [activeSessionKey, rpc]);
	const dialog = usePiExtensionDialog({ sessionKey: activeSessionKey, send, exclude: projectMcpApprovalServer });
	const handleExtensionRequest = useCallback((request: ExtensionRequest) => {
		if (isExtensionDialog(request) && !projectMcpApprovalServer(request)) return;
		core.handleExtensionRequest(request);
	}, [core.handleExtensionRequest]);
	const pendingMcp = snapshot.pending.find((item) => projectMcpApprovalServer(item.request))?.request;
	useEffect(() => {
		if (pendingMcp && !core.extensionDialog) core.handleExtensionRequest(pendingMcp);
	}, [pendingMcp, core.extensionDialog, core.handleExtensionRequest]);
	const mcpResponding = useRef(false);
	const respondToExtensionDialog = useCallback(async (response: ExtensionResponse) => {
		if (!core.extensionDialog) { await dialog.respond(response); return; }
		if (!activeSessionKey || mcpResponding.current) return;
		mcpResponding.current = true;
		const request = core.extensionDialog;
		try { await core.respondToExtensionDialog(response); }
		finally {
			extensionUiStore.settle(activeSessionKey, request.generation, request.id);
			mcpResponding.current = false;
		}
	}, [activeSessionKey, core.extensionDialog, core.respondToExtensionDialog, dialog.respond]);
	return { ...core, handleExtensionRequest, extensionDialog: core.extensionDialog ?? dialog.request, respondToExtensionDialog };
}
