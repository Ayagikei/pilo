import type { ComponentProps } from "react";

import { ComposerRunConfig as RunConfigPicker } from "./chat-run-config-picker";
import { useChatWorkspaceScope } from "./chat-workspace-scope";

export { useIsTouchDevice } from "./chat-run-config-picker";

export function ComposerRunConfig(props: ComponentProps<typeof RunConfigPicker>) {
	const scope = useChatWorkspaceScope();
	return <RunConfigPicker {...props} modelScopeKey={props.modelScopeKey ?? scope.projectId} />;
}
