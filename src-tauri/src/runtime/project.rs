use pilo_protocol::EnvironmentInfo;
use tauri::AppHandle;

use crate::domain::{Connection, DiscoveredProject, Project, ProjectMetadata};

use super::{pi_workspace, server_client::ServerManager, storage};

#[path = "project_discovery.rs"]
mod discovery;
pub use discovery::{discover as discover_report, import_projects};

pub fn list(app: &AppHandle) -> Result<Vec<Project>, String> {
    storage::list_projects(&storage::open(app)?)
}

pub fn get(app: &AppHandle, id: &str) -> Result<Project, String> {
    storage::get_project(&storage::open(app)?, id)?
        .ok_or_else(|| format!("Project '{id}' was not found"))
}

pub async fn add(
    app: &AppHandle,
    servers: &ServerManager,
    connection_id: String,
    path: String,
) -> Result<Project, String> {
    let connection = resolve_connection(app, &connection_id)?;
    let (connection, metadata) = inspect(servers, connection, path).await?;
    let normalized_path = metadata.cwd.clone();
    let id = Project::stable_id(&connection.id, &normalized_path);
    let db = storage::open(app)?;
    let now = storage::now_ms();
    let created_at_ms = storage::get_project(&db, &id)?
        .map(|project| project.created_at_ms)
        .unwrap_or(now);
    let project = Project {
        id,
        name: Project::name_from_path(&normalized_path),
        path: normalized_path,
        connection,
        metadata,
        created_at_ms,
        last_opened_at_ms: now,
    };
    storage::upsert_project(&db, &project)?;
    Ok(project)
}

pub async fn refresh(
    app: &AppHandle,
    servers: &ServerManager,
    id: &str,
) -> Result<Project, String> {
    let current = get(app, id)?;
    let (connection, metadata) = inspect(servers, current.connection, current.path).await?;
    let normalized_path = metadata.cwd.clone();
    let project = Project {
        id: current.id,
        name: Project::name_from_path(&normalized_path),
        path: normalized_path,
        connection,
        metadata,
        created_at_ms: current.created_at_ms,
        last_opened_at_ms: current.last_opened_at_ms,
    };
    storage::upsert_project(&storage::open(app)?, &project)?;
    Ok(project)
}

pub fn touch(app: &AppHandle, id: &str) -> Result<Project, String> {
    let mut project = get(app, id)?;
    project.last_opened_at_ms = storage::now_ms();
    storage::upsert_project(&storage::open(app)?, &project)?;
    Ok(project)
}

pub fn remove(app: &AppHandle, id: &str) -> Result<Vec<Project>, String> {
    let db = storage::open(app)?;
    if !storage::remove_project(&db, id)? {
        return Err(format!("Project '{id}' was not found"));
    }
    pi_workspace::remove_session_anchor(app, id)?;
    list(app)
}

pub fn reorder(
    app: &AppHandle,
    connection_id: &str,
    project_ids: &[String],
) -> Result<Vec<Project>, String> {
    let mut db = storage::open(app)?;
    storage::reorder_projects(&mut db, connection_id, project_ids)?;
    storage::list_projects(&db)
}

/// Preserve the legacy desktop command while new UIs consume the full report.
pub async fn discover(
    app: &AppHandle,
    servers: &ServerManager,
    connection_id: String,
) -> Result<Vec<DiscoveredProject>, String> {
    Ok(discover_report(app, servers, connection_id).await?.projects
        .into_iter().map(|candidate| candidate.project).collect())
}

pub fn resolve_connection(app: &AppHandle, connection_id: &str) -> Result<Connection, String> {
    let db = storage::open(app)?;
    if connection_id == "local" {
        return storage::ensure_local_connection(&db);
    }
    storage::get_connection(&db, connection_id)?
        .ok_or_else(|| format!("Connection '{connection_id}' was not found"))
}

async fn inspect(
    servers: &ServerManager,
    connection: Connection,
    path: String,
) -> Result<(Connection, ProjectMetadata), String> {
    let environment: EnvironmentInfo = servers
        .request_typed(
            &connection,
            "environment.inspect",
            serde_json::json!({
                "project": path,
                "piExecutable": connection.pi_executable.clone(),
                "piRuntime": connection.pi_runtime.as_str(),
            }),
        )
        .await?;
    Ok((
        connection,
        ProjectMetadata {
            cwd: environment.cwd,
            git_branch: environment.git_branch,
            pi_version: environment.pi_version,
            refreshed_at_ms: storage::now_ms(),
        },
    ))
}
