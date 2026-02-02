//! Clique WASM Bindings
//!
//! WebAssembly bindings for the Clique core library,
//! exposing workflow and sprint parsing functions to JavaScript.

use clique_core::is_inside_workspace;
#[cfg(target_arch = "wasm32")]
use clique_core::{
    parse_sprint_status, parse_workflow_status, update_story_status, update_workflow_status,
};
#[cfg(target_arch = "wasm32")]
use serde_wasm_bindgen;
use wasm_bindgen::prelude::*;

/// Parse workflow status from YAML content.
/// Returns WorkflowData as a JS value or error.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn parse_workflow_status_wasm(yaml_content: &str) -> Result<JsValue, JsError> {
    let result = parse_workflow_status(yaml_content).map_err(|e| JsError::new(&e.to_string()))?;

    serde_wasm_bindgen::to_value(&result).map_err(|e| JsError::new(&e.to_string()))
}

/// Parse sprint status from YAML content.
/// Returns SprintData as a JS value or error.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn parse_sprint_status_wasm(yaml_content: &str) -> Result<JsValue, JsError> {
    let result = parse_sprint_status(yaml_content).map_err(|e| JsError::new(&e.to_string()))?;

    serde_wasm_bindgen::to_value(&result).map_err(|e| JsError::new(&e.to_string()))
}

/// Update workflow item status in YAML content.
/// Returns updated YAML content or error.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn update_workflow_status_wasm(
    content: &str,
    item_id: &str,
    new_status: &str,
) -> Result<String, JsError> {
    update_workflow_status(content, item_id, new_status).map_err(|e| JsError::new(&e.to_string()))
}

/// Update story status in YAML content.
/// Returns updated YAML content or error.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn update_story_status_wasm(
    content: &str,
    story_id: &str,
    new_status: &str,
) -> Result<String, JsError> {
    update_story_status(content, story_id, new_status).map_err(|e| JsError::new(&e.to_string()))
}

/// Check if a file path is inside the workspace root.
#[wasm_bindgen]
pub fn is_inside_workspace_wasm(file_path: &str, workspace_root: &str) -> bool {
    is_inside_workspace(file_path, workspace_root)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_arch = "wasm32")]
    use clique_core::types::{SprintData, WorkflowData};

    // =========================================================================
    // WASM32-specific Tests (only run on WASM target)
    // =========================================================================

    #[cfg(target_arch = "wasm32")]
    #[test]
    fn test_parse_workflow_wasm() {
        let yaml = r#"
project: Test
workflows:
  brainstorm:
    status: complete
    output_file: docs/brainstorm.md
"#;
        let result = parse_workflow_status_wasm(yaml).expect("Should parse workflow YAML");
        let data: WorkflowData =
            serde_wasm_bindgen::from_value(result).expect("Should deserialize WorkflowData");
        assert_eq!(data.project, "Test");
        assert!(data.items.iter().any(|item| item.id == "brainstorm"));
    }

    #[cfg(target_arch = "wasm32")]
    #[test]
    fn test_parse_sprint_wasm() {
        let yaml = r#"
project: Test
project_key: TST
development_status:
  epic-1: in-progress
  1-story: backlog
"#;
        let result = parse_sprint_status_wasm(yaml).expect("Should parse sprint YAML");
        let data: SprintData =
            serde_wasm_bindgen::from_value(result).expect("Should deserialize SprintData");
        assert_eq!(data.project, "Test");
        assert!(data.epics.iter().any(|epic| epic.id == "epic-1"));
    }

    #[cfg(target_arch = "wasm32")]
    #[test]
    fn test_update_workflow_status_wasm_success() {
        let yaml = r#"
project: Test
workflows:
  item1:
    status: not_started
"#;
        let result = update_workflow_status_wasm(yaml, "item1", "complete");
        assert!(result.is_ok());
        let updated = result.unwrap();
        assert!(updated.contains("status: complete"));
    }

    #[cfg(target_arch = "wasm32")]
    #[test]
    fn test_update_workflow_status_wasm_not_found() {
        let yaml = r#"
project: Test
workflows:
  item1:
    status: not_started
"#;
        let result = update_workflow_status_wasm(yaml, "nonexistent", "complete");
        assert!(result.is_err());
    }

    #[cfg(target_arch = "wasm32")]
    #[test]
    fn test_update_story_status_wasm_success() {
        let yaml = r#"
project: Test
project_key: TST
development_status:
  epic-1: backlog
  1-story: backlog
"#;
        let result = update_story_status_wasm(yaml, "1-story", "done");
        assert!(result.is_ok());
        let updated = result.unwrap();
        assert!(updated.contains("1-story: done"));
    }

    #[cfg(target_arch = "wasm32")]
    #[test]
    fn test_update_story_status_wasm_not_found() {
        let yaml = r#"
project: Test
project_key: TST
development_status:
  epic-1: backlog
  1-story: backlog
"#;
        let result = update_story_status_wasm(yaml, "nonexistent-story", "done");
        assert!(result.is_err());
    }

    #[cfg(target_arch = "wasm32")]
    #[test]
    fn test_parse_workflow_status_wasm_error() {
        let invalid_yaml = "[invalid yaml";
        let result = parse_workflow_status_wasm(invalid_yaml);
        assert!(result.is_err());
    }

    #[cfg(target_arch = "wasm32")]
    #[test]
    fn test_parse_sprint_status_wasm_error() {
        let invalid_yaml = "[invalid yaml";
        let result = parse_sprint_status_wasm(invalid_yaml);
        assert!(result.is_err());
    }

    // =========================================================================
    // Native Tests (run on all targets including native)
    // These tests only use is_inside_workspace_wasm which works on native
    // =========================================================================

    #[test]
    fn test_validation_wasm() {
        #[cfg(windows)]
        {
            assert!(is_inside_workspace_wasm(r"C:\ws\file.md", r"C:\ws"));
            assert!(!is_inside_workspace_wasm(r"C:\other\file.md", r"C:\ws"));
        }

        #[cfg(not(windows))]
        {
            assert!(is_inside_workspace_wasm("/ws/file.md", "/ws"));
            assert!(!is_inside_workspace_wasm("/other/file.md", "/ws"));
        }
    }

    #[test]
    fn test_validation_wasm_path_traversal_blocked() {
        // Path traversal should be blocked on all platforms
        assert!(!is_inside_workspace_wasm("/ws/../etc/passwd", "/ws"));
        assert!(!is_inside_workspace_wasm(
            "/ws/docs/../../etc/passwd",
            "/ws"
        ));
    }

    #[test]
    fn test_validation_wasm_empty_paths() {
        assert!(!is_inside_workspace_wasm("", "/ws"));
        assert!(!is_inside_workspace_wasm("/ws/file.md", ""));
        assert!(!is_inside_workspace_wasm("", ""));
    }

    #[test]
    fn test_validation_wasm_workspace_root() {
        // Path equal to workspace should be inside
        assert!(is_inside_workspace_wasm("/ws", "/ws"));
    }

    #[test]
    fn test_validation_wasm_deep_traversal() {
        // Multiple levels of traversal should be blocked
        assert!(!is_inside_workspace_wasm("/ws/../../../etc/passwd", "/ws"));
    }

    #[test]
    fn test_validation_wasm_similar_prefix() {
        // Paths with similar prefixes should not match
        assert!(!is_inside_workspace_wasm("/ws-extra/file.md", "/ws"));
        assert!(!is_inside_workspace_wasm("/workspace/file.md", "/ws"));
    }
}
