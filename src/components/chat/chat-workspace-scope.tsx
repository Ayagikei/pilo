import { createContext, useContext } from "react";

export type ChatWorkspaceScope = {
	sessionKey: string | null;
	projectId: string | null;
	active: boolean;
};
export const ChatWorkspaceScopeContext = createContext<ChatWorkspaceScope>({
	sessionKey: null,
	projectId: null,
	active: true,
});
export function useChatWorkspaceScope() {
	return useContext(ChatWorkspaceScopeContext);
}
