import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";

import { workspaceCopy } from "@/i18n/workspace-enhancements";
import { useChatWorkspaceScope } from "./chat-workspace-scope";
import { useExtensionUiState } from "./use-extension-ui-state";
import { Button } from "@/ui";

export const REFRESH_PI_COMMANDS_EVENT = "pilo:refresh-pi-commands";

export function PiExtensionPanels({ placement }: { placement: "aboveEditor" | "belowEditor" }) {
	const scope = useChatWorkspaceScope();
	const snapshot = useExtensionUiState(scope.sessionKey);
	const { i18n } = useTranslation();
	const copy = workspaceCopy(i18n.language);
	useEffect(() => {
		if (placement !== "aboveEditor" || !scope.active || !snapshot.title) return;
		const previous = document.title;
		const title = `${snapshot.title} · Pilo`;
		document.title = title;
		return () => { if (document.title === title) document.title = previous; };
	}, [placement, scope.active, snapshot.title]);
	if (!scope.active || !scope.sessionKey) return null;
	const widgets = [...snapshot.widgets.values()].filter((widget) => widget.placement === placement);
	return (
		<div className="my-1 space-y-1">
			{placement === "aboveEditor" ? (
				<div className="flex min-h-7 items-center gap-2 text-xs text-muted-foreground">
					<div role="status" aria-label={copy.extensionStatus} className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1">
						{snapshot.title ? <span className="max-w-64 truncate font-medium" title={snapshot.title}>{snapshot.title}</span> : null}
						{[...snapshot.statuses].map(([key, text]) => <span key={key} title={`${key}: ${text}`} className="max-w-64 truncate">{text}</span>)}
						{snapshot.pending.length > 0 ? <span className="font-medium">{copy.waiting} ({snapshot.pending.length})</span> : null}
					</div>
					<Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label={copy.refreshCommands} title={copy.refreshCommands} onClick={() => window.dispatchEvent(new CustomEvent(REFRESH_PI_COMMANDS_EVENT, { detail: { sessionKey: scope.sessionKey } }))}><RefreshCw className="size-3.5" /></Button>
				</div>
			) : null}
			{widgets.map((widget) => (
				<details key={widget.key} open className="rounded-lg border bg-muted/20 px-3 py-2">
					<summary className="cursor-pointer truncate text-xs font-medium" title={widget.key}>{widget.key || copy.extensionWidget}</summary>
					<pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5">{widget.lines.join("\n")}</pre>
				</details>
			))}
		</div>
	);
}
