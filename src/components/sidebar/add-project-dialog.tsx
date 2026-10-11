import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AddProjectDialog as ManualProjectDialog } from "./manual-project-dialog";
import { ProjectDiscoveryPanel } from "./project-discovery-panel";
import { workspaceCopy } from "@/i18n/workspace-enhancements";
import type { Connection } from "@/lib/pi-runtime";
import { addProject, notifyProjectsChanged, pickLocalProjectDirectory } from "@/lib/projects";
import { tauriProjectDiscoveryClient } from "@/lib/tauri-project-discovery";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/ui";

function AddProjectContent({ connection, onOpenChange }: {
	connection: Connection;
	onOpenChange: (open: boolean) => void;
}) {
	const { i18n } = useTranslation();
	const copy = workspaceCopy(i18n.language);
	const [manual, setManual] = useState(false);
	const [picking, setPicking] = useState(false);
	const pick = async () => {
		if (picking) return;
		setPicking(true);
		try {
			const path = await pickLocalProjectDirectory();
			if (!path) return;
			await addProject(connection.id, path);
			notifyProjectsChanged();
			onOpenChange(false);
		} catch (error) {
			toast.error(String(error instanceof Error ? error.message : error));
		} finally { setPicking(false); }
	};
	if (manual) return <ManualProjectDialog open connection={connection} onOpenChange={(next) => { if (!next) setManual(false); }} />;
	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
				<DialogHeader><DialogTitle>{copy.discoverProjects}</DialogTitle><DialogDescription>{connection.name}</DialogDescription></DialogHeader>
				<ProjectDiscoveryPanel key={connection.id} connectionId={connection.id} client={tauriProjectDiscoveryClient} onImported={notifyProjectsChanged} />
				<Button type="button" variant="outline" className="min-h-11" disabled={picking} onClick={() => { if (connection.kind.type === "local") void pick(); else setManual(true); }}>{connection.kind.type === "local" ? copy.browseLocal : copy.manual}</Button>
			</DialogContent>
		</Dialog>
	);
}

export function AddProjectDialog({ open, onOpenChange, connection }: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	connection: Connection | null;
}) {
	return open && connection ? <AddProjectContent key={connection.id} connection={connection} onOpenChange={onOpenChange} /> : null;
}
