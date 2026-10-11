//! Read-only project discovery. Headers, not bucket names, are authoritative.
use std::{
    collections::{BTreeMap, HashMap},
    fs,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    time::{Duration, Instant, UNIX_EPOCH},
};

use serde::Deserialize;
use serde_json::{Value, json};

const MAX_HEADER_BYTES: u64 = 64 * 1024;
const MAX_FILES: usize = 100_000;
const MAX_PROJECTS: usize = 2_000;
const MAX_WARNINGS: usize = 40;
const MAX_PATH_BYTES: usize = 4096;
const SCAN_BUDGET: Duration = Duration::from_secs(15);

#[derive(Debug, Deserialize)]
struct Header {
    #[serde(rename = "type")]
    kind: String,
    cwd: String,
}

#[derive(Clone)]
struct Location {
    path: String,
    normalized: Option<String>,
    availability: &'static str,
}

struct Candidate {
    location: Location,
    count: u64,
    modified: Option<u64>,
}

fn locate(cwd: &str) -> Location {
    let result = fs::canonicalize(cwd).and_then(|path| {
        if !path.is_dir() {
            return Err(std::io::Error::new(std::io::ErrorKind::NotFound, "not a directory"));
        }
        fs::read_dir(&path)?;
        Ok(path)
    });
    match result {
        Ok(path) => {
            let path = path.to_string_lossy().into_owned();
            Location { path: path.clone(), normalized: Some(path), availability: "available" }
        }
        Err(error) => Location {
            path: cwd.to_owned(),
            normalized: None,
            availability: if error.kind() == std::io::ErrorKind::NotFound { "missing" } else { "inaccessible" },
        },
    }
}

fn read_header(path: &Path) -> Result<Header, String> {
    let file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut reader = BufReader::new(file.take(MAX_HEADER_BYTES + 1));
    let mut line = String::new();
    reader.read_line(&mut line).map_err(|error| error.to_string())?;
    if line.len() as u64 > MAX_HEADER_BYTES {
        return Err("session header exceeds 64 KiB".to_owned());
    }
    let header: Header = serde_json::from_str(line.trim_start_matches('\u{feff}').trim())
        .map_err(|error| format!("invalid session header: {error}"))?;
    if header.kind != "session" || header.cwd.trim().is_empty()
        || header.cwd.len() > MAX_PATH_BYTES || !Path::new(&header.cwd).is_absolute()
    {
        return Err("session header must contain an absolute cwd".to_owned());
    }
    Ok(header)
}

pub(super) fn discover() -> Result<Value, String> {
    let root = super::agent_dir()
        .ok_or_else(|| "Pi agent directory is unavailable".to_owned())?
        .join("sessions");
    scan(&root, MAX_FILES, SCAN_BUDGET)
}

