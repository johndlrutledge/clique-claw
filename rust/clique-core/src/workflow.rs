// clique-core/src/workflow.rs
//! Workflow parsing and status update logic.

use crate::types::{Phase, WorkflowData, WorkflowItem};
use regex::Regex;
use serde_yaml::Value;
use std::collections::HashMap;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum WorkflowError {
    #[error("Failed to parse YAML: {0}")]
    ParseError(String),
    #[error("Item not found: {0}")]
    ItemNotFound(String),
    #[error("Update failed: {0}")]
    UpdateError(String),
}

/// Mapping of workflow IDs to phases based on BMad methodology
fn get_phase_map() -> HashMap<&'static str, i32> {
    let mut map = HashMap::new();
    // Phase 0 - Discovery
    map.insert("brainstorm", 0);
    map.insert("brainstorm-project", 0);
    map.insert("research", 0);
    map.insert("product-brief", 0);
    // Phase 1 - Planning
    map.insert("prd", 1);
    map.insert("validate-prd", 1);
    map.insert("ux-design", 1);
    map.insert("create-ux-design", 1);
    // Phase 2 - Solutioning
    map.insert("architecture", 2);
    map.insert("create-architecture", 2);
    map.insert("epics-stories", 2);
    map.insert("create-epics-and-stories", 2);
    map.insert("test-design", 2);
    map.insert("implementation-readiness", 2);
    // Phase 3 - Implementation
    map.insert("sprint-planning", 3);
    map
}

/// Mapping of workflow IDs to agents
fn get_agent_map() -> HashMap<&'static str, &'static str> {
    let mut map = HashMap::new();
    map.insert("brainstorm", "analyst");
    map.insert("brainstorm-project", "analyst");
    map.insert("research", "analyst");
    map.insert("product-brief", "analyst");
    map.insert("prd", "pm");
    map.insert("validate-prd", "pm");
    map.insert("ux-design", "ux-designer");
    map.insert("create-ux-design", "ux-designer");
    map.insert("architecture", "architect");
    map.insert("create-architecture", "architect");
    map.insert("epics-stories", "pm");
    map.insert("create-epics-and-stories", "pm");
    map.insert("test-design", "tea");
    map.insert("implementation-readiness", "architect");
    map.insert("sprint-planning", "sm");
    map
}

fn infer_phase(workflow_id: &str) -> Phase {
    let map = get_phase_map();
    Phase::Number(*map.get(workflow_id).unwrap_or(&1))
}

fn infer_agent(workflow_id: &str) -> String {
    let map = get_agent_map();
    map.get(workflow_id).unwrap_or(&"pm").to_string()
}

fn infer_command(workflow_id: &str) -> String {
    workflow_id.to_string()
}

/// Check if a value looks like a file path
fn is_file_path(value: &str) -> bool {
    value.contains('/')
        || value.ends_with(".md")
        || value.ends_with(".yaml")
        || value.ends_with(".yml")
        || value.ends_with(".json")
        || value.ends_with(".txt")
}

