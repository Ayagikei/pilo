import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import { useIsTouchDevice } from "./chat-composer-run-config";
import { useChatWorkspaceScope } from "./chat-workspace-scope";
import { workspaceCopy } from "@/i18n/workspace-enhancements";
import { filterExtensionOptions, type ExtensionRequest, type ExtensionResponse } from "@/lib/pi-extension-ui-state";
import { cn } from "@/lib/utils";
import { menuItemClassName, menuSurfaceClassName, menuSurfaceStyle } from "@/ui/menu-styles";
import { Button, Input, Textarea } from "@/ui";

type Props = { request: ExtensionRequest | null; onRespond: (response: ExtensionResponse) => void };

function Content({ request, onRespond }: { request: ExtensionRequest; onRespond: Props["onRespond"] }) {
	const { t, i18n } = useTranslation();
	const copy = workspaceCopy(i18n.language);
	const touch = useIsTouchDevice();
	const titleId = useId();
	const [value, setValue] = useState(request.prefill ?? "");
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const editorRef = useRef<HTMLTextAreaElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const buttons = useRef<(HTMLButtonElement | null)[]>([]);
	const options = useMemo(() => filterExtensionOptions(request.options, query), [request.options, query]);
	useEffect(() => {
		if (touch) return;
		if (request.method === "input") inputRef.current?.focus();
		else if (request.method === "editor") editorRef.current?.focus();
		else if (request.method === "select") {
			if (request.options.length > 8) searchRef.current?.focus();
			else buttons.current[0]?.focus();
		}
	}, [request.method, request.options.length, touch]);
	return (
		<div role="dialog" aria-labelledby={titleId} className={cn(menuSurfaceClassName, "mb-2 overflow-hidden p-0")} style={menuSurfaceStyle}
			onKeyDown={(event) => {
				if (event.nativeEvent.isComposing || event.keyCode === 229) return;
				if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onRespond({ cancelled: true }); }
			}}>
			<div className="flex items-start gap-2 px-4 pb-2 pt-3">
				<div className="min-w-0 flex-1"><h3 id={titleId} className="break-words text-sm font-medium">{request.title || "Pi Extension"}</h3>{request.message ? <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">{request.message}</p> : null}</div>
				<Button type="button" variant="ghost" size="icon" className={touch ? "size-11 shrink-0" : "size-7 shrink-0"} aria-label={t("common.cancel")} onClick={() => onRespond({ cancelled: true })}><X className="size-4" /></Button>
			</div>
			{request.method === "select" ? (
				<>
					{request.options.length > 8 ? <div className="px-3 pb-2"><Input ref={searchRef} aria-label={copy.searchOptions} placeholder={copy.searchOptions} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (!event.nativeEvent.isComposing && event.keyCode !== 229 && event.key === "ArrowDown") { event.preventDefault(); buttons.current[0]?.focus(); } }} /></div> : null}
					<div className="max-h-[min(45dvh,20rem)] overflow-y-auto overscroll-contain px-1 pb-1">
						{options.length === 0 ? <p role="status" className="p-4 text-center text-xs text-muted-foreground">{copy.noOptions}</p> : options.map((option, index) => (
							<button key={option.index} type="button" ref={(node) => { buttons.current[index] = node; }} onClick={() => onRespond({ value: option.value })}
								onKeyDown={(event) => {
									if (event.nativeEvent.isComposing || event.keyCode === 229) return;
									if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); buttons.current[(index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus(); }
									else if (/^[1-9]$/.test(event.key)) { const selected = options[Number(event.key) - 1]; if (selected) { event.preventDefault(); onRespond({ value: selected.value }); } }
								}}
								className={cn(menuItemClassName, "w-full gap-2 text-left focus-visible:outline-2", touch && "min-h-11")}>
								<span className="w-4 shrink-0 text-2xs text-muted-foreground">{index < 9 ? index + 1 : ""}</span><span className="min-w-0 whitespace-pre-wrap break-words">{option.value}</span>
							</button>
						))}
					</div>
				</>
			) : null}
			{request.method === "input" ? <div className="px-4 pb-3"><Input ref={inputRef} value={value} aria-label={request.title || "Pi Extension"} placeholder={request.placeholder ?? undefined} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (!event.nativeEvent.isComposing && event.keyCode !== 229 && event.key === "Enter") { event.preventDefault(); onRespond({ value }); } }} /></div> : null}
			{request.method === "editor" ? <div className="px-4 pb-3"><Textarea ref={editorRef} rows={8} value={value} aria-label={request.title || "Pi Extension"} onChange={(event) => setValue(event.target.value)} className="min-h-36 resize-y font-mono text-xs" onKeyDown={(event) => { if (!event.nativeEvent.isComposing && event.keyCode !== 229 && event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); onRespond({ value }); } }} /></div> : null}
			{request.method !== "select" ? <div className="flex justify-end gap-2 px-4 pb-3">
				<Button type="button" variant="outline" className={touch ? "min-h-11" : undefined} onClick={() => onRespond(request.method === "confirm" ? { confirmed: false } : { cancelled: true })}>{request.method === "confirm" ? t("chat.no") : t("common.cancel")}</Button>
				<Button type="button" className={touch ? "min-h-11" : undefined} onClick={() => onRespond(request.method === "confirm" ? { confirmed: true } : { value })}>{t("common.confirm")}</Button>
			</div> : null}
		</div>
	);
}

export function PiExtensionUiDialog({ request, onRespond }: Props) {
	const { active } = useChatWorkspaceScope();
	if (!request || !active) return null;
	return <Content key={`${request.sessionKey ?? ""}:${request.generation}:${request.id}`} request={request} onRespond={onRespond} />;
}
