// clique-core/src/validation.rs
//! Path validation for workspace containment.

/// Detect if running on Windows based on path characteristics.
/// WASM runs in a host environment, so we detect Windows by path format.
fn is_windows_path(path: &str) -> bool {
    // Windows paths typically start with a drive letter like "C:\" or "c:/"
    // or use backslashes
    if path.len() >= 2 {
        let bytes = path.as_bytes();
        if bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
            return true;
        }
    }
    path.contains('\\')
}

/// Normalize a path for comparison.
/// On Windows-style paths, this lowercases and normalizes separators.
fn normalize_path_str(path_str: &str, is_windows: bool) -> String {
    if is_windows {
        // On Windows, normalize to lowercase and use consistent separators
        path_str.to_lowercase().replace('/', "\\")
    } else {
        path_str.to_string()
    }
}

/// Resolve . and .. components in a path string
fn resolve_path_components(path_str: &str, is_windows: bool) -> String {
    let sep = if is_windows { '\\' } else { '/' };
    let normalized = if is_windows {
        path_str.replace('/', "\\")
    } else {
        path_str.to_string()
    };

    let parts: Vec<&str> = normalized.split(sep).collect();
    let mut resolved: Vec<&str> = Vec::new();

    for part in parts {
        match part {
            ".." => {
                // Only pop if we have something to pop and it's not a drive letter
                if let Some(last) = resolved.last() {
                    // Don't pop drive letters like "C:"
                    if !(last.len() == 2 && last.ends_with(':')) {
                        resolved.pop();
                    }
                }
            }
            "." | "" => {
                // Skip current dir markers and empty parts (except first for absolute paths)
                if resolved.is_empty() && part.is_empty() {
                    // Keep leading empty string for Unix absolute paths
                    if !is_windows {
                        resolved.push(part);
                    }
                }
            }
            _ => {
                resolved.push(part);
            }
        }
    }

    resolved.join(&sep.to_string())
}

/// Validate that a file path is inside the workspace root.
/// This is a pure function that works on path strings without file system access.
pub fn is_inside_workspace(file_path: &str, workspace_root: &str) -> bool {
    // Handle empty inputs
    if file_path.is_empty() || workspace_root.is_empty() {
        return false;
    }

    // Detect Windows based on path format
    let is_windows = is_windows_path(file_path) || is_windows_path(workspace_root);

    // Resolve path components (handle . and ..)
    let resolved_file = resolve_path_components(file_path, is_windows);
    let resolved_root = resolve_path_components(workspace_root, is_windows);

    // Normalize for comparison
    let normalized_file = normalize_path_str(&resolved_file, is_windows);
    let normalized_root = normalize_path_str(&resolved_root, is_windows);

    // Check if file path equals workspace root
    if normalized_file == normalized_root {
        return true;
    }

    // Check if file is under root (with path separator)
    let sep = if is_windows { "\\" } else { "/" };
    let root_prefix = format!("{}{}", normalized_root, sep);

    normalized_file.starts_with(&root_prefix)
}

