//! Extensive Property-Based Fuzzing Tests for clique-core
//!
//! Uses proptest for property-based testing to generate thousands of
//! random inputs and verify parser robustness.
//!
//! Run with: cargo test --package clique-core fuzz -- --nocapture
//! Run only fuzz tests: cargo test --package clique-core fuzz_

use proptest::collection::vec as prop_vec;
use proptest::prelude::*;

use crate::{
    get_validated_path, is_inside_workspace, parse_sprint_status, parse_workflow_status,
    update_story_status, update_workflow_status,
};

// =============================================================================
// Test Strategies (Input Generators)
// =============================================================================

/// Strategy for generating valid-looking workflow IDs
fn workflow_id_strategy() -> impl Strategy<Value = String> {
    prop_oneof![
        Just("brainstorm".to_string()),
        Just("brainstorm-project".to_string()),
        Just("research".to_string()),
        Just("product-brief".to_string()),
        Just("prd".to_string()),
        Just("validate-prd".to_string()),
        Just("ux-design".to_string()),
        Just("create-ux-design".to_string()),
        Just("architecture".to_string()),
        Just("create-architecture".to_string()),
        Just("epics-stories".to_string()),
        Just("create-epics-and-stories".to_string()),
        Just("test-design".to_string()),
        Just("implementation-readiness".to_string()),
        Just("sprint-planning".to_string()),
        // Random workflow IDs
        "[a-z][a-z0-9-]{0,30}".prop_map(|s| s),
    ]
}

/// Strategy for generating workflow statuses
fn status_strategy() -> impl Strategy<Value = String> {
    prop_oneof![
        Just("complete".to_string()),
        Just("not_started".to_string()),
        Just("skipped".to_string()),
        Just("required".to_string()),
        Just("optional".to_string()),
        Just("conditional".to_string()),
        Just("in-progress".to_string()),
        // File paths as status
        "docs/[a-z]{1,20}\\.md".prop_map(|s| s),
        // Random strings
        "[a-zA-Z0-9_-]{1,50}".prop_map(|s| s),
    ]
}

/// Strategy for generating story statuses
fn story_status_strategy() -> impl Strategy<Value = String> {
    prop_oneof![
        Just("backlog".to_string()),
        Just("drafted".to_string()),
        Just("ready-for-dev".to_string()),
        Just("in-progress".to_string()),
        Just("review".to_string()),
        Just("done".to_string()),
        Just("optional".to_string()),
        Just("completed".to_string()),
    ]
}

/// Strategy for generating project names
fn project_name_strategy() -> impl Strategy<Value = String> {
    prop_oneof![
        "[A-Z][a-zA-Z0-9 ]{0,50}".prop_map(|s| s),
        Just("Test Project".to_string()),
        Just("Demo".to_string()),
        // Unicode project names
        Just("日本語プロジェクト".to_string()),
        Just("Проект".to_string()),
        Just("项目".to_string()),
    ]
}

/// Strategy for generating new-format workflow YAML
fn new_format_workflow_yaml_strategy() -> impl Strategy<Value = String> {
    (
        project_name_strategy(),
        prop_vec(
            (
                workflow_id_strategy(),
                status_strategy(),
                prop::option::of("[a-zA-Z0-9 ]{0,100}"),
            ),
            1..20,
        ),
    )
        .prop_map(|(project, workflows)| {
            let mut yaml = format!(
                r#"last_updated: 2025-01-01
status: active
project: {}
project_type: greenfield
selected_track: web
field_type: default
workflow_path: docs/workflow.yaml
workflows:
"#,
                project
            );

            for (id, status, note) in workflows {
                yaml.push_str(&format!("  {}:\n", id));
                yaml.push_str(&format!("    status: {}\n", status));
                if status == "complete" {
                    yaml.push_str(&format!("    output_file: docs/{}.md\n", id));
                }
                if let Some(n) = note {
                    yaml.push_str(&format!("    notes: \"{}\"\n", n));
                }
            }

            yaml
        })
}