/// Parse new format: workflows object with nested status fields
fn parse_new_format(parsed: &Value) -> Vec<WorkflowItem> {
    let mut items = Vec::new();

    for (key, data) in parsed
        .get("workflows")
        .and_then(|v| v.as_mapping())
        .into_iter()
        .flat_map(|m| m.iter())
    {
        let id = key.as_str().unwrap_or_default().to_string();
        let workflow_data = data.as_mapping();

        let raw_status = workflow_data
            .and_then(|m| m.get("status"))
            .and_then(|v| v.as_str())
            .unwrap_or("not_started");

        let output_file = workflow_data
            .and_then(|m| m.get("output_file"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        // Map status: 'complete' -> output_file path, 'not_started' -> 'required'
        let status = if raw_status == "complete" {
            output_file
                .clone()
                .unwrap_or_else(|| "complete".to_string())
        } else if raw_status == "not_started" {
            "required".to_string()
        } else {
            raw_status.to_string()
        };

        let note = workflow_data
            .and_then(|m| m.get("notes").or_else(|| m.get("note")))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        items.push(WorkflowItem {
            id: id.clone(),
            phase: infer_phase(&id),
            status,
            agent: Some(infer_agent(&id)),
            command: Some(infer_command(&id)),
            note,
            output_file,
        });
    }

    // Sort by phase, then by ID
    items.sort_by(|a, b| a.phase.cmp(&b.phase).then_with(|| a.id.cmp(&b.id)));

    items
}

/// Parse flat format: workflow_status object with key-value pairs
fn parse_flat_format(parsed: &Value) -> Vec<WorkflowItem> {
    let mut items = Vec::new();

    for (key, value) in parsed
        .get("workflow_status")
        .and_then(|v| v.as_mapping())
        .into_iter()
        .flat_map(|m| m.iter())
    {
        let id = key.as_str().unwrap_or_default().to_string();
        let status = value.as_str().unwrap_or_default().to_string();

        let output_file = if is_file_path(&status) {
            Some(status.clone())
        } else {
            None
        };

        items.push(WorkflowItem {
            id: id.clone(),
            phase: infer_phase(&id),
            status,
            agent: Some(infer_agent(&id)),
            command: Some(infer_command(&id)),
            note: None,
            output_file,
        });
    }

    // Sort by phase, then by ID
    items.sort_by(|a, b| a.phase.cmp(&b.phase).then_with(|| a.id.cmp(&b.id)));

    items
}

/// Parse old format: workflow_status array of objects
fn parse_old_format(parsed: &Value) -> Vec<WorkflowItem> {
    let mut items = Vec::new();

    if let Some(workflow_status) = parsed.get("workflow_status").and_then(|v| v.as_sequence()) {
        for item in workflow_status {
            let id = item
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();

            let phase = item
                .get("phase")
                .and_then(|v| v.as_i64())
                .map(|n| Phase::Number(n as i32))
                .unwrap_or_else(|| infer_phase(&id));

            let status = item
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();

            let agent = item
                .get("agent")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let command = item
                .get("command")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let note = item
                .get("note")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            items.push(WorkflowItem {
                id,
                phase,
                status,
                agent,
                command,
                note,
                output_file: None,
            });
        }
    }

    items
}

/// Parse workflow status from YAML content
pub fn parse_workflow_status(yaml_content: &str) -> Result<WorkflowData, WorkflowError> {
    let parsed: Value =
        serde_yaml::from_str(yaml_content).map_err(|e| WorkflowError::ParseError(e.to_string()))?;

    // Detect format:
    // - New format: 'workflows' as object with nested status fields
    // - Flat format: 'workflow_status' as object with key-value pairs (id: status)
    // - Old format: 'workflow_status' as array of objects
    let is_new_format = parsed
        .get("workflows")
        .map(|v| v.is_mapping())
        .unwrap_or(false);

    let is_flat_format = parsed
        .get("workflow_status")
        .map(|v| v.is_mapping())
        .unwrap_or(false);

    let items = if is_new_format {
        parse_new_format(&parsed)
    } else if is_flat_format {
        parse_flat_format(&parsed)
    } else {
        parse_old_format(&parsed)
    };

    let get_str = |key: &str| -> String {
        parsed
            .get(key)
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string()
    };

    Ok(WorkflowData {
        last_updated: get_str("last_updated"),
        status: get_str("status"),
        status_note: parsed
            .get("status_note")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        project: parsed
            .get("project")
            .or_else(|| parsed.get("project_name"))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        project_type: get_str("project_type"),
        selected_track: get_str("selected_track"),
        field_type: get_str("field_type"),
        workflow_path: get_str("workflow_path"),
        items,
    })
}

fn escape_regex(s: &str) -> String {
    let special_chars = [
        '.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\',
    ];
    let mut result = String::with_capacity(s.len() * 2);
    for c in s.chars() {
        if special_chars.contains(&c) {
            result.push('\\');
        }
        result.push(c);
    }
    result
}

/// Update workflow item status in YAML content
pub fn update_workflow_status(
    content: &str,
    item_id: &str,
    new_status: &str,
) -> Result<String, WorkflowError> {
    let parsed: Value =
        serde_yaml::from_str(content).map_err(|e| WorkflowError::ParseError(e.to_string()))?;

    let is_new_format = parsed
        .get("workflows")
        .map(|v| v.is_mapping())
        .unwrap_or(false);

    let is_flat_format = parsed
        .get("workflow_status")
        .map(|v| v.is_mapping())
        .unwrap_or(false);

    if is_new_format {
        // New format: workflows object with nested status
        // Pattern: "  itemId:\n    status: value"
        let pattern = format!(
            r"(?m)(^[ \t]*{}:\s*\n[ \t]*status:\s*)\S+",
            escape_regex(item_id)
        );
        let re = Regex::new(&pattern).map_err(|e| WorkflowError::UpdateError(e.to_string()))?;

        if !re.is_match(content) {
            return Err(WorkflowError::ItemNotFound(item_id.to_string()));
        }

        Ok(re
            .replace(content, format!("${{1}}{}", new_status))
            .to_string())
    } else if is_flat_format {
        // Flat format: workflow_status object with key-value pairs
        // Pattern: "  itemId: value" (value can be quoted or unquoted)
        let pattern = format!(
            r#"(?m)(^[ \t]*{}:\s*)["']?[^\n"']+["']?"#,
            escape_regex(item_id)
        );
        let re = Regex::new(&pattern).map_err(|e| WorkflowError::UpdateError(e.to_string()))?;

        if !re.is_match(content) {
            return Err(WorkflowError::ItemNotFound(item_id.to_string()));
        }

        // Quote the new status if it contains special characters
        let quoted_status = if new_status.contains('/') || new_status.contains(':') {
            format!("\"{}\"", new_status)
        } else {
            new_status.to_string()
        };

        Ok(re
            .replace(content, format!("${{1}}{}", quoted_status))
            .to_string())
    } else {
        // Old format: array with id and status fields
        // Pattern: "- id: itemId" followed by "status: value"
        let pattern = format!(
            r#"(?m)(- id: ["']?{}["']?[\s\S]*?status:\s*)["']?[^\s"']+["']?"#,
            escape_regex(item_id)
        );
        let re = Regex::new(&pattern).map_err(|e| WorkflowError::UpdateError(e.to_string()))?;

        if !re.is_match(content) {
            return Err(WorkflowError::ItemNotFound(item_id.to_string()));
        }

        Ok(re
            .replace(content, format!("${{1}}\"{}\"", new_status))
            .to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NEW_FORMAT_YAML: &str = r#"
last_updated: 2025-12-01
status: active
status_note: On track
project: Demo Project
project_type: greenfield
selected_track: web
field_type: default
workflow_path: docs/workflow.yaml
workflows:
  brainstorm:
    status: complete
    output_file: docs/brainstorm.md
  prd:
    status: not_started
    notes: Needs review
  architecture:
    status: skipped
  sprint-planning:
    status: complete
    output_file: _bmad-output/sprint-planning.md
"#;

    const FLAT_FORMAT_YAML: &str = r#"
project: Demo Project
workflow_status:
  brainstorm: required
  prd: docs/prd.md
  test-design: optional
"#;

    const OLD_FORMAT_YAML: &str = r#"
project: Demo Project
workflow_status:
  - id: brainstorm
    phase: 0
    status: required
    agent: analyst
    command: brainstorm
    note: Seed ideas
  - id: prd
    phase: 1
    status: complete
    agent: pm
    command: prd
"#;

    // =========================================================================
    // Parsing Tests - New Format
    // =========================================================================

    #[test]
    fn test_parse_new_format() {
        let result = parse_workflow_status(NEW_FORMAT_YAML).expect("Should parse new format YAML");

        assert_eq!(result.project, "Demo Project");
        assert_eq!(result.last_updated, "2025-12-01");
        assert_eq!(result.status, "active");
        assert_eq!(result.status_note, Some("On track".to_string()));
        assert_eq!(result.items.len(), 4);

        // Check brainstorm (completed with output file)
        let brainstorm = result
            .items
            .iter()
            .find(|i| i.id == "brainstorm")
            .expect("Should find brainstorm");
        assert_eq!(brainstorm.phase, Phase::Number(0));
        assert_eq!(brainstorm.status, "docs/brainstorm.md");
        assert_eq!(
            brainstorm.output_file,
            Some("docs/brainstorm.md".to_string())
        );

        // Check prd (not_started -> required)
        let prd = result
            .items
            .iter()
            .find(|i| i.id == "prd")
            .expect("Should find prd");
        assert_eq!(prd.status, "required");
        assert_eq!(prd.note, Some("Needs review".to_string()));
    }

    #[test]
    fn test_new_format_items_sorted_by_phase() {
        let result = parse_workflow_status(NEW_FORMAT_YAML).expect("Should parse");

        // Verify items are sorted by phase
        for pair in result.items.windows(2) {
            assert!(pair[0].phase <= pair[1].phase);
        }
    }

    #[test]
    fn test_new_format_inferred_agents() {
        let result = parse_workflow_status(NEW_FORMAT_YAML).expect("Should parse");

        let brainstorm = result.items.iter().find(|i| i.id == "brainstorm").unwrap();
        assert_eq!(brainstorm.agent, Some("analyst".to_string()));

        let prd = result.items.iter().find(|i| i.id == "prd").unwrap();
        assert_eq!(prd.agent, Some("pm".to_string()));

        let architecture = result
            .items
            .iter()
            .find(|i| i.id == "architecture")
            .unwrap();
        assert_eq!(architecture.agent, Some("architect".to_string()));
    }

    #[test]
    fn test_new_format_inferred_commands() {
        let result = parse_workflow_status(NEW_FORMAT_YAML).expect("Should parse");

        for item in &result.items {
            assert_eq!(item.command, Some(item.id.clone()));
        }
    }

    // =========================================================================
    // Parsing Tests - Flat Format
    // =========================================================================

    #[test]
    fn test_parse_flat_format() {
        let result =
            parse_workflow_status(FLAT_FORMAT_YAML).expect("Should parse flat format YAML");

        assert_eq!(result.project, "Demo Project");
        assert_eq!(result.items.len(), 3);

        let prd = result
            .items
            .iter()
            .find(|i| i.id == "prd")
            .expect("Should find prd");
        assert_eq!(prd.status, "docs/prd.md");
        assert_eq!(prd.output_file, Some("docs/prd.md".to_string()));
    }

    #[test]
    fn test_flat_format_file_path_detection() {
        let yaml = r#"
project: File Path Test
workflow_status:
  item1: docs/output.md
  item2: path/to/file.yaml
  item3: output.json
  item4: completed
  item5: required
"#;
        let result = parse_workflow_status(yaml).expect("Should parse");

        let item1 = result.items.iter().find(|i| i.id == "item1").unwrap();
        assert_eq!(item1.output_file, Some("docs/output.md".to_string()));

        let item2 = result.items.iter().find(|i| i.id == "item2").unwrap();
        assert_eq!(item2.output_file, Some("path/to/file.yaml".to_string()));

        let item3 = result.items.iter().find(|i| i.id == "item3").unwrap();
        assert_eq!(item3.output_file, Some("output.json".to_string()));

        let item4 = result.items.iter().find(|i| i.id == "item4").unwrap();
        assert_eq!(item4.output_file, None);

        let item5 = result.items.iter().find(|i| i.id == "item5").unwrap();
        assert_eq!(item5.output_file, None);
    }

    // =========================================================================
    // Parsing Tests - Old Format
    // =========================================================================

    #[test]
    fn test_parse_old_format() {
        let result = parse_workflow_status(OLD_FORMAT_YAML).expect("Should parse old format YAML");

        assert_eq!(result.project, "Demo Project");
        assert_eq!(result.items.len(), 2);

        let brainstorm = result
            .items
            .iter()
            .find(|i| i.id == "brainstorm")
            .expect("Should find brainstorm");
        assert_eq!(brainstorm.phase, Phase::Number(0));
        assert_eq!(brainstorm.agent, Some("analyst".to_string()));
        assert_eq!(brainstorm.note, Some("Seed ideas".to_string()));
    }

    #[test]
    fn test_old_format_explicit_phase() {
        let yaml = r#"
project: Phase Test
workflow_status:
  - id: custom-item
    phase: 5
    status: required
"#;
        let result = parse_workflow_status(yaml).expect("Should parse");
        let item = &result.items[0];
        assert_eq!(item.phase, Phase::Number(5));
    }

    #[test]
    fn test_old_format_missing_phase_inferred() {
        let yaml = r#"
project: Infer Phase Test
workflow_status:
  - id: brainstorm
    status: required
"#;
        let result = parse_workflow_status(yaml).expect("Should parse");
        let item = &result.items[0];
        assert_eq!(item.phase, Phase::Number(0)); // brainstorm is phase 0
    }

    // =========================================================================
    // Update Tests
    // =========================================================================

    #[test]
    fn test_update_new_format() {
        let updated = update_workflow_status(NEW_FORMAT_YAML, "prd", "complete")
            .expect("Should update new format");
        assert!(updated.contains("status: complete"));
    }

    #[test]
    fn test_update_flat_format() {
        let updated = update_workflow_status(FLAT_FORMAT_YAML, "prd", "docs/new-prd.md")
            .expect("Should update flat format");
        assert!(updated.contains("prd: \"docs/new-prd.md\""));
    }

    #[test]
    fn test_update_old_format() {
        let updated = update_workflow_status(OLD_FORMAT_YAML, "brainstorm", "done")
            .expect("Should update old format");
        assert!(updated.contains("status: \"done\""));
    }

    #[test]
    fn test_update_item_not_found() {
        let result = update_workflow_status(NEW_FORMAT_YAML, "nonexistent", "done");
        assert!(matches!(result, Err(WorkflowError::ItemNotFound(_))));
    }

    #[test]
    fn test_update_flat_format_item_not_found() {
        let result = update_workflow_status(FLAT_FORMAT_YAML, "missing", "done");
        assert!(matches!(
            result,
            Err(WorkflowError::ItemNotFound(ref id)) if id == "missing"
        ));
    }

    #[test]
    fn test_update_old_format_item_not_found() {
        let result = update_workflow_status(OLD_FORMAT_YAML, "missing", "done");
        assert!(matches!(
            result,
            Err(WorkflowError::ItemNotFound(ref id)) if id == "missing"
        ));
    }

    #[test]
    fn test_update_preserves_structure() {
        let updated =
            update_workflow_status(NEW_FORMAT_YAML, "prd", "complete").expect("Should update");
        // Verify other items are unchanged
        assert!(updated.contains("brainstorm:"));
        assert!(updated.contains("architecture:"));
        // Verify metadata preserved
        assert!(updated.contains("project: Demo Project"));
        assert!(updated.contains("last_updated: 2025-12-01"));
    }

    #[test]
    fn test_update_flat_format_quoting() {
        let yaml = r#"
project: Quote Test
workflow_status:
  item1: required
"#;
        // Status with / should be quoted
        let updated = update_workflow_status(yaml, "item1", "docs/file.md").expect("Should update");
        assert!(updated.contains("\"docs/file.md\"") || updated.contains("'docs/file.md'"));

        // Status with : should be quoted
        let updated = update_workflow_status(yaml, "item1", "status:done").expect("Should update");
        assert!(updated.contains("\"status:done\"") || updated.contains("'status:done'"));
    }

    // =========================================================================
    // Phase/Agent Inference Tests
    // =========================================================================

    #[test]
    fn test_infer_phase() {
        assert_eq!(infer_phase("brainstorm"), Phase::Number(0));
        assert_eq!(infer_phase("brainstorm-project"), Phase::Number(0));
        assert_eq!(infer_phase("research"), Phase::Number(0));
        assert_eq!(infer_phase("product-brief"), Phase::Number(0));

        assert_eq!(infer_phase("prd"), Phase::Number(1));
        assert_eq!(infer_phase("validate-prd"), Phase::Number(1));
        assert_eq!(infer_phase("ux-design"), Phase::Number(1));
        assert_eq!(infer_phase("create-ux-design"), Phase::Number(1));

        assert_eq!(infer_phase("architecture"), Phase::Number(2));
        assert_eq!(infer_phase("create-architecture"), Phase::Number(2));
        assert_eq!(infer_phase("epics-stories"), Phase::Number(2));
        assert_eq!(infer_phase("create-epics-and-stories"), Phase::Number(2));
        assert_eq!(infer_phase("test-design"), Phase::Number(2));
        assert_eq!(infer_phase("implementation-readiness"), Phase::Number(2));

        assert_eq!(infer_phase("sprint-planning"), Phase::Number(3));
        assert_eq!(infer_phase("unknown"), Phase::Number(1)); // default
    }

    #[test]
    fn test_infer_agent() {
        assert_eq!(infer_agent("brainstorm"), "analyst");
        assert_eq!(infer_agent("brainstorm-project"), "analyst");
        assert_eq!(infer_agent("research"), "analyst");
        assert_eq!(infer_agent("product-brief"), "analyst");

        assert_eq!(infer_agent("prd"), "pm");
        assert_eq!(infer_agent("validate-prd"), "pm");
        assert_eq!(infer_agent("epics-stories"), "pm");
        assert_eq!(infer_agent("create-epics-and-stories"), "pm");

        assert_eq!(infer_agent("ux-design"), "ux-designer");
        assert_eq!(infer_agent("create-ux-design"), "ux-designer");

        assert_eq!(infer_agent("architecture"), "architect");
        assert_eq!(infer_agent("create-architecture"), "architect");
        assert_eq!(infer_agent("implementation-readiness"), "architect");

        assert_eq!(infer_agent("test-design"), "tea");
        assert_eq!(infer_agent("sprint-planning"), "sm");

        assert_eq!(infer_agent("unknown"), "pm"); // default
    }

    #[test]
    fn test_is_file_path() {
        assert!(is_file_path("docs/prd.md"));
        assert!(is_file_path("path/to/file.yaml"));
        assert!(is_file_path("output.json"));
        assert!(is_file_path("file.yml"));
        assert!(is_file_path("readme.txt"));

        assert!(!is_file_path("required"));
        assert!(!is_file_path("complete"));
        assert!(!is_file_path("in-progress"));
    }

    // =========================================================================
    // Escape Regex Tests
    // =========================================================================

    #[test]
    fn test_escape_regex_workflow() {
        let escaped = escape_regex("test.item");
        assert!(escaped.contains("\\.")); // Dot escaped

        let escaped = escape_regex("item[0]");
        assert!(escaped.contains("\\[")); // Bracket escaped
        assert!(escaped.contains("\\]")); // Bracket escaped
    }

    #[test]
    fn test_escape_regex_all_special() {
        let input = "a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o";
        let escaped = escape_regex(input);
        assert!(escaped.contains("\\."));
        assert!(escaped.contains("\\*"));
        assert!(escaped.contains("\\+"));
        assert!(escaped.contains("\\?"));
        assert!(escaped.contains("\\^"));
        assert!(escaped.contains("\\$"));
        assert!(escaped.contains("\\{"));
        assert!(escaped.contains("\\}"));
        assert!(escaped.contains("\\("));
        assert!(escaped.contains("\\)"));
        assert!(escaped.contains("\\|"));
        assert!(escaped.contains("\\["));
        assert!(escaped.contains("\\]"));
        assert!(escaped.contains("\\\\"));
    }

    // =========================================================================
    // Error Handling Tests
    // =========================================================================

    #[test]
    fn test_workflow_error_display() {
        let parse_err = WorkflowError::ParseError("test error".to_string());
        assert_eq!(format!("{}", parse_err), "Failed to parse YAML: test error");

        let not_found_err = WorkflowError::ItemNotFound("item-123".to_string());
        assert_eq!(format!("{}", not_found_err), "Item not found: item-123");

        let update_err = WorkflowError::UpdateError("update failed".to_string());
        assert_eq!(format!("{}", update_err), "Update failed: update failed");
    }

    #[test]
    fn test_workflow_error_debug() {
        let err = WorkflowError::ParseError("debug test".to_string());
        let debug_str = format!("{:?}", err);
        assert!(debug_str.contains("ParseError"));
    }

    #[test]
    fn test_invalid_yaml() {
        let yaml = "invalid: yaml: content: [";
        let result = parse_workflow_status(yaml);
        assert!(matches!(result, Err(WorkflowError::ParseError(_))));
    }

    // =========================================================================
    // Edge Cases
    // =========================================================================

    #[test]
    fn test_empty_yaml() {
        let result = parse_workflow_status("");
        // Empty might return empty data or error - shouldn't panic
        let _ = result;
    }

    #[test]
    fn test_project_name_fallback() {
        let yaml = r#"
project_name: Fallback Project
workflow_status:
  item: required
"#;
        let result = parse_workflow_status(yaml).expect("Should parse");
        assert_eq!(result.project, "Fallback Project");
    }

    #[test]
    fn test_missing_metadata_defaults() {
        let yaml = r#"
workflow_status:
  item: required
"#;
        let result = parse_workflow_status(yaml).expect("Should parse");
        assert_eq!(result.project, "");
        assert_eq!(result.last_updated, "");
        assert_eq!(result.status_note, None);
    }

    #[test]
    fn test_new_format_note_vs_notes() {
        // Test that both 'note' and 'notes' fields are handled
        let yaml = r#"
project: Note Test
workflows:
  item1:
    status: not_started
    note: This is a note
  item2:
    status: not_started
    notes: This is notes
"#;
        let result = parse_workflow_status(yaml).expect("Should parse");

        let item1 = result.items.iter().find(|i| i.id == "item1").unwrap();
        assert_eq!(item1.note, Some("This is a note".to_string()));

        let item2 = result.items.iter().find(|i| i.id == "item2").unwrap();
        assert_eq!(item2.note, Some("This is notes".to_string()));
    }

    #[test]
    fn test_new_format_skipped_status() {
        let yaml = r#"
project: Skipped Test
workflows:
  item:
    status: skipped
"#;
        let result = parse_workflow_status(yaml).expect("Should parse");
        let item = &result.items[0];
        assert_eq!(item.status, "skipped");
    }

    #[test]
    fn test_update_with_special_characters_in_id() {
        let yaml = r#"
project: Special ID Test
workflows:
  my.special-item:
    status: not_started
"#;
        let updated =
            update_workflow_status(yaml, "my.special-item", "complete").expect("Should update");
        assert!(updated.contains("status: complete"));
    }

    #[test]
    fn test_parsing_deterministic() {
        // Parse multiple times and verify same result
        let result1 = parse_workflow_status(NEW_FORMAT_YAML).expect("Should parse");
        let result2 = parse_workflow_status(NEW_FORMAT_YAML).expect("Should parse");

        assert_eq!(result1.project, result2.project);
        assert_eq!(result1.items.len(), result2.items.len());

        for (item1, item2) in result1.items.iter().zip(result2.items.iter()) {
            assert_eq!(item1.id, item2.id);
            assert_eq!(item1.status, item2.status);
        }
    }

    #[test]
    fn test_phase_map_completeness() {
        let map = get_phase_map();
        // Verify all known phases are mapped
        assert_eq!(map.get("brainstorm"), Some(&0));
        assert_eq!(map.get("prd"), Some(&1));
        assert_eq!(map.get("architecture"), Some(&2));
        assert_eq!(map.get("sprint-planning"), Some(&3));
    }

    #[test]
    fn test_agent_map_completeness() {
        let map = get_agent_map();
        // Verify all known agents are mapped
        assert_eq!(map.get("brainstorm"), Some(&"analyst"));
        assert_eq!(map.get("prd"), Some(&"pm"));
        assert_eq!(map.get("architecture"), Some(&"architect"));
        assert_eq!(map.get("sprint-planning"), Some(&"sm"));
        assert_eq!(map.get("test-design"), Some(&"tea"));
    }
}
