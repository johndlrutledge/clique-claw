// clique-core/src/sprint.rs
//! Sprint parsing and story status update logic.

use crate::types::{Epic, SprintData, Story};
use once_cell::sync::Lazy;
use regex::Regex;
use serde_yaml::Value;
use std::collections::HashMap;
use thiserror::Error;

/// Static regex for matching epic IDs (e.g., "epic-1", "epic-2")
static EPIC_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^epic-(\d+)$").expect("Invalid epic regex pattern"));

/// Static regex for matching story prefixes (e.g., "1-", "2-")
static STORY_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^(\d+)-").expect("Invalid story regex pattern"));

#[derive(Error, Debug)]
pub enum SprintError {
    #[error("Failed to parse YAML: {0}")]
    ParseError(String),
    #[error("Story not found: {0}")]
    StoryNotFound(String),
    #[error("Update failed: {0}")]
    UpdateError(String),
}

/// Parse sprint status from YAML content
pub fn parse_sprint_status(yaml_content: &str) -> Result<SprintData, SprintError> {
    let parsed: Value =
        serde_yaml::from_str(yaml_content).map_err(|e| SprintError::ParseError(e.to_string()))?;

    let project = parsed
        .get("project")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown")
        .to_string();

    let project_key = parsed
        .get("project_key")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();

    let dev_status = parsed
        .get("development_status")
        .and_then(|v| v.as_mapping())
        .cloned()
        .unwrap_or_default();

    let mut epics_map: HashMap<String, Epic> = HashMap::new();

    // First pass: identify epics by "epic-N" pattern
    for (key, value) in &dev_status {
        let key_str = key.as_str().unwrap_or_default();
        if let Some(caps) = EPIC_REGEX.captures(key_str) {
            let epic_num = caps.get(1).map(|m| m.as_str()).unwrap_or_default();
            let status = value.as_str().unwrap_or_default().to_string();

            epics_map.insert(
                epic_num.to_string(),
                Epic {
                    id: key_str.to_string(),
                    name: format!("Epic {}", epic_num),
                    status,
                    stories: Vec::new(),
                },
            );
        }
    }

    // Second pass: assign stories to epics
    for (key, value) in &dev_status {
        let key_str = key.as_str().unwrap_or_default();

        // Skip epic entries and retrospectives
        if EPIC_REGEX.is_match(key_str) || key_str.contains("retrospective") {
            continue;
        }

        // Extract epic number from story id (e.g., "4-7-create-admin-staff-domain" -> "4")
        if let Some(caps) = STORY_REGEX.captures(key_str) {
            let epic_num = caps.get(1).map(|m| m.as_str()).unwrap_or_default();

            if let Some(epic) = epics_map.get_mut(epic_num) {
                let status = value.as_str().unwrap_or_default().to_string();
                epic.stories.push(Story {
                    id: key_str.to_string(),
                    status,
                    epic_id: format!("epic-{}", epic_num),
                });
            }
        }
    }

    // Convert map to sorted array (sort by epic number)
    let mut epics: Vec<Epic> = epics_map.into_values().collect();
    epics.sort_by(|a, b| {
        let num_a: i32 = a.id.replace("epic-", "").parse().unwrap_or(0);
        let num_b: i32 = b.id.replace("epic-", "").parse().unwrap_or(0);
        num_a.cmp(&num_b)
    });

    Ok(SprintData {
        project,
        project_key,
        epics,
    })
}

