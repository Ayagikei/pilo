import { invoke } from "@tauri-apps/api/core";

import type { ProjectDiscoveryClient, ProjectDiscoveryReport, ProjectImportReport } from "./project-discovery";

export const tauriProjectDiscoveryClient: ProjectDiscoveryClient = {
	discover: (connectionId) => invoke<ProjectDiscoveryReport>("project_discover_report", { connectionId }),
	importProjects: (connectionId, paths) => invoke<ProjectImportReport>("project_import", { connectionId, paths }),
};