/// Get validated file path, returns None if path is outside workspace.
pub fn get_validated_path(file_path: &str, workspace_root: &str) -> Option<String> {
    if is_inside_workspace(file_path, workspace_root) {
        Some(file_path.to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================================
    // is_windows_path Tests
    // =========================================================================

    #[test]
    fn test_is_windows_path() {
        assert!(is_windows_path(r"C:\something"));
        assert!(is_windows_path(r"D:\path\to\file"));
        assert!(is_windows_path(r"path\with\backslash"));
        assert!(!is_windows_path("/unix/path"));
        assert!(!is_windows_path("relative/path"));
    }

    #[test]
    fn test_is_windows_path_drive_letters() {
        // All drive letters should be detected
        assert!(is_windows_path(r"A:\path"));
        assert!(is_windows_path(r"Z:\path"));
        assert!(is_windows_path(r"a:\path")); // lowercase
        assert!(is_windows_path(r"z:\path"));
    }

    #[test]
    fn test_is_windows_path_forward_slash() {
        // Windows paths can use forward slashes too, detected by drive letter
        assert!(is_windows_path("C:/path/to/file"));
        assert!(is_windows_path("D:/Users/test"));
    }

    #[test]
    fn test_is_windows_path_short_paths() {
        // Very short paths
        assert!(!is_windows_path(""));
        assert!(!is_windows_path("a"));
        assert!(is_windows_path("C:"));
    }

    #[test]
    fn test_is_windows_path_unc() {
        // UNC paths have backslashes
        assert!(is_windows_path(r"\\server\share\file"));
    }

    // =========================================================================
    // normalize_path_str Tests
    // =========================================================================

    #[test]
    fn test_normalize_path_str_windows() {
        let normalized = normalize_path_str(r"C:\Path\To\File", true);
        assert_eq!(normalized, r"c:\path\to\file");
    }

    #[test]
    fn test_normalize_path_str_windows_mixed_case() {
        let normalized = normalize_path_str(r"C:\PaTh\TO\fIlE", true);
        assert_eq!(normalized, r"c:\path\to\file");
    }

    #[test]
    fn test_normalize_path_str_windows_forward_slashes() {
        let normalized = normalize_path_str("C:/Path/To/File", true);
        assert_eq!(normalized, r"c:\path\to\file");
    }

    #[test]
    fn test_normalize_path_str_unix() {
        let normalized = normalize_path_str("/Path/To/File", false);
        assert_eq!(normalized, "/Path/To/File"); // No case change for Unix
    }

    #[test]
    fn test_normalize_path_str_unix_preserves_case() {
        let normalized = normalize_path_str("/Home/User/README.md", false);
        assert_eq!(normalized, "/Home/User/README.md");
    }

    // =========================================================================
    // resolve_path_components Tests
    // =========================================================================

    #[test]
    fn test_resolve_path_components_single_parent() {
        let resolved = resolve_path_components("/workspace/../other", false);
        assert_eq!(resolved, "/other");
    }

    #[test]
    fn test_resolve_path_components_multiple_parents() {
        let resolved = resolve_path_components("/a/b/c/../../d", false);
        assert_eq!(resolved, "/a/d");
    }

    #[test]
    fn test_resolve_path_components_current_dir() {
        let resolved = resolve_path_components("/a/./b/./c", false);
        assert_eq!(resolved, "/a/b/c");
    }

    #[test]
    fn test_resolve_path_components_mixed() {
        let resolved = resolve_path_components("/a/b/../c/./d/../e", false);
        assert_eq!(resolved, "/a/c/e");
    }

    #[test]
    fn test_resolve_path_components_windows() {
        let resolved = resolve_path_components(r"C:\workspace\..\other", true);
        assert_eq!(resolved, r"C:\other");
    }

    #[test]
    fn test_resolve_path_components_windows_mixed_slashes() {
        let resolved = resolve_path_components("C:/workspace/../other", true);
        assert_eq!(resolved, r"C:\other");
    }

    #[test]
    fn test_resolve_path_components_preserves_drive_letter() {
        // Test that drive letters are not popped by ".."
        let result = resolve_path_components(r"C:\..", true);
        assert!(result.contains("C:"));
    }

    #[test]
    fn test_resolve_path_components_multiple_drive_traversal() {
        let result = resolve_path_components(r"C:\..\..\..\..", true);
        assert!(result.contains("C:"));
    }

    #[test]
    fn test_resolve_path_components_empty() {
        let resolved = resolve_path_components("", false);
        assert_eq!(resolved, "");
    }

    #[test]
    fn test_resolve_path_components_only_parents() {
        let resolved = resolve_path_components("../../..", false);
        assert_eq!(resolved, "");
    }

    #[test]
    fn test_resolve_path_components_absolute_unix() {
        // Root path "/" resolves to empty string after component split
        // The function is designed to work with path validation, not reconstruction
        let resolved = resolve_path_components("/", false);
        // Just verify it doesn't panic and returns something reasonable
        assert!(resolved.is_empty() || resolved == "/");
    }

    // =========================================================================
    // is_inside_workspace Tests - Windows
    // =========================================================================

    #[test]
    fn test_path_inside_workspace_windows() {
        // Windows-style paths
        assert!(is_inside_workspace(
            r"C:\workspace\docs\file.md",
            r"C:\workspace"
        ));
        assert!(is_inside_workspace(
            r"C:\workspace\sub\deep\file.md",
            r"C:\workspace"
        ));
    }

    #[test]
    fn test_path_is_workspace_root_windows() {
        assert!(is_inside_workspace(r"C:\workspace", r"C:\workspace"));
    }

    #[test]
    fn test_path_outside_workspace_windows() {
        assert!(!is_inside_workspace(r"C:\other\file.md", r"C:\workspace"));
        assert!(!is_inside_workspace(
            r"D:\workspace\file.md",
            r"C:\workspace"
        ));
    }

    #[test]
    fn test_path_traversal_blocked_windows() {
        assert!(!is_inside_workspace(
            r"C:\workspace\..\outside\file.md",
            r"C:\workspace"
        ));
    }

    #[test]
    fn test_case_insensitivity_windows() {
        assert!(is_inside_workspace(
            r"C:\WORKSPACE\docs\file.md",
            r"C:\workspace"
        ));
        assert!(is_inside_workspace(
            r"c:\workspace\docs\file.md",
            r"C:\Workspace"
        ));
    }

    // =========================================================================
    // is_inside_workspace Tests - Unix
    // =========================================================================

    #[test]
    fn test_path_inside_workspace_unix() {
        // Unix-style paths
        assert!(is_inside_workspace("/workspace/docs/file.md", "/workspace"));
        assert!(is_inside_workspace(
            "/workspace/sub/deep/file.md",
            "/workspace"
        ));
    }

    #[test]
    fn test_path_is_workspace_root() {
        assert!(is_inside_workspace(r"C:\workspace", r"C:\workspace"));
        assert!(is_inside_workspace("/workspace", "/workspace"));
    }

    #[test]
    fn test_path_outside_workspace_unix() {
        assert!(!is_inside_workspace("/other/file.md", "/workspace"));
    }

    #[test]
    fn test_path_traversal_blocked_unix() {
        assert!(!is_inside_workspace(
            "/workspace/../outside/file.md",
            "/workspace"
        ));
    }

    // =========================================================================
    // is_inside_workspace Tests - Edge Cases
    // =========================================================================

    #[test]
    fn test_empty_paths() {
        assert!(!is_inside_workspace("", "/workspace"));
        assert!(!is_inside_workspace("/workspace/file.md", ""));
        assert!(!is_inside_workspace("", ""));
    }

    #[test]
    fn test_path_traversal_with_multiple_parent_refs() {
        // Test that multiple ".." components are handled without panicking
        assert!(!is_inside_workspace(
            r"C:\workspace\..\..\..\etc\passwd",
            r"C:\workspace"
        ));
        assert!(!is_inside_workspace(
            "/workspace/../../../etc/passwd",
            "/workspace"
        ));
    }

    #[test]
    fn test_path_with_only_parent_refs() {
        // Edge case: path consists only of ".."
        assert!(!is_inside_workspace("..", "/workspace"));
        assert!(!is_inside_workspace("../..", "/workspace"));
        assert!(!is_inside_workspace(r"..\..\..", r"C:\workspace"));
    }

    #[test]
    fn test_path_with_current_dir_markers() {
        // Test handling of "." in paths
        assert!(is_inside_workspace(
            r"C:\workspace\.\docs\.\file.md",
            r"C:\workspace"
        ));
        assert!(is_inside_workspace(
            "/workspace/./docs/./file.md",
            "/workspace"
        ));
    }

    #[test]
    fn test_deeply_nested_path_traversal() {
        // Ensure no stack overflow or panic with deeply nested paths
        let deep_path = format!(
            "/workspace/{}file.txt",
            "../".repeat(100)
        );
        // Should not panic
        assert!(!is_inside_workspace(&deep_path, "/workspace"));
    }

    #[test]
    fn test_similar_path_prefix_not_inside() {
        // "/workspace-extra" should not be inside "/workspace"
        assert!(!is_inside_workspace("/workspace-extra/file.md", "/workspace"));
        assert!(!is_inside_workspace(r"C:\workspace-extra\file.md", r"C:\workspace"));
    }

    #[test]
    fn test_workspace_as_substring() {
        // Make sure we check for path separator, not just prefix
        assert!(!is_inside_workspace("/workspacefiles/file.md", "/workspace"));
        assert!(!is_inside_workspace("/my-workspace/file.md", "/workspace"));
    }

    #[test]
    fn test_trailing_separator_handling() {
        assert!(is_inside_workspace("/workspace/file.md", "/workspace/"));
        assert!(is_inside_workspace(r"C:\workspace\file.md", r"C:\workspace\"));
    }

    // =========================================================================
    // get_validated_path Tests
    // =========================================================================

    #[test]
    fn test_get_validated_path_windows() {
        let result = get_validated_path(r"C:\workspace\file.md", r"C:\workspace");
        assert_eq!(result, Some(r"C:\workspace\file.md".to_string()));

        let result = get_validated_path(r"C:\other\file.md", r"C:\workspace");
        assert_eq!(result, None);
    }

    #[test]
    fn test_get_validated_path_unix() {
        let result = get_validated_path("/workspace/file.md", "/workspace");
        assert_eq!(result, Some("/workspace/file.md".to_string()));

        let result = get_validated_path("/other/file.md", "/workspace");
        assert_eq!(result, None);
    }

    #[test]
    fn test_get_validated_path_traversal() {
        let result = get_validated_path("/workspace/../etc/passwd", "/workspace");
        assert_eq!(result, None);
    }

    #[test]
    fn test_get_validated_path_empty() {
        let result = get_validated_path("", "/workspace");
        assert_eq!(result, None);
        
        let result = get_validated_path("/file.md", "");
        assert_eq!(result, None);
    }

    #[test]
    fn test_get_validated_path_root() {
        let result = get_validated_path("/workspace", "/workspace");
        assert_eq!(result, Some("/workspace".to_string()));
    }

    // =========================================================================
    // Additional Security Tests
    // =========================================================================

    #[test]
    fn test_null_byte_in_path() {
        // Null bytes should be treated as regular characters (no special handling)
        let result = is_inside_workspace("/workspace/file\x00.txt", "/workspace");
        // The path technically starts inside workspace
        assert!(result);
    }

    #[test]
    fn test_unicode_paths() {
        assert!(is_inside_workspace("/workspace/文档/file.md", "/workspace"));
        assert!(is_inside_workspace("/workspace/日本語/ファイル.yaml", "/workspace"));
    }

    #[test]
    fn test_space_in_path() {
        assert!(is_inside_workspace("/my workspace/docs/file.md", "/my workspace"));
        assert!(is_inside_workspace(r"C:\My Workspace\docs\file.md", r"C:\My Workspace"));
    }

    #[test]
    fn test_mixed_separators_windows_context() {
        // Mixed separators should be normalized
        assert!(is_inside_workspace(r"C:\workspace/docs\file.md", r"C:\workspace"));
    }
}
