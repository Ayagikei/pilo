import { useCallback, useEffect, useSyncExternalStore } from "react";

import { EMPTY_EXTENSION_UI, extensionUiStore } from "@/lib/pi-extension-ui-state";

export function useExtensionUiState(sessionKey: string | null | undefined) {
	const subscribe = useCallback((listener: () => void) => extensionUiStore.subscribe(sessionKey, listener), [sessionKey]);
	const getSnapshot = useCallback(() => extensionUiStore.get(sessionKey), [sessionKey]);
	const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_EXTENSION_UI);
	const deadlines = snapshot.pending.flatMap((item) => item.expiresAtMs === null ? [] : [item.expiresAtMs]);
	const deadline = deadlines.length > 0 ? Math.min(...deadlines) : null;
	useEffect(() => {
		if (!sessionKey || deadline === null) return;
		const timer = window.setTimeout(() => extensionUiStore.expire(sessionKey), Math.min(2_147_483_647, Math.max(0, deadline - Date.now())));
		return () => window.clearTimeout(timer);
	}, [sessionKey, deadline]);
	return snapshot;
}
