use serde::{Deserialize, Serialize};

use super::{DiscoveredProject, Project};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectAvailability {
    Available,
    Missing,
    Inaccessible,
    #[default]
    #[serde(other)]
    Unknown,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCandidate {
    #[serde(flatten)]
    pub project: DiscoveredProject,
    #[serde(default)]
    pub normalized_path: Option<String>,
    #[serde(default)]
    pub availability: ProjectAvailability,
    #[serde(default)]
    pub session_count: Option<u64>,
    #[serde(default)]
    pub last_session_modified_at_ms: Option<u64>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDiscoveryReport {
    pub projects: Vec<ProjectCandidate>,
    #[serde(default)]
    pub complete: bool,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub source_root: Option<String>,
    #[serde(default)]
    pub scanned_files: u64,
    #[serde(default)]
    pub skipped_files: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectImportIssue {
    pub path: String,
    pub reason: String,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectImportReport {
    pub added: Vec<Project>,
    pub skipped: Vec<ProjectImportIssue>,
    pub failed: Vec<ProjectImportIssue>,
}
