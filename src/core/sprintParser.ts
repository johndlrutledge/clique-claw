import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { Story, Epic, SprintData, StoryStatus } from './types';
import { isInsideWorkspace } from './pathValidation';

// Workspace root for path validation (set via setWorkspaceRoot)
let workspaceRoot: string | null = null;
let lastSprintParseError: string | null = null;

export function setSprintWorkspaceRoot(root: string | null): void {
    workspaceRoot = root;
}

export function getSprintParseError(): string | null {
    return lastSprintParseError;
}

function setSprintParseError(message: string | null): void {
    lastSprintParseError = message;
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseSprintStatus(filePath: string): SprintData | null {
    // Security: Validate path is inside workspace
    if (workspaceRoot && !isInsideWorkspace(filePath, workspaceRoot)) {
        console.error('Path validation failed: file outside workspace');
        setSprintParseError('Path validation failed: file outside workspace');
        return null;
    }

    if (!fs.existsSync(filePath)) {
        setSprintParseError(null);
        return null;
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = yaml.parse(content);

        const project = parsed.project || 'Unknown';
        const projectKey = parsed.project_key || '';
        const devStatus = parsed.development_status || {};

        const epicsMap = new Map<string, Epic>();

        // First pass: identify epics
        for (const [key, value] of Object.entries(devStatus)) {
            const match = key.match(/^epic-(\d+)$/);
            if (match) {
                const epicNum = match[1];
                epicsMap.set(epicNum, {
                    id: key,
                    name: `Epic ${epicNum}`,
                    status: value as StoryStatus,
                    stories: []
                });
            }
        }

        // Second pass: assign stories to epics
        for (const [key, value] of Object.entries(devStatus)) {
            // Skip epic entries and retrospectives
            if (key.match(/^epic-\d+$/) || key.includes('retrospective')) {
                continue;
            }

            // Extract epic number from story id (e.g., "4-7-create-admin-staff-domain" -> "4")
            const storyMatch = key.match(/^(\d+)-/);
            if (storyMatch) {
                const epicNum = storyMatch[1];
                const epic = epicsMap.get(epicNum);
                if (epic) {
                    epic.stories.push({
                        id: key,
                        status: value as StoryStatus,
                        epicId: `epic-${epicNum}`
                    });
                }
            }
        }

        // Convert map to sorted array
        const epics = Array.from(epicsMap.values())
            .sort((a, b) => {
                const numA = parseInt(a.id.replace('epic-', ''));
                const numB = parseInt(b.id.replace('epic-', ''));
                return numA - numB;
            });

        setSprintParseError(null);
        return { project, projectKey, epics };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to parse sprint status: ${message}`);
        setSprintParseError(message);
        return null;
    }
}

export function updateStoryStatus(filePath: string, storyId: string, newStatus: StoryStatus): boolean {
    // Security: Validate path is inside workspace
    if (workspaceRoot && !isInsideWorkspace(filePath, workspaceRoot)) {
        console.error('Path validation failed: file outside workspace');
        return false;
    }

    if (!fs.existsSync(filePath)) {
        return false;
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Use regex to find and replace the status for this story
        // Match pattern: "storyId: oldStatus" and replace with "storyId: newStatus"
        const escapedStoryId = escapeRegex(storyId);
        const regex = new RegExp(`^(\\s*${escapedStoryId}:\\s*)\\S+`, 'm');

        if (!regex.test(content)) {
            return false;
        }

        const updatedContent = content.replace(regex, `$1${newStatus}`);
        fs.writeFileSync(filePath, updatedContent, 'utf-8');
        return true;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to update story status: ${message}`);
        return false;
    }
}

export function findAllSprintStatusFiles(workspaceRoot: string): string[] {
    const results: string[] = [];

    function searchDir(dir: string): void {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
                    searchDir(fullPath);
                } else if (entry.isFile() && entry.name === 'sprint-status.yaml') {
                    results.push(fullPath);
                }
            }
        } catch {
            // Ignore permission errors
        }
    }

    searchDir(workspaceRoot);
    return results;
}
