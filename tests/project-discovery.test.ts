import assert from "node:assert/strict";
import test from "node:test";
import { canImportProject, filterDiscoveredProjects, selectedImportPaths, type ProjectCandidate } from "../src/lib/project-discovery.ts";

function project(overrides: Partial<ProjectCandidate> = {}): ProjectCandidate {
	return { name: "App", path: "/work/app", normalizedPath: "/work/app", availability: "available", alreadyAdded: false, sessionCount: 1, lastSessionModifiedAtMs: null, ...overrides };
}
test("only verified not-yet-added project directories are eligible", () => {
	assert.equal(canImportProject(project()), true);
	assert.equal(canImportProject(project({ alreadyAdded: true })), false);
	assert.equal(canImportProject(project({ normalizedPath: null })), false);
	for (const availability of ["missing", "inaccessible", "unknown"] as const) {
		assert.equal(canImportProject(project({ availability })), false);
	}
});
test("project search matches name and path using all keywords", () => {
	const items = [project(), project({ name: "Other", path: "/code/other" })];
	assert.deepEqual(filterDiscoveredProjects(items, " WORK  app "), [items[0]]);
	assert.deepEqual(filterDiscoveredProjects(items, "work other"), []);
	assert.deepEqual(filterDiscoveredProjects(items, ""), items);
});
test("stale selection is revalidated and duplicate paths are imported once", () => {
	const items = [project(), project(), project({ path: "/gone", availability: "missing" }), project({ path: "/added", alreadyAdded: true })];
	assert.deepEqual(selectedImportPaths(items, new Set(["/work/app", "/gone", "/added", "/not-in-report"])), ["/work/app"]);
});
test("a batch cannot exceed 200 projects", () => {
	const items = Array.from({ length: 250 }, (_, index) => project({ path: `/work/${index}` }));
	assert.equal(selectedImportPaths(items, new Set(items.map((item) => item.path))).length, 200);
});
