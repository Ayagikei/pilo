import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { extensionUiStore, isExtensionDialog, type ExtensionRequest, type ExtensionResponse } from "@/lib/pi-extension-ui-state";
import { usePiSessionFeatures as useCoreFeatures, projectMcpApprovalServer } from "./use-pi-session-features-core";
import { usePiCommandCatalog } from "./use-pi-command-catalog";
import { usePiExtensionDialog } from "./use-pi-extension-dialog";

export { projectMcpApprovalServer, sameExtensionDialogRequest } from "./use-pi-session-features-core";
export type { PiExtensionDialogRequest } from "./use-pi-session-features-core";

export function usePiSessionFeatures(options: Parameters<typeof useCoreFeatures>[0]) {
	const { client, readOnly = false, onRefreshSessionState } = options;
	const { t } = useTranslation();
	const proxy = useMemo(() => ({
		...client,
		listen: (handler: Parameters<typeof client.listen>[0]) => client.listen((event) => {
			if (event.type === "extension_ui_request" && isExtensionDialog(event) && !projectMcpApprovalServer(event)) return;
			handler(event);
		}),
	}), [client]);
	// Keep the startup MCP trust/restart workaround, notification policy and
	// compaction controls. Standard dialogs use the shared generation-aware queue.
	const core = useCoreFeatures({ ...options, client: proxy });
	const send = useCallback((request: ExtensionRequest, response: ExtensionResponse) => client.respondToExtensionUi(request.id, response), [client]);
	const dialog = usePiExtensionDialog({ sessionKey: client.sessionKey, send, exclude: projectMcpApprovalServer });
	const load = useCallback(async () => { await client.ensure(); return client.getPiCommands(); }, [client]);
	const catalog = usePiCommandCatalog({ scopeKey: client.sessionKey, load, readOnly });
	const mcpResponding = useRef(false);
	const respondToExtensionDialog = useCallback(async (response: ExtensionResponse) => {
		if (readOnly) return;
		if (!core.extensionDialog) { await dialog.respond(response); return; }
		// A startup MCP request intentionally survives the failed process and
		// approves a fresh process, so it must not use the standard stale-PID guard.
		if (mcpResponding.current) return;
		mcpResponding.current = true;
		const request = core.extensionDialog;
		try { await core.respondToExtensionDialog(response); }
		finally {
			extensionUiStore.settle(client.sessionKey, request.generation, request.id);
			mcpResponding.current = false;
		}
	}, [client.sessionKey, core.extensionDialog, core.respondToExtensionDialog, dialog.respond, readOnly]);
	const tryExecuteExtensionCommand = useCallback(async (message: string) => {
		const command = message.trim();
		if (readOnly || !command.startsWith("/")) return false;
		const name = command.slice(1).split(/\s+/, 1)[0];
		const names = await catalog.loadExtensionCommandNames();
		if (names === null) {
			// Do not silently send a possible extension command to the model when
			// the command catalog could not be verified. The user may retry explicitly.
			toast.error(t("chat.readCommandsFailed"));
			return true;
		}
		if (!names.has(name)) return false;
		try {
			await client.executePiCommand(command);
			void onRefreshSessionState().catch(() => undefined);
		} catch (error) {
			toast.error(t("chat.executeExtensionFailed"), { description: String(error instanceof Error ? error.message : error) });
		}
		return true;
	}, [catalog.loadExtensionCommandNames, client, onRefreshSessionState, readOnly, t]);
	return {
		...core,
		commandSuggestions: catalog.commandSuggestions,
		loadCommands: catalog.loadCommands,
		tryExecuteExtensionCommand,
		extensionDialog: core.extensionDialog ?? dialog.request,
		respondToExtensionDialog,
	};
}