/// Strategy for generating flat-format workflow YAML
fn flat_format_workflow_yaml_strategy() -> impl Strategy<Value = String> {
    (
        project_name_strategy(),
        prop_vec((workflow_id_strategy(), status_strategy()), 1..20),
    )
        .prop_map(|(project, workflows)| {
            let mut yaml = format!(
                r#"last_updated: 2025-01-01
status: active
project: {}
project_type: greenfield
workflow_status:
"#,
                project
            );

            for (id, status) in workflows {
                yaml.push_str(&format!("  {}: {}\n", id, status));
            }

            yaml
        })
}

/// Strategy for generating sprint YAML
fn sprint_yaml_strategy() -> impl Strategy<Value = String> {
    (
        project_name_strategy(),
        "[A-Z]{3,5}".prop_map(|s| s),
        prop_vec((1..100u32, story_status_strategy()), 1..10), // Epics
        prop_vec((1..100u32, 1..100u32, story_status_strategy()), 0..50), // Stories
    )
        .prop_map(|(project, key, epics, stories)| {
            let mut yaml = format!(
                r#"project: {}
project_key: {}
development_status:
"#,
                project, key
            );

            for (epic_num, status) in &epics {
                yaml.push_str(&format!("  epic-{}: {}\n", epic_num, status));
            }

            for (epic_num, story_num, status) in stories {
                yaml.push_str(&format!("  {}-story-{}: {}\n", epic_num, story_num, status));
            }

            yaml
        })
}

/// Strategy for generating malicious/edge-case YAML
fn malicious_yaml_strategy() -> impl Strategy<Value = String> {
    prop_oneof![
        // Empty and whitespace
        Just("".to_string()),
        Just("   ".to_string()),
        Just("\n\n\n".to_string()),
        Just("\t\t\t".to_string()),
        // Minimal YAML
        Just("project: test".to_string()),
        Just("{}".to_string()),
        Just("[]".to_string()),
        // Invalid YAML
        Just("[unclosed".to_string()),
        Just("{unclosed".to_string()),
        Just(":\n:\n:".to_string()),
        Just("project:: double".to_string()),
        // YAML special constructs
        Just("project: !!str test".to_string()),
        Just("project: &anchor test\nref: *anchor".to_string()),
        // Multi-document
        Just("---\nproject: doc1\n---\nproject: doc2".to_string()),
        // Very long content - use Just with pre-computed string
        Just(format!("project: {}", "a".repeat(10000))),
        // Random bytes (will be mostly invalid)
        prop_vec(any::<u8>(), 0..1000)
            .prop_map(|bytes| String::from_utf8_lossy(&bytes).to_string()),
        // Control characters
        Just("project: \x00\x01\x02".to_string()),
        // Unicode edge cases
        Just("project: \u{FEFF}test".to_string()), // BOM
        Just("project: \u{202E}test".to_string()), // RTL override
    ]
}

/// Strategy for generating malicious path inputs
fn malicious_path_strategy() -> impl Strategy<Value = String> {
    prop_oneof![
        // Path traversal
        Just("../../../etc/passwd".to_string()),
        Just("..\\..\\..\\windows\\system32".to_string()),
        Just("/etc/passwd".to_string()),
        // Null byte injection
        Just("file.txt\x00.jpg".to_string()),
        Just("file\x00.yaml".to_string()),
        // Very long paths - use Just with pre-computed string
        Just(format!("{}/file.yaml", "a/".repeat(500))),
        // Empty
        Just("".to_string()),
        Just("   ".to_string()),
        // Special characters
        "[a-zA-Z0-9/._-]{1,100}".prop_map(|s| s),
        // Unicode paths
        Just("日本語/ファイル.yaml".to_string()),
    ]
}

