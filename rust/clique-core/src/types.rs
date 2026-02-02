// clique-core/src/types.rs
//! Core types for the Clique extension.

use serde::{Deserialize, Serialize};

/// A workflow item from bmm-workflow-status.yaml
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowItem {
    pub id: String,
    pub phase: Phase,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_file: Option<String>,
}

/// Phase can be a number (0-3) or "prerequisite"
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Phase {
    Number(i32),
    #[serde(rename = "prerequisite")]
    Prerequisite,
}

impl Default for Phase {
    fn default() -> Self {
        Phase::Number(1)
    }
}

/// Workflow data parsed from bmm-workflow-status.yaml
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowData {
    pub last_updated: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_note: Option<String>,
    pub project: String,
    pub project_type: String,
    pub selected_track: String,
    pub field_type: String,
    pub workflow_path: String,
    pub items: Vec<WorkflowItem>,
}

/// Story status in sprint tracking
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum StoryStatus {
    Backlog,
    Drafted,
    ReadyForDev,
    InProgress,
    Review,
    Done,
    Optional,
    Completed,
    #[serde(other)]
    Unknown,
}

impl std::fmt::Display for StoryStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoryStatus::Backlog => write!(f, "backlog"),
            StoryStatus::Drafted => write!(f, "drafted"),
            StoryStatus::ReadyForDev => write!(f, "ready-for-dev"),
            StoryStatus::InProgress => write!(f, "in-progress"),
            StoryStatus::Review => write!(f, "review"),
            StoryStatus::Done => write!(f, "done"),
            StoryStatus::Optional => write!(f, "optional"),
            StoryStatus::Completed => write!(f, "completed"),
            StoryStatus::Unknown => write!(f, "unknown"),
        }
    }
}

/// A story within an epic
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Story {
    pub id: String,
    pub status: String,
    pub epic_id: String,
}

/// An epic containing stories
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Epic {
    pub id: String,
    pub name: String,
    pub status: String,
    pub stories: Vec<Story>,
}