fn scan(root: &Path, max_files: usize, budget: Duration) -> Result<Value, String> {
    let started = Instant::now();
    let mut complete = true;
    let mut warnings = Vec::new();
    let mut scanned = 0usize;
    let mut skipped = 0usize;
    let mut buckets = vec![root.to_path_buf()];
    match fs::read_dir(root) {
        Ok(entries) => {
            for entry in entries {
                if buckets.len() >= 10_000 || started.elapsed() >= budget {
                    complete = false;
                    warnings.push("Directory enumeration limit reached.".to_owned());
                    break;
                }
                match entry {
                    Ok(entry) => match entry.file_type() {
                        Ok(kind) if kind.is_dir() => buckets.push(entry.path()),
                        Ok(_) => {},
                        Err(error) => {
                            complete = false;
                            if warnings.len() < MAX_WARNINGS { warnings.push(error.to_string()); }
                        }
                    },
                    Err(error) => {
                        complete = false;
                        if warnings.len() < MAX_WARNINGS { warnings.push(error.to_string()); }
                    }
                }
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(json!({ "projects": [], "complete": true, "warnings": [],
                "sourceRoot": root.to_string_lossy(), "scannedFiles": 0, "skippedFiles": 0 }));
        }
        Err(error) => return Err(format!("Cannot read Pi sessions '{}': {error}", root.display())),
    }
    buckets.sort();
    let mut locations = HashMap::<String, Location>::new();
    let mut projects = BTreeMap::<String, Candidate>::new();
    'scan: for bucket in buckets {
        let entries = match fs::read_dir(&bucket) {
            Ok(entries) => entries,
            Err(error) => {
                complete = false;
                if warnings.len() < MAX_WARNINGS { warnings.push(format!("{}: {error}", bucket.display())); }
                continue;
            }
        };
        for entry in entries {
            if scanned >= max_files || started.elapsed() >= budget {
                complete = false;
                if warnings.len() < MAX_WARNINGS { warnings.push("Session scan budget reached; results are partial.".to_owned()); }
                break 'scan;
            }
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    complete = false;
                    if warnings.len() < MAX_WARNINGS { warnings.push(error.to_string()); }
                    continue;
                }
            };
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("jsonl") { continue; }
            // Do not follow session-file or bucket symlinks outside the session root.
            match entry.file_type() {
                Ok(kind) if kind.is_file() => {},
                Ok(_) => continue,
                Err(error) => {
                    complete = false;
                    skipped += 1;
                    if warnings.len() < MAX_WARNINGS { warnings.push(format!("{}: {error}", path.display())); }
                    continue;
                }
            }
            scanned += 1;
            let header = match read_header(&path) {
                Ok(header) => header,
                Err(error) => {
                    complete = false;
                    skipped += 1;
                    if warnings.len() < MAX_WARNINGS { warnings.push(format!("{}: {error}", path.display())); }
                    continue;
                }
            };
            let location = if let Some(location) = locations.get(&header.cwd) {
                location.clone()
            } else {
                let location = locate(&header.cwd);
                if locations.len() < MAX_PROJECTS * 4 { locations.insert(header.cwd, location.clone()); }
                location
            };
            if projects.len() >= MAX_PROJECTS && !projects.contains_key(&location.path) {
                complete = false;
                skipped += 1;
                continue;
            }
            let modified = entry.metadata().ok().and_then(|metadata| metadata.modified().ok())
                .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
                .map(|value| value.as_millis().min(u64::MAX as u128) as u64);
            let candidate = projects.entry(location.path.clone()).or_insert(Candidate {
                location, count: 0, modified: None,
            });
            candidate.count += 1;
            candidate.modified = candidate.modified.max(modified);
        }
    }
    if projects.len() >= MAX_PROJECTS && !complete && warnings.len() < MAX_WARNINGS {
        warnings.push("Project discovery safety limit reached; results may be partial.".to_owned());
    }
    let mut candidates: Vec<_> = projects.into_values().collect();
    candidates.sort_by(|a, b| b.modified.cmp(&a.modified).then_with(|| a.location.path.cmp(&b.location.path)));
    let projects: Vec<Value> = candidates.into_iter().map(|candidate| {
        let location = candidate.location;
        let name = PathBuf::from(&location.path).file_name()
            .map(|value| value.to_string_lossy().into_owned()).unwrap_or_else(|| location.path.clone());
        json!({ "name": name, "path": location.path, "normalizedPath": location.normalized,
            "availability": location.availability, "alreadyAdded": false,
            "sessionCount": candidate.count, "lastSessionModifiedAtMs": candidate.modified })
    }).collect();
    Ok(json!({ "projects": projects, "complete": complete, "warnings": warnings,
        "sourceRoot": root.to_string_lossy(), "scannedFiles": scanned, "skippedFiles": skipped }))
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("pilo-discovery-{}-{}", std::process::id(),
                std::time::SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
            fs::create_dir_all(path.join("sessions/bucket-with-dashes")).unwrap();
            fs::create_dir_all(path.join("project-with-dashes")).unwrap();
            Self(path)
        }
        fn write(&self, index: usize, cwd: &Path) {
            let header = json!({"type":"session", "version":3, "cwd":cwd.to_string_lossy()});
            fs::write(self.0.join(format!("sessions/bucket-with-dashes/{index}.jsonl")), format!("{header}\n")).unwrap();
        }
    }
    impl Drop for Fixture { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }

    #[test]
    fn discovers_other_projects_after_more_than_500_sessions() {
        let fixture = Fixture::new();
        for index in 0..520 { fixture.write(index, &fixture.0.join("project-with-dashes")); }
        fixture.write(520, &fixture.0.join("missing-project"));
        let report = scan(&fixture.0.join("sessions"), MAX_FILES, Duration::from_secs(60)).unwrap();
        assert_eq!(report["complete"], true);
        let projects = report["projects"].as_array().unwrap();
        assert_eq!(projects.len(), 2);
        assert!(projects.iter().any(|project| project["sessionCount"] == 520));
        assert!(projects.iter().any(|project| project["availability"] == "missing"));
    }

    #[test]
    fn reports_truncation_and_corruption_instead_of_silent_success() {
        let fixture = Fixture::new();
        fixture.write(1, &fixture.0.join("project-with-dashes"));
        let root = fixture.0.join("sessions");
        assert_eq!(scan(&root, 0, SCAN_BUDGET).unwrap()["complete"], false);
        fs::write(root.join("bucket-with-dashes/bad.jsonl"), "{broken\n").unwrap();
        let report = scan(&root, MAX_FILES, SCAN_BUDGET).unwrap();
        assert_eq!(report["skippedFiles"], 1);
        assert_eq!(report["complete"], false);
        assert_eq!(report["projects"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn empty_root_and_oversized_headers_are_bounded() {
        let fixture = Fixture::new();
        assert_eq!(scan(&fixture.0.join("absent"), MAX_FILES, SCAN_BUDGET).unwrap()["complete"], true);
        let path = fixture.0.join("sessions/bucket-with-dashes/large.jsonl");
        fs::write(&path, "x".repeat(MAX_HEADER_BYTES as usize + 10)).unwrap();
        assert!(read_header(&path).unwrap_err().contains("64 KiB"));
    }
}