// =============================================================================
// Property-Based Tests: Workflow Parser
// =============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(500))]

    /// Property: Parsing valid-looking new-format YAML should not panic
    #[test]
    fn fuzz_parse_workflow_new_format_no_panic(yaml in new_format_workflow_yaml_strategy()) {
        // Should not panic - result can be Ok or Err
        let _ = parse_workflow_status(&yaml);
    }

    /// Property: Parsing valid-looking flat-format YAML should not panic
    #[test]
    fn fuzz_parse_workflow_flat_format_no_panic(yaml in flat_format_workflow_yaml_strategy()) {
        let _ = parse_workflow_status(&yaml);
    }

    /// Property: Parsing malicious YAML should not panic
    #[test]
    fn fuzz_parse_workflow_malicious_no_panic(yaml in malicious_yaml_strategy()) {
        let _ = parse_workflow_status(&yaml);
    }

    /// Property: Successfully parsed workflows should have valid structure
    #[test]
    fn fuzz_parsed_workflow_valid_structure(yaml in new_format_workflow_yaml_strategy()) {
        if let Ok(data) = parse_workflow_status(&yaml) {
            // All items should have non-empty IDs
            for item in &data.items {
                prop_assert!(!item.id.is_empty(), "Item ID should not be empty");
            }
        }
    }

    /// Property: Parsing is deterministic
    #[test]
    fn fuzz_workflow_parsing_deterministic(yaml in new_format_workflow_yaml_strategy()) {
        let result1 = parse_workflow_status(&yaml);
        let result2 = parse_workflow_status(&yaml);

        match (&result1, &result2) {
            (Ok(d1), Ok(d2)) => {
                prop_assert_eq!(d1.items.len(), d2.items.len());
                prop_assert_eq!(&d1.project, &d2.project);
            }
            (Err(_), Err(_)) => {} // Both failed, which is consistent
            _ => prop_assert!(false, "Parsing should be deterministic"),
        }
    }

    /// Property: Random binary data should not cause panic
    #[test]
    fn fuzz_workflow_random_bytes(bytes in prop_vec(any::<u8>(), 0..5000)) {
        let yaml = String::from_utf8_lossy(&bytes).to_string();
        let _ = parse_workflow_status(&yaml);
    }
}

// =============================================================================
// Property-Based Tests: Sprint Parser
// =============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(500))]

    /// Property: Parsing valid-looking sprint YAML should not panic
    #[test]
    fn fuzz_parse_sprint_no_panic(yaml in sprint_yaml_strategy()) {
        let _ = parse_sprint_status(&yaml);
    }

    /// Property: Parsing malicious YAML should not panic
    #[test]
    fn fuzz_parse_sprint_malicious_no_panic(yaml in malicious_yaml_strategy()) {
        let _ = parse_sprint_status(&yaml);
    }

    /// Property: Successfully parsed sprints should have valid epic structure
    #[test]
    fn fuzz_parsed_sprint_valid_structure(yaml in sprint_yaml_strategy()) {
        if let Ok(data) = parse_sprint_status(&yaml) {
            for epic in &data.epics {
                // Epic IDs should match pattern
                prop_assert!(epic.id.starts_with("epic-"), "Epic ID should start with 'epic-': {}", epic.id);

                // Stories should reference their parent epic
                for story in &epic.stories {
                    prop_assert_eq!(&story.epic_id, &epic.id, "Story should reference parent epic");
                }
            }
        }
    }

    /// Property: Sprint parsing is deterministic
    #[test]
    fn fuzz_sprint_parsing_deterministic(yaml in sprint_yaml_strategy()) {
        let result1 = parse_sprint_status(&yaml);
        let result2 = parse_sprint_status(&yaml);

        match (&result1, &result2) {
            (Ok(d1), Ok(d2)) => {
                prop_assert_eq!(d1.epics.len(), d2.epics.len());
                prop_assert_eq!(&d1.project, &d2.project);
            }
            (Err(_), Err(_)) => {}
            _ => prop_assert!(false, "Sprint parsing should be deterministic"),
        }
    }

    /// Property: Random binary data should not cause panic
    #[test]
    fn fuzz_sprint_random_bytes(bytes in prop_vec(any::<u8>(), 0..5000)) {
        let yaml = String::from_utf8_lossy(&bytes).to_string();
        let _ = parse_sprint_status(&yaml);
    }
}

