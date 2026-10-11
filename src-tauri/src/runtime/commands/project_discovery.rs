use tauri::{AppHandle, State};

use crate::domain::{ProjectDiscoveryReport, ProjectImportReport};
use crate::runtime::{PiloRuntime, project};

#[tauri::command]
pub async fn project_discover_report(
    app: AppHandle,
    runtime: State<'_, PiloRuntime>,
    connection_id: String,
) -> Result<ProjectDiscoveryReport, String> {
    project::discover_report(&app, &runtime.servers, connection_id).await
}

#[tauri::command]
pub async fn project_import(
    app: AppHandle,
    runtime: State<'_, PiloRuntime>,
    connection_id: String,
    paths: Vec<String>,
) -> Result<ProjectImportReport, String> {
    project::import_projects(&app, &runtime.servers, connection_id, paths).await
}
