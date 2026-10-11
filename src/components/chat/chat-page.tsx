import { type ComponentProps, useMemo } from "react";

import { ChatPage as ChatPageContent } from "./chat-page-content";
import { ChatWorkspaceScopeContext } from "./chat-workspace-scope";

export type { ChatSession } from "./chat-page-content";

export function ChatPage(props: ComponentProps<typeof ChatPageContent>) {
	const { session, active = true } = props;
	const scope = useMemo(() => ({
		sessionKey: JSON.stringify([session.projectRecord.id, session.id]),
		projectId: session.projectRecord.id,
		active,
	}), [session.projectRecord.id, session.id, active]);
	return <ChatWorkspaceScopeContext.Provider value={scope}><ChatPageContent {...props} /></ChatWorkspaceScopeContext.Provider>;
}
