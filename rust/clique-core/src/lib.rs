//! Clique Core Library
//!
//! Pure Rust implementation of workflow and sprint parsing logic
//! for the Clique VS Code extension.

pub mod sprint;
pub mod types;
pub mod validation;
pub mod workflow;

#[cfg(test)]
mod fuzz_tests;

// Re-export main types and functions for convenience
pub use sprint::{SprintError, parse_sprint_status, update_story_status};
pub use types::{Epic, Phase, SprintData, Story, WorkflowData, WorkflowItem};
pub use validation::{get_validated_path, is_inside_workspace};
pub use workflow::{WorkflowError, parse_workflow_status, update_workflow_status};

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================================
    // Public API Export Tests
    // =========================================================================

    #[test]
    fn test_library_exports() {
        // Verify that all public exports are accessible
        let _: fn(&str) -> Result<WorkflowData, WorkflowError> = parse_workflow_status;
        let _: fn(&str) -> Result<SprintData, SprintError> = parse_sprint_status;
        let _: fn(&str, &str, &str) -> Result<String, WorkflowError> = update_workflow_status;
        let _: fn(&str, &str, &str) -> Result<String, SprintError> = update_story_status;
        let _: fn(&str, &str) -> bool = is_inside_workspace;
        let _: fn(&str, &str) -> Option<String> = get_validated_path;
    }

    #[test]
    fn test_type_exports() {
        // Verify all public types are accessible
        let _item = WorkflowItem {
            id: "test".to_string(),
            phase: Phase::Number(1),
            status: "required".to_string(),
            agent: None,
            command: None,
            note: None,
            output_file: None,
        };

        let _workflow_data = WorkflowData {
            last_updated: "2025-01-01".to_string(),
            status: "active".to_string(),
            status_note: None,
            project: "Test".to_string(),
            project_type: "greenfield".to_string(),
            selected_track: "web".to_string(),
            field_type: "default".to_string(),
            workflow_path: "".to_string(),
            items: vec![],
        };

        let _story = Story {
            id: "1-test".to_string(),
            status: "backlog".to_string(),
            epic_id: "epic-1".to_string(),
        };

        let _epic = Epic {
            id: "epic-1".to_string(),
            name: "Test Epic".to_string(),
            status: "in-progress".to_string(),
            stories: vec![],
        };

        let _sprint_data = SprintData {
            project: "Test".to_string(),
            project_key: "TST".to_string(),
            epics: vec![],
        };
    }

    // =========================================================================
    // Integration Tests - Full Workflow
    // =========================================================================

    #[test]
    fn test_full_workflow_parse_and_update_cycle() {
        let yaml = r#"
project: Integration Test
project_type: greenfield
workflow_status:
  brainstorm: required
  prd: required
  architecture: required
"#;

        // Parse the workflow
        let data = parse_workflow_status(yaml).expect("Should parse");
        assert_eq!(data.project, "Integration Test");
        assert_eq!(data.items.len(), 3);

        // Update first item
        let updated =
            update_workflow_status(yaml, "brainstorm", "complete").expect("Should update");

        // Re-parse and verify
        let updated_data = parse_workflow_status(&updated).expect("Should re-parse");
        let brainstorm = updated_data
            .items
            .iter()
            .find(|i| i.id == "brainstorm")
            .unwrap();
        assert_eq!(brainstorm.status, "complete");

        // Other items should be unchanged
        let prd = updated_data.items.iter().find(|i| i.id == "prd").unwrap();
        assert_eq!(prd.status, "required");
    }

    #[test]
    fn test_full_sprint_parse_and_update_cycle() {
        let yaml = r#"
project: Sprint Integration Test
project_key: SIT
development_status:
  epic-1: in-progress
  1-story-a: backlog
  1-story-b: backlog
  epic-2: backlog
  2-story-c: backlog
"#;

        // Parse the sprint
        let data = parse_sprint_status(yaml).expect("Should parse");
        assert_eq!(data.project, "Sprint Integration Test");
        assert_eq!(data.epics.len(), 2);

        // Update a story
        let updated = update_story_status(yaml, "1-story-a", "in-progress").expect("Should update");

        // Re-parse and verify
        let updated_data = parse_sprint_status(&updated).expect("Should re-parse");
        let epic1 = updated_data
            .epics
            .iter()
            .find(|e| e.id == "epic-1")
            .unwrap();
        let story_a = epic1.stories.iter().find(|s| s.id == "1-story-a").unwrap();
        assert_eq!(story_a.status, "in-progress");

        // Update through full cycle
        let updated2 = update_story_status(&updated, "1-story-a", "review").expect("Should update");
        let updated3 = update_story_status(&updated2, "1-story-a", "done").expect("Should update");

        let final_data = parse_sprint_status(&updated3).expect("Should re-parse");
        let epic1 = final_data.epics.iter().find(|e| e.id == "epic-1").unwrap();
        let story_a = epic1.stories.iter().find(|s| s.id == "1-story-a").unwrap();
        assert_eq!(story_a.status, "done");
    }

    // =========================================================================
    // Path Validation Integration Tests
    // =========================================================================

    #[test]
    fn test_path_validation_integration() {
        // Windows paths
        assert!(is_inside_workspace(
            r"C:\project\src\main.rs",
            r"C:\project"
        ));
        assert_eq!(
            get_validated_path(r"C:\project\src\main.rs", r"C:\project"),
            Some(r"C:\project\src\main.rs".to_string())
        );

        // Unix paths
        assert!(is_inside_workspace(
            "/home/user/project/src/main.rs",
            "/home/user/project"
        ));
        assert_eq!(
            get_validated_path("/home/user/project/src/main.rs", "/home/user/project"),
            Some("/home/user/project/src/main.rs".to_string())
        );

        // Path traversal blocked
        assert!(!is_inside_workspace("/project/../etc/passwd", "/project"));
        assert_eq!(
            get_validated_path("/project/../etc/passwd", "/project"),
            None
        );
    }

    // =========================================================================
    // Error Propagation Tests
    // =========================================================================

    #[test]
    fn test_workflow_error_propagation() {
        // Invalid YAML should return ParseError
        let err = parse_workflow_status("[invalid yaml").unwrap_err();
        let msg = format!("{}", err);
        assert!(msg.contains("Failed to parse YAML"));
    }

    #[test]
    fn test_sprint_error_propagation() {
        // Invalid YAML should return ParseError
        let err = parse_sprint_status("[invalid yaml").unwrap_err();
        let msg = format!("{}", err);
        assert!(msg.contains("Failed to parse YAML"));
    }

    #[test]
    fn test_update_nonexistent_item_error() {
        let yaml = r#"
project: Test
workflows:
  existing: 
    status: not_started
"#;
        let result = update_workflow_status(yaml, "nonexistent", "done");
        assert!(matches!(
            result,
            Err(WorkflowError::ItemNotFound(ref id)) if id == "nonexistent"
        ));
    }

    #[test]
    fn test_update_nonexistent_story_error() {
        let yaml = r#"
project: Test
project_key: TST
development_status:
  epic-1: backlog
  1-existing: backlog
"#;
        let result = update_story_status(yaml, "1-nonexistent", "done");
        assert!(matches!(
            result,
            Err(SprintError::StoryNotFound(ref id)) if id == "1-nonexistent"
        ));
    }

    // =========================================================================
    // Regression Guard Tests
    // =========================================================================

    #[test]
    fn regression_workflow_preserves_all_fields() {
        // Ensure parsing preserves all expected fields
        let yaml = r#"
last_updated: 2025-01-15
status: active
status_note: On track for release
project: Full Field Test
project_type: brownfield
selected_track: mobile
field_type: custom
workflow_path: docs/workflows/main.yaml
workflows:
  brainstorm:
    status: complete
    output_file: docs/brainstorm.md
    notes: Initial brainstorm session complete
"#;
        let data = parse_workflow_status(yaml).expect("Should parse");

        // Verify all metadata fields
        assert_eq!(data.last_updated, "2025-01-15");
        assert_eq!(data.status, "active");
        assert_eq!(data.status_note, Some("On track for release".to_string()));
        assert_eq!(data.project, "Full Field Test");
        assert_eq!(data.project_type, "brownfield");
        assert_eq!(data.selected_track, "mobile");
        assert_eq!(data.field_type, "custom");
        assert_eq!(data.workflow_path, "docs/workflows/main.yaml");

        // Verify workflow item
        let item = &data.items[0];
        assert_eq!(item.id, "brainstorm");
        assert_eq!(item.status, "docs/brainstorm.md"); // complete -> output_file
        assert_eq!(item.output_file, Some("docs/brainstorm.md".to_string()));
        assert_eq!(
            item.note,
            Some("Initial brainstorm session complete".to_string())
        );
        assert_eq!(item.phase, Phase::Number(0));
        assert_eq!(item.agent, Some("analyst".to_string()));
        assert_eq!(item.command, Some("brainstorm".to_string()));
    }

    #[test]
    fn regression_sprint_preserves_all_fields() {
        // Ensure parsing preserves all expected fields
        let yaml = r#"
project: Full Sprint Test
project_key: FST
development_status:
  epic-1: in-progress
  1-create-database: ready-for-dev
  1-create-api: review
"#;
        let data = parse_sprint_status(yaml).expect("Should parse");

        // Verify metadata
        assert_eq!(data.project, "Full Sprint Test");
        assert_eq!(data.project_key, "FST");

        // Verify epic
        assert_eq!(data.epics.len(), 1);
        let epic = &data.epics[0];
        assert_eq!(epic.id, "epic-1");
        assert_eq!(epic.name, "Epic 1");
        assert_eq!(epic.status, "in-progress");
        assert_eq!(epic.stories.len(), 2);

        // Verify stories
        let story1 = epic
            .stories
            .iter()
            .find(|s| s.id == "1-create-database")
            .unwrap();
        assert_eq!(story1.status, "ready-for-dev");
        assert_eq!(story1.epic_id, "epic-1");

        let story2 = epic
            .stories
            .iter()
            .find(|s| s.id == "1-create-api")
            .unwrap();
        assert_eq!(story2.status, "review");
    }

    #[test]
    fn regression_path_validation_security() {
        // Security-critical: path traversal must always be blocked
        let attack_paths = vec![
            "/workspace/../../../etc/passwd",
            "/workspace/docs/../../../etc/passwd",
            r"C:\workspace\..\..\..\windows\system32\config\sam",
            r"C:\workspace\docs\..\..\..\windows\system32",
            "/workspace/./../../etc/passwd",
            r"C:\workspace\.\..\..\windows",
        ];

        for path in attack_paths {
            let workspace = if path.starts_with('/') {
                "/workspace"
            } else {
                r"C:\workspace"
            };

            assert!(!is_inside_workspace(path, workspace));
            assert!(get_validated_path(path, workspace).is_none());
        }
    }

    #[test]
    fn regression_update_preserves_yaml_structure() {
        let yaml = r#"# Header comment
project: Structure Test
# Another comment
workflows:
  item1:
    status: not_started
    notes: Important note
  item2:
    status: complete
    output_file: docs/item2.md
"#;

        let updated = update_workflow_status(yaml, "item1", "complete").expect("Should update");

        // Verify the structure is preserved (item2 unchanged)
        let data = parse_workflow_status(&updated).expect("Should re-parse");
        let item2 = data.items.iter().find(|i| i.id == "item2").unwrap();
        assert_eq!(item2.status, "docs/item2.md");
        assert_eq!(item2.output_file, Some("docs/item2.md".to_string()));
    }
}
