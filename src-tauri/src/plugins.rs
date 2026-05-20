use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use serde::Serialize;

const MANIFEST_NAMES: [&str; 2] = ["plugin.json", "caveman.plugin.json"];
const MAX_MANIFEST_BYTES: u64 = 256 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifestFile {
    pub path: String,
    pub manifest_json: Option<String>,
    pub error: Option<String>,
}

pub fn load_plugin_manifest_files(directory: impl AsRef<Path>) -> Result<Vec<PluginManifestFile>> {
    let directory = directory.as_ref();
    if !directory.exists() {
        return Err(anyhow!(
            "Plugin directory does not exist: {}",
            directory.display()
        ));
    }

    if !directory.is_dir() {
        return Err(anyhow!(
            "Plugin path is not a directory: {}",
            directory.display()
        ));
    }

    let mut candidates = Vec::new();
    for entry in fs::read_dir(directory)
        .with_context(|| format!("Could not read plugin directory {}", directory.display()))?
    {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            for manifest_name in MANIFEST_NAMES {
                let manifest_path = path.join(manifest_name);
                if manifest_path.is_file() {
                    candidates.push(manifest_path);
                }
            }
        } else if is_manifest_file(&path) {
            candidates.push(path);
        }
    }

    candidates.sort();
    Ok(candidates
        .into_iter()
        .map(read_manifest_file)
        .collect::<Vec<_>>())
}

fn read_manifest_file(path: PathBuf) -> PluginManifestFile {
    let path_label = path.display().to_string();
    match fs::metadata(&path) {
        Ok(metadata) if metadata.len() > MAX_MANIFEST_BYTES => PluginManifestFile {
            path: path_label,
            manifest_json: None,
            error: Some(format!(
                "Manifest is too large. Limit is {} bytes.",
                MAX_MANIFEST_BYTES
            )),
        },
        Ok(_) => match fs::read_to_string(&path) {
            Ok(contents) => PluginManifestFile {
                path: path_label,
                manifest_json: Some(contents),
                error: None,
            },
            Err(error) => PluginManifestFile {
                path: path_label,
                manifest_json: None,
                error: Some(error.to_string()),
            },
        },
        Err(error) => PluginManifestFile {
            path: path_label,
            manifest_json: None,
            error: Some(error.to_string()),
        },
    }
}

fn is_manifest_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| MANIFEST_NAMES.contains(&name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scans_top_level_and_child_plugin_manifests() {
        let root =
            std::env::temp_dir().join(format!("caveman-plugin-loader-{}", uuid::Uuid::new_v4()));
        let child = root.join("backend-pack");
        fs::create_dir_all(&child).expect("create plugin temp dir");
        fs::write(
            root.join("plugin.json"),
            r#"{"id":"root","name":"Root","version":"1.0.0","contributes":{}}"#,
        )
        .expect("write root manifest");
        fs::write(
            child.join("caveman.plugin.json"),
            r#"{"id":"backend-pack","name":"Backend Pack","version":"1.0.0","contributes":{}}"#,
        )
        .expect("write child manifest");
        fs::write(root.join("readme.txt"), "ignored").expect("write ignored file");

        let manifests = load_plugin_manifest_files(&root).expect("scan manifests");

        assert_eq!(manifests.len(), 2);
        assert!(manifests
            .iter()
            .any(|manifest| manifest.path.ends_with("plugin.json")));
        assert!(manifests
            .iter()
            .any(|manifest| manifest.path.ends_with("caveman.plugin.json")));

        fs::remove_dir_all(root).expect("clean plugin temp dir");
    }

    #[test]
    fn rejects_missing_plugin_directory() {
        let missing = std::env::temp_dir().join(format!(
            "missing-caveman-plugin-loader-{}",
            uuid::Uuid::new_v4()
        ));

        let error = load_plugin_manifest_files(missing).expect_err("missing dir");

        assert!(error.to_string().contains("does not exist"));
    }
}
