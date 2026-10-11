import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { workspaceCopy } from "@/i18n/workspace-enhancements";
import {
	canImportProject,
	filterDiscoveredProjects,
	selectedImportPaths,
	type ProjectDiscoveryClient,
	type ProjectDiscoveryReport,
	type ProjectImportReport,
} from "@/lib/project-discovery";
import { Button, Input, Spinner } from "@/ui";

export function ProjectDiscoveryPanel({ connectionId, client, onImported }: {
	connectionId: string;
	client: ProjectDiscoveryClient;
	onImported?: () => void;
}) {
	const { i18n } = useTranslation();
	const copy = workspaceCopy(i18n.language);
	const [report, setReport] = useState<ProjectDiscoveryReport | null>(null);
	const [result, setResult] = useState<ProjectImportReport | null>(null);
	const [selected, setSelected] = useState<Set<string>>(() => new Set());
	const [query, setQuery] = useState("");
	const [busy, setBusy] = useState<"scan" | "import" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const operation = useRef(0);
	const pending = useRef(false);
	useEffect(() => () => { operation.current += 1; }, []);

	const visible = useMemo(() => filterDiscoveredProjects(report?.projects ?? [], query), [report, query]);
	const paths = selectedImportPaths(report?.projects ?? [], selected);
	const scan = async () => {
		if (pending.current) return;
		pending.current = true;
		const id = ++operation.current;
		setBusy("scan");
		setError(null);
		try {
			const next = await client.discover(connectionId);
			if (id !== operation.current) return;
			setReport(next);
			setSelected((current) => new Set(selectedImportPaths(next.projects, current)));
		} catch (reason) {
			if (id === operation.current) setError(String(reason instanceof Error ? reason.message : reason));
		} finally {
			if (id === operation.current) { pending.current = false; setBusy(null); }
		}
	};
	const importSelected = async () => {
		if (pending.current || paths.length === 0) return;
		pending.current = true;
		const id = ++operation.current;
		setBusy("import");
		setError(null);
		try {
			const next = await client.importProjects(connectionId, paths);
			// Persisted changes must be reflected even if this panel was closed.
			if (next.added.length > 0) onImported?.();
			if (id !== operation.current) return;
			setResult(next);
			const imported = new Set([...next.added.map((project) => project.path), ...next.skipped.map((item) => item.path)]);
			setReport((current) => current ? { ...current, projects: current.projects.map((project) => imported.has(project.normalizedPath ?? project.path) || imported.has(project.path) ? { ...project, alreadyAdded: true } : project) } : current);
			setSelected((current) => new Set([...current].filter((path) => !imported.has(path))));
		} catch (reason) {
			if (id === operation.current) setError(String(reason instanceof Error ? reason.message : reason));
		} finally {
			if (id === operation.current) { pending.current = false; setBusy(null); }
		}
	};

	return (
		<section className="space-y-3" aria-label={copy.discoverProjects}>
			<p className="text-xs leading-5 text-muted-foreground">{copy.discoverIntro}</p>
			<div className="flex items-center gap-2">
				<Input aria-label={copy.searchProjects} placeholder={copy.searchProjects} value={query} onChange={(event) => setQuery(event.target.value)} />
				<Button type="button" variant="outline" disabled={busy !== null} onClick={() => void scan()}>
					{busy === "scan" ? <Spinner className="size-4" /> : null}{report ? copy.rescan : copy.scan}
				</Button>
			</div>
			{error ? <p role="alert" className="break-words text-sm text-destructive">{error}</p> : null}
			{report && !report.complete ? <p role="status" className="text-xs text-muted-foreground">{copy.incomplete}</p> : null}
			{report?.warnings.length ? <details className="text-xs text-muted-foreground"><summary>{report.warnings.length} warnings</summary><pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words">{report.warnings.join("\n")}</pre></details> : null}
			{report?.sourceRoot ? <p className="break-all font-mono text-2xs text-muted-foreground">{report.sourceRoot}</p> : null}
			{report ? (
				<>
					<div className="flex flex-wrap items-center gap-1">
						<Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => setSelected((current) => new Set([...current, ...visible.filter(canImportProject).map((project) => project.path)].slice(0, 200)))}>{copy.selectVisible}</Button>
						<Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => setSelected(new Set())}>{copy.clearSelection}</Button>
						<span className="ml-auto text-xs tabular-nums text-muted-foreground">{paths.length} / 200</span>
					</div>
					<div className="max-h-[45dvh] space-y-1 overflow-y-auto overscroll-contain rounded-lg border p-1">
						{visible.length === 0 ? <p role="status" className="p-4 text-center text-sm text-muted-foreground">{query.trim() ? copy.noMatchingProjects : copy.noProjects}</p> : visible.map((project) => (
							<label key={project.path} className="flex min-h-14 cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/50">
								<input type="checkbox" className="mt-1 size-4 shrink-0" checked={selected.has(project.path) && canImportProject(project)} disabled={busy !== null || !canImportProject(project) || (!selected.has(project.path) && paths.length >= 200)} onChange={(event) => { const checked = event.target.checked; setSelected((current) => { const next = new Set(current); if (checked) next.add(project.path); else next.delete(project.path); return next; }); }} />
								<span className="min-w-0 flex-1">
									<span className="flex flex-wrap gap-x-2 text-sm"><span className="font-medium">{project.name}</span><span className="text-xs text-muted-foreground">{project.alreadyAdded ? copy.alreadyAdded : copy[project.availability]}</span></span>
									<span className="block break-all font-mono text-xs text-muted-foreground">{project.path}</span>
									<span className="block text-2xs text-muted-foreground">{project.sessionCount ?? "—"} {copy.sessions}{project.lastSessionModifiedAtMs ? ` · ${copy.recentSession}: ${new Date(project.lastSessionModifiedAtMs).toLocaleString(i18n.language)}` : ""}</span>
								</span>
							</label>
						))}
					</div>
					<Button type="button" className="min-h-11 w-full" disabled={busy !== null || paths.length === 0} onClick={() => void importSelected()}>{busy === "import" ? <Spinner className="size-4" /> : null}{copy.addSelected} ({paths.length})</Button>
				</>
			) : null}
			{result ? <div role="status" className="space-y-2 text-xs"><p>{copy.importSummary}: {copy.added} {result.added.length} · {copy.skipped} {result.skipped.length} · {copy.failed} {result.failed.length}</p>{result.failed.map((item) => <p key={item.path} className="break-all text-destructive">{item.path}: {item.reason}</p>)}</div> : null}
		</section>
	);
}
