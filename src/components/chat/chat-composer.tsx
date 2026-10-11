import { type ComponentProps, useMemo } from "react";

import { ChatComposer as ComposerBody } from "./chat-composer-body";
import { ChatWorkspaceScopeContext, useChatWorkspaceScope } from "./chat-workspace-scope";
import { PiExtensionPanels } from "./pi-extension-panels";

export type { ComposerSuggestion, ComposerSuggestionKind } from "./chat-composer-body";

export function ChatComposer(props: ComponentProps<typeof ComposerBody>) {
	const inherited = useChatWorkspaceScope();
	const scope = useMemo(() => ({ ...inherited, projectId: props.historyKey ?? inherited.projectId }), [inherited, props.historyKey]);
	return (
		<ChatWorkspaceScopeContext.Provider value={scope}>
			<PiExtensionPanels placement="aboveEditor" />
			<ComposerBody {...props} />
			<PiExtensionPanels placement="belowEditor" />
		</ChatWorkspaceScopeContext.Provider>
	);
}
