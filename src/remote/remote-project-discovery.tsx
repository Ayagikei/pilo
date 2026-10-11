import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ProjectDiscoveryPanel } from "@/components/sidebar/project-discovery-panel";
import { workspaceCopy } from "@/i18n/workspace-enhancements";
import type { ProjectDiscoveryClient, ProjectDiscoveryReport, ProjectImportReport } from "@/lib/project-discovery";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/ui";
import { remoteFetch } from "./remote-client";

export function RemoteProjectDiscovery({ token, onImported, onAuthError }: {
	token: string;
	onImported: () => void;
	onAuthError: (error: unknown) => boolean;
}) {
	const { i18n } = useTranslation();
	const copy = workspaceCopy(i18n.language);
	const [open, setOpen] = useState(false);
	const [connections, setConnections] = useState<{ id: string; name: string }[]>([]);
	const [selected, setSelected] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const sequence = useRef(0);
	const client = useMemo<ProjectDiscoveryClient>(() => {
		const request = async <T,>(path: string, init?: RequestInit): Promise<T> => {
			try { return await remoteFetch<T>(token, path, init); }
			catch (reason) { onAuthError(reason); throw reason; }
		};
		return {
			discover: (connectionId) => request<ProjectDiscoveryReport>(`/api/v1/projects/discover?${new URLSearchParams({ connectionId })}`),
			importProjects: (connectionId, paths) => request<ProjectImportReport>("/api/v1/projects/import", { method: "POST", body: JSON.stringify({ connectionId, paths }) }),
		};
	}, [token, onAuthError]);
	const show = async () => {
		const id = ++sequence.current;
		setOpen(true); setLoading(true); setError(null);
		try {
			const next = await remoteFetch<{ id: string; name: string }[]>(token, "/api/v1/projects/connections");
			if (sequence.current !== id) return;
			setConnections(next);
			setSelected((current) => next.some((item) => item.id === current) ? current : next[0]?.id ?? "");
		} catch (reason) {
			if (!onAuthError(reason) && sequence.current === id) setError(String(reason instanceof Error ? reason.message : reason));
		} finally { if (sequence.current === id) setLoading(false); }
	};
	return (
		<>
			<Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={loading} onClick={() => void show()}>{copy.discoverProjects}</Button>
			<Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { sequence.current += 1; setLoading(false); } }}>
				<DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
					<DialogHeader><DialogTitle>{copy.discoverProjects}</DialogTitle><DialogDescription>Pilo Remote</DialogDescription></DialogHeader>
					{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
					{loading ? <p role="status">{copy.loading}</p> : null}
					<select aria-label="Connection" className="min-h-11 w-full rounded-md border bg-background px-3 text-sm" value={selected} onChange={(event) => setSelected(event.target.value)}>{connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}</select>
					{selected && !loading ? <ProjectDiscoveryPanel key={selected} connectionId={selected} client={client} onImported={onImported} /> : null}
				</DialogContent>
			</Dialog>
		</>
	);
}
