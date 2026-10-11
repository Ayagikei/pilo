use axum::{Json, Router, extract::{Query, State}, http::StatusCode, response::{IntoResponse, Response}, routing::{get, post}};
use serde::Deserialize;
use serde_json::{Value, json};
use tauri::Manager;

use crate::runtime::{PiloRuntime, project, storage};
use super::{RemoteHttpState, api_error};

/// Mounted inside the existing authenticated router, never as public routes.
pub(super) fn routes() -> Router<RemoteHttpState> {
    Router::new()
        .route("/api/v1/projects/connections", get(connections))
        .route("/api/v1/projects/discover", get(discover))
        .route("/api/v1/projects/import", post(import))
}

async fn connections(State(state): State<RemoteHttpState>) -> Response {
    let result = (|| -> Result<Vec<Value>, String> {
        let db = storage::open_with_paths(&state.paths)?;
        storage::ensure_local_connection(&db)?;
        Ok(storage::list_connections(&db)?.into_iter().map(|connection| {
            // No executable paths, authentication settings or SSH private-key paths.
            json!({ "id": connection.id, "name": connection.name })
        }).collect())
    })();
    match result {
        Ok(value) => Json(value).into_response(),
        Err(error) => api_error(StatusCode::INTERNAL_SERVER_ERROR, &error),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscoveryRequest { connection_id: String }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportRequest { connection_id: String, paths: Vec<String> }

async fn discover(State(state): State<RemoteHttpState>, Query(request): Query<DiscoveryRequest>) -> Response {
    if request.connection_id.len() > 4096 { return api_error(StatusCode::BAD_REQUEST, "Invalid connection"); }
    let runtime = state.app.state::<PiloRuntime>();
    match project::discover_report(&state.app, &runtime.servers, request.connection_id).await {
        Ok(report) => Json(report).into_response(),
        Err(error) => api_error(StatusCode::BAD_REQUEST, &error),
    }
}

async fn import(State(state): State<RemoteHttpState>, Json(request): Json<ImportRequest>) -> Response {
    if request.connection_id.len() > 4096 { return api_error(StatusCode::BAD_REQUEST, "Invalid connection"); }
    let runtime = state.app.state::<PiloRuntime>();
    match project::import_projects(&state.app, &runtime.servers, request.connection_id, request.paths).await {
        Ok(report) => Json(report).into_response(),
        Err(error) => api_error(StatusCode::BAD_REQUEST, &error),
    }
}
