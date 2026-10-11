import type { Project } from "./projects";

export type ProjectAvailability = "available" | "missing" | "inaccessible" | "unknown";
export type ProjectCandidate = {
	name: string;
	path: string;
	normalizedPath: string | null;
	alreadyAdded: boolean;
	availability: ProjectAvailability;
	sessionCount: number | null;
	lastSessionModifiedAtMs: number | null;
};
export type ProjectDiscoveryReport = {
	projects: ProjectCandidate[];
	complete: boolean;
	warnings: string[];
	sourceRoot: string | null;
	scannedFiles: number;
	skippedFiles: number;
};
export type ProjectImportReport = {
	added: Project[];
	skipped: { path: string; reason: string }[];
	failed: { path: string; reason: string }[];
};
export type ProjectDiscoveryClient = {
	discover(connectionId: string): Promise<ProjectDiscoveryReport>;
	importProjects(connectionId: string, paths: string[]): Promise<ProjectImportReport>;
};

export function canImportProject(project: ProjectCandidate): boolean {
	return !project.alreadyAdded && project.availability === "available" && Boolean(project.normalizedPath);
}

export function filterDiscoveredProjects(projects: readonly ProjectCandidate[], query: string): ProjectCandidate[] {
	const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	return projects.filter((project) => {
		const text = `${project.name}\n${project.path}`.toLowerCase();
		return words.every((word) => text.includes(word));
	});
}

export function selectedImportPaths(projects: readonly ProjectCandidate[], selected: ReadonlySet<string>): string[] {
	return [...new Set(projects.filter((project) => canImportProject(project) && selected.has(project.path)).map((project) => project.path))].slice(0, 200);
}