/// Sprint data parsed from sprint-status.yaml
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SprintData {
    pub project: String,
    pub project_key: String,
    pub epics: Vec<Epic>,
}

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================================
    // Phase Tests - Comprehensive ordering and serialization
    // =========================================================================

    #[test]
    fn test_phase_ordering() {
        assert!(Phase::Number(0) < Phase::Number(1));
        assert!(Phase::Number(1) < Phase::Number(2));
        assert!(Phase::Number(2) < Phase::Number(3));
        // Negative numbers
        assert!(Phase::Number(-1) < Phase::Number(0));
    }

    #[test]
    fn test_phase_equality() {
        assert_eq!(Phase::Number(1), Phase::Number(1));
        assert_ne!(Phase::Number(1), Phase::Number(2));
        assert_eq!(Phase::Prerequisite, Phase::Prerequisite);
        assert_ne!(Phase::Number(0), Phase::Prerequisite);
    }

    #[test]
    fn test_phase_default() {
        let default_phase = Phase::default();
        assert_eq!(default_phase, Phase::Number(1));
    }

    #[test]
    fn test_phase_serialization_number() {
        let phase = Phase::Number(2);
        let json = serde_json::to_string(&phase).expect("Should serialize Phase::Number");
        assert_eq!(json, "2");
    }

    #[test]
    fn test_phase_deserialization_number() {
        let phase: Phase = serde_json::from_str("3").expect("Should deserialize number");
        assert_eq!(phase, Phase::Number(3));
    }

    #[test]
    fn test_phase_debug() {
        let phase = Phase::Number(1);
        let debug_str = format!("{:?}", phase);
        assert!(debug_str.contains("Number"));
        assert!(debug_str.contains("1"));
    }

    #[test]
    fn test_phase_clone() {
        let original = Phase::Number(5);
        let cloned = original.clone();
        assert_eq!(original, cloned);
    }

    // =========================================================================
    // StoryStatus Tests - All variants and display
    // =========================================================================

    #[test]
    fn test_story_status_display() {
        assert_eq!(StoryStatus::Backlog.to_string(), "backlog");
        assert_eq!(StoryStatus::ReadyForDev.to_string(), "ready-for-dev");
        assert_eq!(StoryStatus::InProgress.to_string(), "in-progress");
    }

    #[test]
    fn test_story_status_display_all_variants() {
        // Test all variants for complete coverage
        assert_eq!(StoryStatus::Backlog.to_string(), "backlog");
        assert_eq!(StoryStatus::Drafted.to_string(), "drafted");
        assert_eq!(StoryStatus::ReadyForDev.to_string(), "ready-for-dev");
        assert_eq!(StoryStatus::InProgress.to_string(), "in-progress");
        assert_eq!(StoryStatus::Review.to_string(), "review");
        assert_eq!(StoryStatus::Done.to_string(), "done");
        assert_eq!(StoryStatus::Optional.to_string(), "optional");
        assert_eq!(StoryStatus::Completed.to_string(), "completed");
        assert_eq!(StoryStatus::Unknown.to_string(), "unknown");
    }

    #[test]
    fn test_story_status_serialization() {
        let status = StoryStatus::InProgress;
        let json = serde_json::to_string(&status).expect("Should serialize");
        assert_eq!(json, "\"in-progress\"");
    }

    #[test]
    fn test_story_status_deserialization() {
        let status: StoryStatus =
            serde_json::from_str("\"ready-for-dev\"").expect("Should deserialize");
        assert_eq!(status, StoryStatus::ReadyForDev);
    }

    #[test]
    fn test_story_status_unknown_fallback() {
        // Unknown values should deserialize to Unknown variant
        let status: StoryStatus =
            serde_json::from_str("\"unrecognized-status\"").expect("Should deserialize unknown");
        assert_eq!(status, StoryStatus::Unknown);
    }

    #[test]
    fn test_story_status_equality() {
        assert_eq!(StoryStatus::Done, StoryStatus::Done);
        assert_ne!(StoryStatus::Done, StoryStatus::Backlog);
    }

    #[test]
    fn test_story_status_debug() {
        let status = StoryStatus::Review;
        let debug_str = format!("{:?}", status);
        assert_eq!(debug_str, "Review");
    }

    #[test]
    fn test_story_status_clone() {
        let original = StoryStatus::InProgress;
        let cloned = original.clone();
        assert_eq!(original, cloned);
    }

    // =========================================================================
    // WorkflowItem Tests
    // =========================================================================

    #[test]
    fn test_workflow_item_full_serialization() {
        let item = WorkflowItem {
            id: "test-item".to_string(),
            phase: Phase::Number(2),
            status: "complete".to_string(),
            agent: Some("architect".to_string()),
            command: Some("create-architecture".to_string()),
            note: Some("Architecture design notes".to_string()),
            output_file: Some("docs/architecture.md".to_string()),
        };

        let json = serde_json::to_string(&item).expect("Should serialize WorkflowItem");
        assert!(json.contains("\"id\":\"test-item\""));
        assert!(json.contains("\"phase\":2"));
        assert!(json.contains("\"status\":\"complete\""));
        assert!(json.contains("\"agent\":\"architect\""));
        assert!(json.contains("\"outputFile\":\"docs/architecture.md\""));
    }

    #[test]
    fn test_workflow_item_minimal_serialization() {
        // Test that optional fields are skipped when None
        let item = WorkflowItem {
            id: "minimal".to_string(),
            phase: Phase::Number(0),
            status: "required".to_string(),
            agent: None,
            command: None,
            note: None,
            output_file: None,
        };

        let json = serde_json::to_string(&item).expect("Should serialize");
        assert!(!json.contains("agent"));
        assert!(!json.contains("command"));
        assert!(!json.contains("note"));
        assert!(!json.contains("outputFile"));
    }

    #[test]
    fn test_workflow_item_deserialization() {
        let json = r#"{"id":"test","phase":1,"status":"done","agent":"pm"}"#;
        let item: WorkflowItem = serde_json::from_str(json).expect("Should deserialize");
        assert_eq!(item.id, "test");
        assert_eq!(item.phase, Phase::Number(1));
        assert_eq!(item.agent, Some("pm".to_string()));
    }

    #[test]
    fn test_workflow_item_equality() {
        let item1 = WorkflowItem {
            id: "test".to_string(),
            phase: Phase::Number(1),
            status: "done".to_string(),
            agent: None,
            command: None,
            note: None,
            output_file: None,
        };
        let item2 = item1.clone();
        assert_eq!(item1, item2);
    }

    #[test]
    fn test_workflow_item_debug() {
        let item = WorkflowItem {
            id: "debug-test".to_string(),
            phase: Phase::Number(0),
            status: "required".to_string(),
            agent: None,
            command: None,
            note: None,
            output_file: None,
        };
        let debug_str = format!("{:?}", item);
        assert!(debug_str.contains("debug-test"));
        assert!(debug_str.contains("WorkflowItem"));
    }

    // =========================================================================
    // WorkflowData Tests
    // =========================================================================

    #[test]
    fn test_workflow_data_serialization() {
        let data = WorkflowData {
            last_updated: "2025-01-01".to_string(),
            status: "active".to_string(),
            status_note: Some("On track".to_string()),
            project: "Test Project".to_string(),
            project_type: "greenfield".to_string(),
            selected_track: "web".to_string(),
            field_type: "default".to_string(),
            workflow_path: "docs/workflow.yaml".to_string(),
            items: vec![],
        };

        let json = serde_json::to_string(&data).expect("Should serialize");
        assert!(json.contains("\"lastUpdated\":\"2025-01-01\""));
        assert!(json.contains("\"statusNote\":\"On track\""));
        assert!(json.contains("\"projectType\":\"greenfield\""));
    }

    #[test]
    fn test_workflow_data_no_status_note() {
        let data = WorkflowData {
            last_updated: "2025-01-01".to_string(),
            status: "active".to_string(),
            status_note: None,
            project: "Test".to_string(),
            project_type: "".to_string(),
            selected_track: "".to_string(),
            field_type: "".to_string(),
            workflow_path: "".to_string(),
            items: vec![],
        };

        let json = serde_json::to_string(&data).expect("Should serialize");
        assert!(!json.contains("statusNote"));
    }

    #[test]
    fn test_workflow_data_equality() {
        let data1 = WorkflowData {
            last_updated: "2025-01-01".to_string(),
            status: "active".to_string(),
            status_note: None,
            project: "Test".to_string(),
            project_type: "".to_string(),
            selected_track: "".to_string(),
            field_type: "".to_string(),
            workflow_path: "".to_string(),
            items: vec![],
        };
        let data2 = data1.clone();
        assert_eq!(data1, data2);
    }

    // =========================================================================
    // Story Tests
    // =========================================================================

    #[test]
    fn test_story_serialization() {
        let story = Story {
            id: "1-create-feature".to_string(),
            status: "in-progress".to_string(),
            epic_id: "epic-1".to_string(),
        };

        let json = serde_json::to_string(&story).expect("Should serialize");
        assert!(json.contains("\"id\":\"1-create-feature\""));
        assert!(json.contains("\"epicId\":\"epic-1\""));
    }

    #[test]
    fn test_story_deserialization() {
        let json = r#"{"id":"2-test","status":"done","epicId":"epic-2"}"#;
        let story: Story = serde_json::from_str(json).expect("Should deserialize");
        assert_eq!(story.id, "2-test");
        assert_eq!(story.epic_id, "epic-2");
    }

    #[test]
    fn test_story_equality() {
        let story1 = Story {
            id: "test".to_string(),
            status: "backlog".to_string(),
            epic_id: "epic-1".to_string(),
        };
        let story2 = story1.clone();
        assert_eq!(story1, story2);
    }

    #[test]
    fn test_story_debug() {
        let story = Story {
            id: "debug-story".to_string(),
            status: "review".to_string(),
            epic_id: "epic-5".to_string(),
        };
        let debug_str = format!("{:?}", story);
        assert!(debug_str.contains("debug-story"));
        assert!(debug_str.contains("Story"));
    }

    // =========================================================================
    // Epic Tests
    // =========================================================================

    #[test]
    fn test_epic_serialization() {
        let epic = Epic {
            id: "epic-1".to_string(),
            name: "Core Features".to_string(),
            status: "in-progress".to_string(),
            stories: vec![Story {
                id: "1-story-1".to_string(),
                status: "done".to_string(),
                epic_id: "epic-1".to_string(),
            }],
        };

        let json = serde_json::to_string(&epic).expect("Should serialize");
        assert!(json.contains("\"id\":\"epic-1\""));
        assert!(json.contains("\"name\":\"Core Features\""));
        assert!(json.contains("\"stories\":["));
    }

    #[test]
    fn test_epic_with_empty_stories() {
        let epic = Epic {
            id: "epic-empty".to_string(),
            name: "Empty Epic".to_string(),
            status: "backlog".to_string(),
            stories: vec![],
        };

        let json = serde_json::to_string(&epic).expect("Should serialize");
        assert!(json.contains("\"stories\":[]"));
    }

    #[test]
    fn test_epic_equality() {
        let epic1 = Epic {
            id: "epic-1".to_string(),
            name: "Test".to_string(),
            status: "backlog".to_string(),
            stories: vec![],
        };
        let epic2 = epic1.clone();
        assert_eq!(epic1, epic2);
    }

    // =========================================================================
    // SprintData Tests
    // =========================================================================

    #[test]
    fn test_sprint_data_serialization() {
        let data = SprintData {
            project: "Sprint Project".to_string(),
            project_key: "SPR".to_string(),
            epics: vec![],
        };

        let json = serde_json::to_string(&data).expect("Should serialize");
        assert!(json.contains("\"project\":\"Sprint Project\""));
        assert!(json.contains("\"projectKey\":\"SPR\""));
    }

    #[test]
    fn test_sprint_data_with_epics() {
        let data = SprintData {
            project: "Test".to_string(),
            project_key: "TST".to_string(),
            epics: vec![Epic {
                id: "epic-1".to_string(),
                name: "Epic 1".to_string(),
                status: "done".to_string(),
                stories: vec![],
            }],
        };

        let json = serde_json::to_string(&data).expect("Should serialize");
        assert!(json.contains("\"epics\":["));
        assert!(json.contains("\"id\":\"epic-1\""));
    }

    #[test]
    fn test_sprint_data_equality() {
        let data1 = SprintData {
            project: "Test".to_string(),
            project_key: "TST".to_string(),
            epics: vec![],
        };
        let data2 = data1.clone();
        assert_eq!(data1, data2);
    }

    #[test]
    fn test_sprint_data_debug() {
        let data = SprintData {
            project: "Debug Test".to_string(),
            project_key: "DBG".to_string(),
            epics: vec![],
        };
        let debug_str = format!("{:?}", data);
        assert!(debug_str.contains("Debug Test"));
        assert!(debug_str.contains("SprintData"));
    }
}