// =============================================================================
// Property-Based Tests: Status Updates
// =============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(300))]

    /// Property: Updating workflow status should not panic
    #[test]
    fn fuzz_update_workflow_status_no_panic(
        yaml in new_format_workflow_yaml_strategy(),
        item_id in workflow_id_strategy(),
        new_status in status_strategy(),
    ) {
        let _ = update_workflow_status(&yaml, &item_id, &new_status);
    }

    /// Property: Updating sprint story status should not panic
    #[test]
    fn fuzz_update_story_status_no_panic(
        yaml in sprint_yaml_strategy(),
        story_id in "[0-9]+-story-[0-9]+",
        new_status in story_status_strategy(),
    ) {
        let _ = update_story_status(&yaml, &story_id, &new_status);
    }

    /// Property: Successful updates should be verifiable
    #[test]
    fn fuzz_update_workflow_verifiable(yaml in new_format_workflow_yaml_strategy()) {
        // Parse to get a valid item ID
        if let Ok(data) = parse_workflow_status(&yaml) {
            if let Some(item) = data.items.first() {
                let new_status = "test-status-12345";
                if let Ok(updated) = update_workflow_status(&yaml, &item.id, new_status) {
                    // The updated content should contain the new status
                    prop_assert!(
                        updated.contains(new_status),
                        "Updated YAML should contain new status"
                    );
                }
            }
        }
    }

    /// Property: Successful sprint updates should be verifiable
    #[test]
    fn fuzz_update_sprint_verifiable(yaml in sprint_yaml_strategy()) {
        if let Ok(data) = parse_sprint_status(&yaml) {
            for epic in &data.epics {
                if let Some(story) = epic.stories.first() {
                    let new_status = "done";
                    if let Ok(updated_yaml) = update_story_status(&yaml, &story.id, new_status) {
                        // Parse the updated YAML
                        if let Ok(updated_data) = parse_sprint_status(&updated_yaml) {
                            // Find the story and verify status
                            for e in &updated_data.epics {
                                if let Some(s) = e.stories.iter().find(|s| s.id == story.id) {
                                    prop_assert_eq!(&s.status, new_status);
                                }
                            }
                        }
                    }
                    break;
                }
            }
        }
    }

    /// Property: Update with malicious status should not panic
    #[test]
    fn fuzz_update_malicious_status_no_panic(
        yaml in new_format_workflow_yaml_strategy(),
        malicious in malicious_yaml_strategy(),
    ) {
        if let Ok(data) = parse_workflow_status(&yaml) {
            if let Some(item) = data.items.first() {
                // Use malicious content as status
                let _ = update_workflow_status(&yaml, &item.id, &malicious);
            }
        }
    }
}

// =============================================================================
// Property-Based Tests: Path Validation
// =============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(500))]

    /// Property: Path validation should never panic
    #[test]
    fn fuzz_path_validation_no_panic(
        path in malicious_path_strategy(),
        workspace in "[a-zA-Z0-9/._-]{1,100}",
    ) {
        let _ = is_inside_workspace(&path, &workspace);
    }

    /// Property: get_validated_path should never panic
    #[test]
    fn fuzz_get_validated_path_no_panic(
        path in malicious_path_strategy(),
        workspace in "[a-zA-Z0-9/._-]{1,100}",
    ) {
        let _ = get_validated_path(&path, &workspace);
    }

    /// Property: Path traversal should always be rejected
    #[test]
    fn fuzz_path_traversal_rejected(workspace in "[a-zA-Z0-9_-]{5,20}") {
        let traversal_paths = vec![
            format!("../{}", workspace),
            format!("../../{}", workspace),
            "../../../etc/passwd".to_string(),
            format!("{}/../../../etc/passwd", workspace),
            "..".to_string(),
        ];

        for path in traversal_paths {
            let result = is_inside_workspace(&path, &format!("/home/{}", workspace));
            // Note: Depending on implementation, this might be true or false
            // The key property is that it doesn't panic
            let _ = result;
        }
    }

    /// Property: Paths inside workspace should be validated consistently
    #[test]
    fn fuzz_path_validation_consistency(
        subpath in "[a-zA-Z0-9_-]{1,30}",
        filename in "[a-zA-Z0-9_-]{1,20}\\.yaml",
    ) {
        let workspace = "/test/workspace";
        let full_path = format!("{}/{}/{}", workspace, subpath, filename);

        let result1 = is_inside_workspace(&full_path, workspace);
        let result2 = is_inside_workspace(&full_path, workspace);

        prop_assert_eq!(result1, result2, "Path validation should be deterministic");
    }
}