fn escape_regex(s: &str) -> String {
    let special_chars = [
        '.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\', '-',
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

/// Update story status in YAML content
pub fn update_story_status(
    content: &str,
    story_id: &str,
    new_status: &str,
) -> Result<String, SprintError> {
    // Match pattern: "storyId: oldStatus" and replace with "storyId: newStatus"
    let pattern = format!(r"(?m)(^\s*{}:\s*)\S+", escape_regex(story_id));
    let re = Regex::new(&pattern).map_err(|e| SprintError::UpdateError(e.to_string()))?;

    if !re.is_match(content) {
        return Err(SprintError::StoryNotFound(story_id.to_string()));
    }

    Ok(re
        .replace(content, format!("${{1}}{}", new_status))
        .to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SPRINT_YAML: &str = r#"
project: Demo Project
project_key: DMO
development_status:
  epic-2: backlog
  epic-1: in-progress
  1-story-one: ready-for-dev
  1-story-two: review
  2-story-alpha: backlog
  retrospective: done
"#;

    // =========================================================================
    // Parsing Tests
    // =========================================================================

    #[test]
    fn test_parse_sprint_status() {
        let result = parse_sprint_status(SPRINT_YAML).expect("Should parse valid sprint YAML");

        assert_eq!(result.project, "Demo Project");
        assert_eq!(result.project_key, "DMO");
        assert_eq!(result.epics.len(), 2);

        // Check epic-1 (should be first due to sorting)
        let epic1 = &result.epics[0];
        assert_eq!(epic1.id, "epic-1");
        assert_eq!(epic1.name, "Epic 1");
        assert_eq!(epic1.status, "in-progress");
        assert_eq!(epic1.stories.len(), 2);

        // Check epic-2
        let epic2 = &result.epics[1];
        assert_eq!(epic2.id, "epic-2");
        assert_eq!(epic2.stories.len(), 1);
    }

    #[test]
    fn test_stories_assigned_to_correct_epics() {
        let result = parse_sprint_status(SPRINT_YAML).expect("Should parse sprint YAML");

        let epic1 = result
            .epics
            .iter()
            .find(|e| e.id == "epic-1")
            .expect("Should find epic-1");
        let story_ids: Vec<&str> = epic1.stories.iter().map(|s| s.id.as_str()).collect();
        assert!(story_ids.contains(&"1-story-one"));
        assert!(story_ids.contains(&"1-story-two"));

        let epic2 = result
            .epics
            .iter()
            .find(|e| e.id == "epic-2")
            .expect("Should find epic-2");
        let story_ids: Vec<&str> = epic2.stories.iter().map(|s| s.id.as_str()).collect();
        assert!(story_ids.contains(&"2-story-alpha"));
    }

    #[test]
    fn test_retrospective_excluded() {
        let result = parse_sprint_status(SPRINT_YAML).expect("Should parse sprint YAML");

        for epic in &result.epics {
            for story in &epic.stories {
                assert!(!story.id.contains("retrospective"));
            }
        }
    }

    #[test]
    fn test_empty_development_status() {
        let yaml = r#"
project: Empty Project
project_key: EMP
"#;
        let result = parse_sprint_status(yaml).expect("Should parse empty development status");
        assert_eq!(result.project, "Empty Project");
        assert_eq!(result.epics.len(), 0);
    }

    #[test]
    fn test_missing_project_defaults() {
        let yaml = r#"
development_status:
  epic-1: backlog
"#;
        let result = parse_sprint_status(yaml).expect("Should parse with missing project");
        assert_eq!(result.project, "Unknown");
        assert_eq!(result.project_key, "");
    }

    #[test]
    fn test_epic_sorting() {
        let yaml = r#"
project: Sort Test
project_key: SRT
development_status:
  epic-10: backlog
  epic-2: backlog
  epic-1: backlog
  epic-5: backlog
"#;
        let result = parse_sprint_status(yaml).expect("Should parse");
        let epic_ids: Vec<&str> = result.epics.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(epic_ids, vec!["epic-1", "epic-2", "epic-5", "epic-10"]);
    }

    #[test]
    fn test_story_epic_id_reference() {
        let yaml = r#"
project: Reference Test
project_key: REF
development_status:
  epic-3: in-progress
  3-my-story: backlog
"#;
        let result = parse_sprint_status(yaml).expect("Should parse");
        let epic = &result.epics[0];
        assert_eq!(epic.stories[0].epic_id, "epic-3");
    }

    // =========================================================================
    // Update Tests
    // =========================================================================

    #[test]
    fn test_update_story_status() {
        let updated = update_story_status(SPRINT_YAML, "1-story-one", "done")
            .expect("Should update story status");
        assert!(updated.contains("1-story-one: done"));
    }

    #[test]
    fn test_update_story_not_found() {
        let result = update_story_status(SPRINT_YAML, "nonexistent-story", "done");
        assert!(matches!(result, Err(SprintError::StoryNotFound(_))));
    }

    #[test]
    fn test_update_story_preserves_structure() {
        let updated =
            update_story_status(SPRINT_YAML, "1-story-two", "done").expect("Should update");
        // Verify other stories are unchanged
        assert!(updated.contains("1-story-one: ready-for-dev"));
        assert!(updated.contains("2-story-alpha: backlog"));
        // Verify project info is preserved
        assert!(updated.contains("project: Demo Project"));
        assert!(updated.contains("project_key: DMO"));
    }

    #[test]
    fn test_update_story_with_special_characters() {
        let yaml = r#"
project: Special Test
project_key: SPE
development_status:
  epic-1: backlog
  1-my.special-story: backlog
  1-story[0]: backlog
  1-story(test): backlog
"#;
        // Test updating story with dots
        let updated = update_story_status(yaml, "1-my.special-story", "done")
            .expect("Should update story with dot");
        assert!(updated.contains("1-my.special-story: done"));

        // Test updating story with brackets
        let updated = update_story_status(yaml, "1-story[0]", "done")
            .expect("Should update story with brackets");
        assert!(updated.contains("1-story[0]: done"));

        // Test updating story with parentheses
        let updated = update_story_status(yaml, "1-story(test)", "done")
            .expect("Should update story with parens");
        assert!(updated.contains("1-story(test): done"));
    }

    #[test]
    fn test_update_multiple_times() {
        let yaml = r#"
project: Multi Update
project_key: MUL
development_status:
  epic-1: backlog
  1-story: backlog
"#;
        let updated1 = update_story_status(yaml, "1-story", "in-progress").expect("First update");
        assert!(updated1.contains("1-story: in-progress"));

        let updated2 = update_story_status(&updated1, "1-story", "review").expect("Second update");
        assert!(updated2.contains("1-story: review"));

        let updated3 = update_story_status(&updated2, "1-story", "done").expect("Third update");
        assert!(updated3.contains("1-story: done"));
    }

    // =========================================================================
    // Regex Tests
    // =========================================================================

    #[test]
    fn test_static_regex_initialization() {
        // Test that the static regexes are properly initialized
        // by attempting to match against valid patterns
        assert!(EPIC_REGEX.is_match("epic-1"));
        assert!(EPIC_REGEX.is_match("epic-99"));
        assert!(!EPIC_REGEX.is_match("epic-"));
        assert!(!EPIC_REGEX.is_match("not-an-epic"));

        assert!(STORY_REGEX.is_match("1-story"));
        assert!(STORY_REGEX.is_match("99-another-story"));
        assert!(!STORY_REGEX.is_match("story-no-prefix"));
    }

    #[test]
    fn test_epic_regex_edge_cases() {
        // Valid patterns
        assert!(EPIC_REGEX.is_match("epic-0"));
        assert!(EPIC_REGEX.is_match("epic-999"));
        assert!(EPIC_REGEX.is_match("epic-12345"));

        // Invalid patterns
        assert!(!EPIC_REGEX.is_match("EPIC-1")); // Case sensitive
        assert!(!EPIC_REGEX.is_match("epic--1")); // Double dash
        assert!(!EPIC_REGEX.is_match("epic-1-extra")); // Extra content
        assert!(!EPIC_REGEX.is_match("prefix-epic-1")); // Prefix
    }

    #[test]
    fn test_story_regex_edge_cases() {
        // Valid patterns
        assert!(STORY_REGEX.is_match("1-x"));
        assert!(STORY_REGEX.is_match("123-long-story-name"));
        assert!(STORY_REGEX.is_match("0-zero-prefix"));

        // Invalid patterns
        assert!(!STORY_REGEX.is_match("-1-negative")); // Negative-like
        assert!(!STORY_REGEX.is_match("abc-story")); // Non-numeric prefix
    }

    #[test]
    fn test_escape_regex_special_chars() {
        // Test internal escape_regex function
        let escaped = escape_regex("1-my.story[0]");
        assert!(escaped.contains("\\.")); // Dot escaped
        assert!(escaped.contains("\\[")); // Bracket escaped
        assert!(escaped.contains("\\]")); // Bracket escaped
        assert!(escaped.contains("\\-")); // Hyphen escaped
    }

    #[test]
    fn test_escape_regex_all_special_chars() {
        let input = "a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o-p";
        let escaped = escape_regex(input);
        // All special chars should be escaped
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
        assert!(escaped.contains("\\-"));
    }

    // =========================================================================
    // Error Handling Tests
    // =========================================================================

    #[test]
    fn test_malformed_epic_ids_handled_gracefully() {
        // Test that malformed epic IDs don't cause panics
        let yaml = r#"
project: Edge Case Project
project_key: ECP
development_status:
  epic-: in-progress
  -1-story: backlog
  epic-abc: done
  "": empty-key
"#;
        let result = parse_sprint_status(yaml).expect("Should handle malformed epic IDs");
        assert_eq!(result.project, "Edge Case Project");
        // None of the malformed entries should match as epics
        assert_eq!(result.epics.len(), 0);
    }

    #[test]
    fn test_null_values_in_yaml() {
        // Test handling of null/missing values
        let yaml = r#"
project: Null Test
project_key: ~
development_status:
  epic-1: ~
  1-story: ~
"#;
        let result = parse_sprint_status(yaml).expect("Should handle null values");
        assert_eq!(result.project, "Null Test");
        assert_eq!(result.project_key, "");
        // Epic should still be created with empty status
        assert_eq!(result.epics.len(), 1);
        assert_eq!(result.epics[0].status, "");
    }

    #[test]
    fn test_invalid_yaml_returns_error() {
        let yaml = "invalid: yaml: content: [";
        let result = parse_sprint_status(yaml);
        assert!(matches!(result, Err(SprintError::ParseError(_))));
    }

    #[test]
    fn test_sprint_error_display() {
        let parse_err = SprintError::ParseError("test error".to_string());
        assert_eq!(format!("{}", parse_err), "Failed to parse YAML: test error");

        let not_found_err = SprintError::StoryNotFound("story-123".to_string());
        assert_eq!(format!("{}", not_found_err), "Story not found: story-123");

        let update_err = SprintError::UpdateError("update failed".to_string());
        assert_eq!(format!("{}", update_err), "Update failed: update failed");
    }

    #[test]
    fn test_sprint_error_debug() {
        let err = SprintError::ParseError("debug test".to_string());
        let debug_str = format!("{:?}", err);
        assert!(debug_str.contains("ParseError"));
    }

    // =========================================================================
    // Edge Cases
    // =========================================================================

    #[test]
    fn test_story_with_leading_whitespace() {
        let yaml = r#"
project: Whitespace Test
project_key: WS
development_status:
    epic-1: backlog
    1-story: backlog
"#;
        let result = parse_sprint_status(yaml).expect("Should handle leading whitespace");
        assert_eq!(result.epics.len(), 1);
    }

    #[test]
    fn test_large_epic_numbers() {
        let yaml = r#"
project: Large Numbers
project_key: LRG
development_status:
  epic-999: backlog
  999-story: in-progress
"#;
        let result = parse_sprint_status(yaml).expect("Should handle large numbers");
        assert_eq!(result.epics[0].id, "epic-999");
        assert_eq!(result.epics[0].stories[0].epic_id, "epic-999");
    }

    #[test]
    fn test_empty_string_yaml() {
        let result = parse_sprint_status("");
        // Empty string should either parse to empty data or return error
        // The important thing is it doesn't panic
        let _ = result;
    }

    #[test]
    fn test_update_with_empty_status() {
        let yaml = r#"
project: Empty Status Test
project_key: EST
development_status:
  epic-1: backlog
  1-story: in-progress
"#;
        let updated =
            update_story_status(yaml, "1-story", "").expect("Should update to empty status");
        assert!(updated.contains("1-story: "));
    }

    #[test]
    fn test_update_with_complex_status() {
        let yaml = r#"
project: Complex Status Test
project_key: CST
development_status:
  epic-1: backlog
  1-story: backlog
"#;
        let updated = update_story_status(yaml, "1-story", "blocked-by-external-dependency")
            .expect("Should update");
        assert!(updated.contains("1-story: blocked-by-external-dependency"));
    }
}
