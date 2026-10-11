// The searchable desktop picker uses a Popover. Keep Radix Slot's attributes
// and handlers on the real trigger rather than swallowing them in the wrapper.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ComposerRunConfig } from "../src/components/chat/chat-composer-run-config.tsx";
import { initializeI18n } from "../src/i18n/index.ts";
import type { PiModel } from "../src/lib/pi-runtime.ts";

const model: PiModel = {
	id: "m1",
	name: "Model One",
	provider: "test",
	reasoning: true,
};

await initializeI18n("en-US");

function renderTrigger(overrides: Record<string, unknown> = {}) {
	const html = renderToStaticMarkup(
		createElement(ComposerRunConfig, {
			models: [model],
			selectedModel: model,
			modelLoading: false,
			modelError: null,
			modelDisabled: false,
			onModelChange: () => {},
			thinkingLevels: ["off", "high"],
			selectedThinkingLevel: "high",
			thinkingLoading: false,
			thinkingDisabled: false,
			onThinkingChange: () => {},
			...overrides,
		}),
	);
	const match = html.match(/<button[^>]*data-chat-run-config-trigger[^>]*>/);
	assert.ok(match, "run config trigger button is rendered");
	return match[0];
}

test("desktop trigger keeps the props merged in by PopoverTrigger", () => {
	const trigger = renderTrigger();
	assert.match(trigger, /aria-haspopup="dialog"/);
	assert.match(trigger, /aria-expanded="false"/);
	assert.match(trigger, /data-state="closed"/);
});

test("desktop trigger still reflects its own disabled state", () => {
	const trigger = renderTrigger({ modelDisabled: true, thinkingDisabled: true });
	assert.match(trigger, /\sdisabled(=""|\s|>)/);
});

test("desktop trigger shows the selected model and thinking level", () => {
	assert.match(renderTrigger(), /aria-label="Run config: Model One · High"/);
});