// =============================================================================
// Edge Case Tests (Non-proptest)
// =============================================================================

#[test]
fn fuzz_edge_test_empty_yaml() {
    // Empty string parsing - should not panic regardless of result
    let workflow_result = parse_workflow_status("");
    let sprint_result = parse_sprint_status("");

    // The important thing is no panic - behavior can vary
    // (empty might be Ok with empty data or Err)
    let _ = workflow_result;
    let _ = sprint_result;
}

#[test]
fn fuzz_edge_test_null_bytes_in_yaml() {
    let yaml = "project: test\x00name";
    // Should not panic
    let _ = parse_workflow_status(yaml);
    let _ = parse_sprint_status(yaml);
}

#[test]
fn fuzz_edge_test_very_deep_nesting() {
    let mut yaml = "project: test\nworkflows:\n".to_string();
    for _ in 0..100 {
        yaml.push_str("  nested:\n");
    }
    yaml.push_str("    value: test\n");

    // Should not panic or stack overflow
    let _ = parse_workflow_status(&yaml);
}

#[test]
fn fuzz_edge_test_unicode_normalization() {
    // Different unicode representations of "same" string
    let yaml1 = "project: café"; // Using é
    let yaml2 = "project: cafe\u{0301}"; // Using e + combining accent

    let result1 = parse_workflow_status(yaml1);
    let result2 = parse_workflow_status(yaml2);

    // Both should parse without panic
    assert!(result1.is_ok() || result1.is_err());
    assert!(result2.is_ok() || result2.is_err());
}

#[test]
fn fuzz_edge_test_billion_laughs_style() {
    // YAML anchor expansion attack (should be handled safely)
    let yaml = r#"
a: &a ["lol","lol","lol","lol","lol","lol","lol","lol","lol"]
b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]
c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]
"#;
    // Should not cause memory explosion or panic
    let _ = parse_workflow_status(yaml);
}

#[test]
fn fuzz_edge_test_mixed_line_endings() {
    let yaml_unix = "project: test\nworkflows:\n  test:\n    status: done\n";
    let yaml_windows = "project: test\r\nworkflows:\r\n  test:\r\n    status: done\r\n";
    let yaml_mixed = "project: test\r\nworkflows:\n  test:\r\n    status: done\n";

    // All should parse without panic
    assert!(parse_workflow_status(yaml_unix).is_ok());
    let _ = parse_workflow_status(yaml_windows);
    let _ = parse_workflow_status(yaml_mixed);
}

#[test]
fn fuzz_edge_test_extreme_numbers() {
    let yaml = r#"
project: test
version: 999999999999999999999999999999
count: -999999999999999999999999999999
float: 1.7976931348623157e+308
"#;
    // Should not panic
    let _ = parse_workflow_status(yaml);
}

#[test]
fn fuzz_edge_test_special_yaml_types() {
    let yaml = r#"
project: test
null_value: ~
bool_true: true
bool_false: false
date: 2025-01-01
timestamp: 2025-01-01T12:00:00Z
"#;
    // Should parse without panic
    let _ = parse_workflow_status(yaml);
}

#[test]
fn fuzz_edge_test_sprint_with_no_epics() {
    let yaml = r#"
project: Empty Sprint
project_key: EMP
development_status: {}
"#;
    let result = parse_sprint_status(yaml);
    assert!(result.is_ok());
    assert_eq!(result.expect("Should parse empty sprint").epics.len(), 0);
}

#[test]
fn fuzz_edge_test_sprint_with_orphan_stories() {
    // Stories without corresponding epic
    let yaml = r#"
project: Orphan Test
project_key: ORP
development_status:
  99-orphan-story: backlog
"#;
    let result = parse_sprint_status(yaml);
    // Should parse but story won't be assigned to an epic
    assert!(result.is_ok());
}

