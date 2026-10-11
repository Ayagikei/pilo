import { type ComponentPropsWithoutRef, useEffect, useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CHAT_COMPOSER_RUN_CONFIG_TRIGGER_CLASS_NAME } from "@/components/chat/chat-composer-frame";
import { PiLogo } from "@/components/pi-logo";
import { workspaceCopy } from "@/i18n/workspace-enhancements";
import {
	filterPiModels,
	isScopedPiModel,
	parsePiModelListScope,
	piScopeAvailability,
	type PiModelListScope,
} from "@/lib/pi-model-filter";
import type { PiModel, PiThinkingLevel } from "@/lib/pi-runtime";
import { cn } from "@/lib/utils";
import {
	Button,
	Popover,
	PopoverContent,
	PopoverTrigger,
	Spinner,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/ui";
import { Command, CommandInput, CommandItem, CommandList } from "@/ui/command";

const THINKING_LEVEL_LABELS: Record<PiThinkingLevel, string> = {
	off: "Off",
	minimal: "Minimal",
	low: "Low",
	medium: "Medium",
	high: "High",
	xhigh: "XHigh",
	max: "Max",
};

export function useIsTouchDevice() {
	const [touch, setTouch] = useState(
		() => typeof window !== "undefined" &&
			window.matchMedia("(hover: none) and (pointer: coarse)").matches,
	);
	useEffect(() => {
		const media = window.matchMedia("(hover: none) and (pointer: coarse)");
		const onChange = () => setTouch(media.matches);
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, []);
	return touch;
}

type ComposerRunConfigProps = {
	models: readonly PiModel[];
	selectedModel: PiModel | null;
	modelLoading: boolean;
	modelError: string | null;
	modelDisabled: boolean;
	/** Stable project/connection identity; a UI preference, never a Pi setting. */
	modelScopeKey?: string | null;
	onModelMenuOpen?: () => void;
	onModelRefresh?: () => void;
	onModelChange?: (model: PiModel | null) => void;
	thinkingLevels: readonly PiThinkingLevel[];
	selectedThinkingLevel: PiThinkingLevel | null;
	thinkingLoading: boolean;
	thinkingDisabled: boolean;
	onThinkingMenuOpen?: () => void;
	onThinkingChange?: (level: PiThinkingLevel | null) => void;
};

type RunConfigTriggerProps = {
	label: string;
	thinking: string;
} & Omit<ComponentPropsWithoutRef<"button">, "children" | "className" | "type">;

function RunConfigTrigger({ label, thinking, ...buttonProps }: RunConfigTriggerProps) {
	const { t } = useTranslation();
	return (
		<button
			{...buttonProps}
			data-chat-run-config-trigger=""
			type="button"
			aria-label={t("chat.runConfigLabel", { model: label, thinking })}
			className={CHAT_COMPOSER_RUN_CONFIG_TRIGGER_CLASS_NAME}
		>
			<PiLogo className="size-4 text-current" />
			<span className="block min-w-0 max-w-40 truncate text-left">{label}</span>
			<span aria-hidden="true" className="shrink-0 text-muted-foreground/60">·</span>
			<span className="shrink-0">{thinking}</span>
		</button>
	);
}

function readScope(key: string | null | undefined): PiModelListScope | null {
	if (!key || typeof window === "undefined") return null;
	try {
		return parsePiModelListScope(window.localStorage.getItem(`pilo:model-scope:${key}`));
	} catch {
		return null;
	}
}

function RunConfigContent(props: ComposerRunConfigProps & { touch: boolean }) {
	const { t, i18n } = useTranslation();
	const copy = workspaceCopy(i18n.language);
	const [query, setQuery] = useState("");
	const [choice, setChoice] = useState(() => readScope(props.modelScopeKey));
	const availability = piScopeAvailability(props.models);
	const scope = choice ?? (availability === "available" ? "scoped" : "all");
	const models = useMemo(
		() => filterPiModels(props.models, scope, query),
		[props.models, scope, query],
	);
	const scopedCount = props.models.filter(isScopedPiModel).length;
	const selectScope = (next: PiModelListScope) => {
		setChoice(next);
		if (!props.modelScopeKey) return;
		try {
			window.localStorage.setItem(`pilo:model-scope:${props.modelScopeKey}`, next);
		} catch {
			// Storage can be unavailable in private browser sessions.
		}
	};

	return (
		<div className="flex min-h-0 flex-col">
			<Command shouldFilter={false} loop className="min-h-0 bg-transparent">
				<div className="flex items-center border-b px-1">
					<CommandInput
						value={query}
						onValueChange={setQuery}
						aria-label={copy.searchModels}
						placeholder={copy.searchModels}
						wrapperClassName="h-11 min-w-0 flex-1 border-0 px-2"
						onKeyDown={(event) => {
							if (event.nativeEvent.isComposing || event.keyCode === 229) event.stopPropagation();
						}}
					/>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button type="button" variant="ghost" size="icon"
								className={props.touch ? "size-11 shrink-0" : "size-8 shrink-0"}
								aria-label={t("chat.refreshModels")}
								disabled={!props.onModelRefresh || props.modelLoading}
								onKeyDown={(event) => event.stopPropagation()}
								onClick={props.onModelRefresh}>
								{props.modelLoading ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
							</Button>
						</TooltipTrigger>
						<TooltipContent>{t("chat.refreshModels")}</TooltipContent>
					</Tooltip>
				</div>
				<div className="flex gap-1 border-b p-2" role="group" aria-label={copy.scopeHint}>
					{(["scoped", "all"] as const).map((value) => (
						<Button key={value} type="button" size="sm"
							variant={scope === value ? "secondary" : "ghost"}
							className={props.touch ? "min-h-11" : undefined}
							aria-pressed={scope === value} title={copy.scopeHint}
							onKeyDown={(event) => event.stopPropagation()}
							onClick={() => selectScope(value)}>
							{copy[value]} · {value === "scoped" ? scopedCount : props.models.length}
						</Button>
					))}
				</div>
				{props.modelError ? <p role="alert" className="break-words px-3 py-2 text-xs text-destructive">{props.modelError}</p> : null}
				<CommandList aria-label={t("chat.model")}>
					{models.length === 0 ? (
						<div role="status" className="space-y-2 px-3 py-5 text-center text-sm text-muted-foreground">
							<p>{props.modelLoading && props.models.length === 0 ? t("chat.readingModels")
								: scope === "scoped" && availability !== "available"
									? availability === "unknown" ? copy.scopeUnknown : copy.scopeEmpty
									: query.trim() ? copy.noMatchingModels : t("chat.noModels")}</p>
							{scope === "scoped" ? <Button type="button" size="sm" variant="outline" onKeyDown={(event) => event.stopPropagation()} onClick={() => selectScope("all")}>{copy.all}</Button> : null}
						</div>
					) : models.map((model) => (
						<CommandItem key={JSON.stringify([model.provider, model.id])}
							value={JSON.stringify([model.provider, model.id])}
							disabled={props.modelDisabled || !props.onModelChange}
							onSelect={() => props.onModelChange?.(model)}
							className={cn("mx-1", props.touch && "min-h-11")}
							title={`${model.name || model.id}\n${model.provider}/${model.id}`}>
							<span className="min-w-0 flex-1">
								<span className="block truncate">{model.name || model.id}</span>
								<span className="block truncate text-xs text-muted-foreground">{model.provider} / {model.id}</span>
							</span>
							{props.selectedModel?.id === model.id && props.selectedModel.provider === model.provider ? <Check className="size-4 shrink-0" /> : null}
						</CommandItem>
					))}
				</CommandList>
			</Command>
			<fieldset className="m-0 min-w-0 border-0 border-t border-solid border-border p-3"
				disabled={props.thinkingDisabled || !props.onThinkingChange || props.thinkingLoading}>
				<legend className="sr-only">{t("chat.reasoning")}</legend>
				<p className="mb-2 text-xs text-muted-foreground">{t("chat.reasoning")}</p>
				<div className="flex flex-wrap gap-1">
					{props.thinkingLoading ? <Spinner className="size-4" /> : props.thinkingLevels.map((level) => (
						<Button key={level} type="button" size="sm"
							variant={props.selectedThinkingLevel === level ? "secondary" : "ghost"}
							aria-pressed={props.selectedThinkingLevel === level}
							className={props.touch ? "min-h-11" : undefined}
							onClick={() => props.onThinkingChange?.(level)}>{THINKING_LEVEL_LABELS[level]}</Button>
					))}
					{!props.thinkingLoading && props.thinkingLevels.length === 0 ? <span className="text-xs text-muted-foreground">{t("chat.noReasoning")}</span> : null}
				</div>
			</fieldset>
		</div>
	);
}

export function ComposerRunConfig(props: ComposerRunConfigProps) {
	const touch = useIsTouchDevice();
	const [open, setOpen] = useState(false);
	const { t, i18n } = useTranslation();
	const copy = workspaceCopy(i18n.language);
	const label = props.selectedModel?.name || props.selectedModel?.id || "—";
	const thinking = props.selectedThinkingLevel ? THINKING_LEVEL_LABELS[props.selectedThinkingLevel] : "—";
	const disabled = (props.modelDisabled || !props.onModelChange) &&
		(props.thinkingDisabled || !props.onThinkingChange);
	const onOpenChange = (next: boolean) => {
		setOpen(next);
		if (next) {
			props.onModelMenuOpen?.();
			props.onThinkingMenuOpen?.();
		}
	};
	const trigger = <RunConfigTrigger label={label} thinking={thinking} disabled={disabled} />;
	const content = <RunConfigContent key={props.modelScopeKey ?? "default"} {...props} touch={touch} />;
	if (touch) {
		return (
			<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
				<DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
				<DialogPrimitive.Portal>
					<DialogPrimitive.Overlay className="fixed inset-0 z-[var(--z-dialog-overlay)] bg-background/70" />
					<DialogPrimitive.Content
						onOpenAutoFocus={(event) => event.preventDefault()}
						aria-describedby={undefined}
						className="fixed inset-x-0 bottom-0 z-[var(--z-dialog)] mx-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border bg-background pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-popover outline-none">
						<DialogPrimitive.Title className="sr-only">{t("chat.runConfigLabel", { model: label, thinking })}</DialogPrimitive.Title>
						{content}
						<DialogPrimitive.Close asChild><Button type="button" variant="ghost" className="mx-3 min-h-11">{copy.close}</Button></DialogPrimitive.Close>
					</DialogPrimitive.Content>
				</DialogPrimitive.Portal>
			</DialogPrimitive.Root>
		);
	}
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)] overflow-hidden p-0">
				{content}
			</PopoverContent>
		</Popover>
	);
}
