/** Presentation-only filters. Never use these results to configure Pi's cycle. */
export type PiModelListScope = "scoped" | "all";
export type PiScopeAvailability = "available" | "empty" | "unknown";

type FilterableModel = {
	provider: string;
	id: string;
	name: string;
	scopeOrder?: number | null;
};

export function isScopedPiModel(model: FilterableModel): boolean {
	return (
		typeof model.scopeOrder === "number" &&
		Number.isFinite(model.scopeOrder) &&
		model.scopeOrder >= 0
	);
}

export function piScopeAvailability(
	models: readonly FilterableModel[],
): PiScopeAvailability {
	if (models.some(isScopedPiModel)) return "available";
	return models.length === 0 || models.some((model) => model.scopeOrder !== null)
		? "unknown"
		: "empty";
}

export function filterPiModels<T extends FilterableModel>(
	models: readonly T[],
	scope: PiModelListScope,
	query: string,
): T[] {
	const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	const filtered = models.filter((model) => {
		if (scope === "scoped" && !isScopedPiModel(model)) return false;
		const text = `${model.name}\n${model.id}\n${model.provider}`.toLowerCase();
		return words.every((word) => text.includes(word));
	});
	if (scope === "scoped") {
		filtered.sort((a, b) => (a.scopeOrder ?? 0) - (b.scopeOrder ?? 0));
	}
	return filtered;
}

export function parsePiModelListScope(value: unknown): PiModelListScope | null {
	return value === "all" || value === "scoped" ? value : null;
}