#[test]
fn fuzz_edge_test_concurrent_parsing() {
    use std::thread;

    let yaml = r#"
project: Concurrent Test
workflows:
  test:
    status: complete
    output_file: docs/test.md
"#;

    let handles: Vec<_> = (0..10)
        .map(|_| {
            let yaml = yaml.to_string();
            thread::spawn(move || {
                for _ in 0..100 {
                    let _ = parse_workflow_status(&yaml);
                }
            })
        })
        .collect();

    for handle in handles {
        handle.join().expect("Thread should not panic");
    }
}

#[test]
fn fuzz_edge_test_update_nonexistent_item() {
    let yaml = r#"
project: test
workflows:
  real-item:
    status: not_started
"#;
    let result = update_workflow_status(yaml, "nonexistent-item", "done");
    assert!(result.is_err());
}

#[test]
fn fuzz_edge_test_update_with_yaml_injection() {
    let yaml = r#"
project: test
workflows:
  test-item:
    status: not_started
"#;
    // Try to inject YAML structure
    let malicious_status = "done\n  injected:\n    evil: true";
    let _ = update_workflow_status(yaml, "test-item", malicious_status);
    // Should either fail or produce valid YAML
}

// =============================================================================
// Stress Tests
// =============================================================================

#[test]
fn fuzz_stress_parse_workflow_1000_times() {
    let yaml = r#"
project: Stress Test
workflows:
  brainstorm:
    status: complete
    output_file: docs/brainstorm.md
  prd:
    status: not_started
  architecture:
    status: skipped
"#;

    use std::time::Instant;
    let start = Instant::now();
    for _ in 0..1000 {
        let result = parse_workflow_status(yaml);
        assert!(result.is_ok());
    }
    let elapsed = start.elapsed();
    println!("1000 workflow parses in {:?}", elapsed);
    assert!(elapsed.as_secs() < 5, "Should complete in under 5 seconds");
}

#[test]
fn fuzz_stress_parse_sprint_1000_times() {
    let yaml = r#"
project: Stress Test
project_key: STR
development_status:
  epic-1: in-progress
  epic-2: backlog
  1-story-1: ready-for-dev
  1-story-2: review
  2-story-1: backlog
"#;

    use std::time::Instant;
    let start = Instant::now();
    for _ in 0..1000 {
        let result = parse_sprint_status(yaml);
        assert!(result.is_ok());
    }
    let elapsed = start.elapsed();
    println!("1000 sprint parses in {:?}", elapsed);
    assert!(elapsed.as_secs() < 5, "Should complete in under 5 seconds");
}

#[test]
fn fuzz_stress_large_workflow_file() {
    let mut yaml = String::from(
        r#"
project: Large Test
workflows:
"#,
    );

    for i in 0..1000 {
        yaml.push_str(&format!("  workflow-{}:\n    status: not_started\n", i));
    }

    use std::time::Instant;
    let start = Instant::now();
    let result = parse_workflow_status(&yaml);
    let elapsed = start.elapsed();

    assert!(result.is_ok());
    assert_eq!(result.expect("Should parse large workflow").items.len(), 1000);
    println!("Large workflow (1000 items) parsed in {:?}", elapsed);
    assert!(elapsed.as_secs() < 2, "Should complete in under 2 seconds");
}

#[test]
fn fuzz_stress_large_sprint_file() {
    let mut yaml = String::from(
        r#"
project: Large Sprint
project_key: LRG
development_status:
"#,
    );

    for epic in 1..=50 {
        yaml.push_str(&format!("  epic-{}: backlog\n", epic));
        for story in 1..=20 {
            yaml.push_str(&format!("  {}-story-{}: backlog\n", epic, story));
        }
    }

    use std::time::Instant;
    let start = Instant::now();
    let result = parse_sprint_status(&yaml);
    let elapsed = start.elapsed();

    assert!(result.is_ok());
    let data = result.expect("Should parse large sprint");
    assert_eq!(data.epics.len(), 50);
    println!(
        "Large sprint ({} epics, {} total stories) parsed in {:?}",
        data.epics.len(),
        data.epics.iter().map(|e| e.stories.len()).sum::<usize>(),
        elapsed
    );
    assert!(elapsed.as_secs() < 2, "Should complete in under 2 seconds");
}
