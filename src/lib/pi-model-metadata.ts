import type { PiModel } from "./pi-runtime-types";

/** The live list is authoritative; a project cache only enriches missing metadata. */
export function mergePiModelMetadata(live: readonly PiModel[], cached: readonly PiModel[]): PiModel[] {
	const key = (model: PiModel) => JSON.stringify([model.provider, model.id]);
	const catalog = new Map(cached.map((model) => [key(model), model]));
	return live.map((model) => {
		const metadata = catalog.get(key(model));
		if (!metadata) return model;
		return {
			...model,
			thinkingLevels: model.thinkingLevels ?? metadata.thinkingLevels,
			defaultThinkingLevel: model.defaultThinkingLevel ?? metadata.defaultThinkingLevel,
			scopeOrder: model.scopeOrder === undefined ? metadata.scopeOrder : model.scopeOrder,
			scopeThinkingLevel: model.scopeThinkingLevel === undefined ? metadata.scopeThinkingLevel : model.scopeThinkingLevel,
		};
	});
}
