import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { extensionUiStore, validExtensionResponse, type ExtensionRequest, type ExtensionResponse } from "@/lib/pi-extension-ui-state";
import { useExtensionUiState } from "./use-extension-ui-state";

export function usePiExtensionDialog({ sessionKey, send, exclude }: {
	sessionKey: string | null;
	send: (request: ExtensionRequest, response: ExtensionResponse) => Promise<void>;
	exclude: (request: ExtensionRequest) => unknown;
}) {
	const { t } = useTranslation();
	const snapshot = useExtensionUiState(sessionKey);
	const now = Date.now();
	const request = snapshot.pending.find((item) => !exclude(item.request) && (item.expiresAtMs === null || item.expiresAtMs > now))?.request ?? null;
	const respond = useCallback(async (response: ExtensionResponse) => {
		if (!sessionKey || !request || !validExtensionResponse(request, response)) return;
		if (!extensionUiStore.claim(sessionKey, request.generation, request.id)) return;
		try {
			await send(request, response);
			extensionUiStore.settle(sessionKey, request.generation, request.id);
		} catch (error) {
			// Do not auto-retry an approval after an uncertain transport failure.
			extensionUiStore.release(sessionKey, request.generation, request.id);
			toast.error(t("chat.respondExtensionFailed"), { description: String(error instanceof Error ? error.message : error) });
		}
	}, [sessionKey, request, send, t]);
	return { request, respond };
}
