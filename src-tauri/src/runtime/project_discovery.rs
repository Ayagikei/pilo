use std::collections::{BTreeMap, BTreeSet};

use serde_json::Value;
use tauri::AppHandle;

use crate::domain::{
    DiscoveredProject, Project, ProjectAvailability, ProjectCandidate,
    ProjectDiscoveryReport, ProjectImportIssue, ProjectImportReport, ProjectMetadata,
};
use crate::runtime::{server_client::ServerManager, storage};
use super::{list, resolve_connection};

pub async fn discover(
    app: &AppHandle,
    servers: &ServerManager,
    connection_id: String,
) -> Result<ProjectDiscoveryReport, String> {
    let connection = resolve_connection(app, &connection_id)?;
    let value: Value = servers.request_typed(&connection, "session.discover", Value::Null).await?;
    let mut report = decode_report(value)?;
    let existing = list(app)?;
    let ids: BTreeSet<_> = existing.iter().map(|project| project.id.as_str()).collect();
    for candidate in &mut report.projects {
        let path = candidate.normalized_path.as_deref().unwrap_or(&candidate.project.path);
        candidate.project.already_added = ids.contains(Project::stable_id(&connection.id, path).as_str());
    }
    Ok(report)
}

fn decode_report(value: Value) -> Result<ProjectDiscoveryReport, String> {
    // Older deployed servers return bounded raw headers. Never claim completeness.
    if let Some(headers) = value.as_array() {
        let paths: BTreeSet<String> = headers.iter().filter_map(|header| {
            if header.get("type")?.as_str()? != "session" { return None; }
            let cwd = header.get("cwd")?.as_str()?;
            (!cwd.trim().is_empty()).then(|| cwd.to_owned())
        }).collect();
        return Ok(ProjectDiscoveryReport {
            projects: paths.into_iter().map(|path| ProjectCandidate {
                project: DiscoveredProject { name: Project::name_from_path(&path), path, already_added: false },
                normalized_path: None,
                availability: ProjectAvailability::Unknown,
                session_count: None,
                last_session_modified_at_ms: None,
            }).collect(),
            warnings: vec!["The connection is running an older pilo-server. Rebuild/deploy the matching server before importing projects.".to_owned()],
            ..ProjectDiscoveryReport::default()
        });
    }
    serde_json::from_value(value).map_err(|error| format!("Invalid project discovery response: {error}"))
}

fn import_paths(paths: Vec<String>) -> Result<Vec<String>, String> {
    if paths.len() > 200 { return Err("Select at most 200 projects per import.".to_owned()); }
    let mut seen = BTreeSet::new();
    let mut unique = Vec::new();
    for path in paths {
        if path.trim().is_empty() || path.len() > 4096 || path.contains('\0') {
            return Err("Invalid project path.".to_owned());
        }
        if seen.insert(path.clone()) { unique.push(path); }
    }
    Ok(unique)
}

pub async fn import_projects(
    app: &AppHandle,
    servers: &ServerManager,
    connection_id: String,
    paths: Vec<String>,
) -> Result<ProjectImportReport, String> {
    let paths = import_paths(paths)?;
    if paths.is_empty() { return Ok(ProjectImportReport::default()); }
    // Revalidate on the target. This is not a generic arbitrary-path import API.
    let discovered = discover(app, servers, connection_id.clone()).await?;
    let candidates: BTreeMap<_, _> = discovered.projects.into_iter()
        .map(|candidate| (candidate.project.path.clone(), candidate)).collect();
    let connection = resolve_connection(app, &connection_id)?;
    let mut db = storage::open(app)?;
    let tx = db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let mut result = ProjectImportReport::default();
    for path in paths {
        let Some(candidate) = candidates.get(&path) else {
            result.failed.push(ProjectImportIssue { path, reason: "Project is no longer present in the discovery results. Rescan and retry.".to_owned() });
            continue;
        };
        let Some(normalized) = candidate.normalized_path.as_ref()
            .filter(|_| candidate.availability == ProjectAvailability::Available)
        else {
            result.failed.push(ProjectImportIssue { path, reason: "Project directory is missing, inaccessible, or has not been verified.".to_owned() });
            continue;
        };
        let id = Project::stable_id(&connection.id, normalized);
        match storage::get_project(&tx, &id) {
            Ok(Some(_)) => {
                result.skipped.push(ProjectImportIssue { path, reason: "Already added.".to_owned() });
                continue;
            }
            Err(error) => {
                result.failed.push(ProjectImportIssue { path, reason: error });
                continue;
            }
            Ok(None) => {}
        }
        let project = Project {
            id,
            name: Project::name_from_path(normalized),
            path: normalized.clone(),
            connection: connection.clone(),
            metadata: ProjectMetadata {
                cwd: normalized.clone(), git_branch: None, pi_version: String::new(), refreshed_at_ms: 0,
            },
            created_at_ms: storage::now_ms(),
            // Registered, not opened. Do not prewarm Pi until the user opens it.
            last_opened_at_ms: 0,
        };
        match storage::upsert_project(&tx, &project) {
            Ok(()) => result.added.push(project),
            Err(reason) => result.failed.push(ProjectImportIssue { path, reason }),
        }
    }
    tx.commit().map_err(|error| error.to_string())?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_headers_are_deduplicated_but_never_marked_complete() {
        let report = decode_report(serde_json::json!([
            {"type":"session", "cwd":"/work/a"},
            {"type":"session", "cwd":"/work/a"},
            {"type":"message", "cwd":"/ignore"}
        ])).unwrap();
        assert_eq!(report.projects.len(), 1);
        assert!(!report.complete);
        assert_eq!(report.projects[0].availability, ProjectAvailability::Unknown);
    }
    #[test]
    fn import_selection_is_bounded_and_deduplicated_without_rewriting_paths() {
        assert_eq!(import_paths(vec!["/work/a".into(), "/work/a".into()]).unwrap(), vec!["/work/a"]);
        assert!(import_paths(vec!["/a".into(); 201]).is_err());
        assert!(import_paths(vec!["".into()]).is_err());
        assert!(import_paths(vec!["/a\0b".into()]).is_err());
    }
    #[test]
    fn modern_response_keeps_completeness_and_verification() {
        let report = decode_report(serde_json::json!({
            "complete": true, "projects":[{
                "name":"a", "path":"/work/a", "alreadyAdded":false,
                "normalizedPath":"/work/a", "availability":"available",
                "sessionCount":600, "lastSessionModifiedAtMs":1000
            }]
        })).unwrap();
        assert!(report.complete);
        assert_eq!(report.projects[0].session_count, Some(600));
        assert_eq!(report.projects[0].availability, ProjectAvailability::Available);
    }
}
