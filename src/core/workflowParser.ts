// src/core/workflowParser.ts
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { WorkflowData, WorkflowItem } from './types';
import { isInsideWorkspace } from './pathValidation';

// Workspace root for path validation (set via setWorkspaceRoot)
let workspaceRoot: string | null = null;
let lastWorkflowParseError: string | null = null;

export function setWorkspaceRoot(root: string | null): void {
    workspaceRoot = root;
}

export function getWorkflowParseError(): string | null {
    return lastWorkflowParseError;
}

function setWorkflowParseError(message: string | null): void {
    lastWorkflowParseError = message;
}

// Mapping of workflow IDs to phases based on BMad methodology
const WORKFLOW_PHASE_MAP: Record<string, number> = {
    // Phase 0 - Discovery
    'brainstorm': 0,
    'brainstorm-project': 0,
    'research': 0,
    'product-brief': 0,
    // Phase 1 - Planning
    'prd': 1,
    'validate-prd': 1,
    'ux-design': 1,
    'create-ux-design': 1,
    // Phase 2 - Solutioning
    'architecture': 2,
    'create-architecture': 2,
    'epics-stories': 2,
    'create-epics-and-stories': 2,
    'test-design': 2,
    'implementation-readiness': 2,
    // Phase 3 - Implementation
    'sprint-planning': 3
};

// Mapping of workflow IDs to agents
const WORKFLOW_AGENT_MAP: Record<string, string> = {
    'brainstorm': 'analyst',
    'brainstorm-project': 'analyst',
    'research': 'analyst',
    'product-brief': 'analyst',
    'prd': 'pm',
    'validate-prd': 'pm',
    'ux-design': 'ux-designer',
    'create-ux-design': 'ux-designer',
    'architecture': 'architect',
    'create-architecture': 'architect',
    'epics-stories': 'pm',
    'create-epics-and-stories': 'pm',
    'test-design': 'tea',
    'implementation-readiness': 'architect',
    'sprint-planning': 'sm'
};

function inferPhase(workflowId: string): number {
    return WORKFLOW_PHASE_MAP[workflowId] ?? 1; // Default to Planning
}

function inferAgent(workflowId: string): string {
    return WORKFLOW_AGENT_MAP[workflowId] ?? 'pm';
}

function inferCommand(workflowId: string): string {
    // Convert workflow ID to command format
    return workflowId.replace(/-/g, '-');
}

function parseNewFormat(parsed: any): WorkflowItem[] {
    const workflows = parsed.workflows as Record<string, unknown>;
    const items: WorkflowItem[] = [];

    for (const [id, data] of Object.entries(workflows)) {
        const workflowData = data as any;

        // Map status: 'complete' -> output_file path, 'not_started' -> 'required'
        let status = workflowData.status || 'not_started';
        if (status === 'complete' && workflowData.output_file) {
            status = workflowData.output_file;
        } else if (status === 'not_started') {
            status = 'required';
        }

        items.push({
            id,
            phase: inferPhase(id),
            status,
            agent: inferAgent(id),
            command: inferCommand(id),
            note: workflowData.notes || workflowData.note,
            outputFile: workflowData.output_file
        });
    }

    // Sort by phase, then by ID
    return items.sort((a, b) => {
        const phaseA = a.phase as number;
        const phaseB = b.phase as number;
        if (phaseA !== phaseB) return phaseA - phaseB;
        return a.id.localeCompare(b.id);
    });
}

function parseOldFormat(parsed: any): WorkflowItem[] {
    return (parsed.workflow_status || []).map((item: any) => ({
        id: item.id,
        phase: item.phase,
        status: item.status,
        agent: item.agent,
        command: item.command,
        note: item.note
    }));
}

function parseFlatFormat(parsed: any): WorkflowItem[] {
    const workflowStatus = parsed.workflow_status as Record<string, unknown>;
    const items: WorkflowItem[] = [];

    for (const [id, status] of Object.entries(workflowStatus)) {
        items.push({
            id,
            phase: inferPhase(id),
            status: status as string,
            agent: inferAgent(id),
            command: inferCommand(id),
            note: undefined,
            outputFile: isFilePath(status as string) ? status as string : undefined
        });
    }

    // Sort by phase, then by ID
    return items.sort((a, b) => {
        const phaseA = a.phase as number;
        const phaseB = b.phase as number;
        if (phaseA !== phaseB) return phaseA - phaseB;
        return a.id.localeCompare(b.id);
    });
}

function isFilePath(value: string): boolean {
    // Check if the value looks like a file path (contains / or ends with common extensions)
    return value.includes('/') || /\.(md|yaml|yml|json|txt)$/.test(value);
}

export function parseWorkflowStatus(filePath: string): WorkflowData | null {
    // Security: Validate path is inside workspace
    if (workspaceRoot && !isInsideWorkspace(filePath, workspaceRoot)) {
        console.error('Path validation failed: file outside workspace');
        setWorkflowParseError('Path validation failed: file outside workspace');
        return null;
    }

    if (!fs.existsSync(filePath)) {
        setWorkflowParseError(null);
        return null;
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = yaml.parse(content);

        // Detect format:
        // - New format: 'workflows' as object with nested status fields
        // - Flat format: 'workflow_status' as object with key-value pairs (id: status)
        // - Old format: 'workflow_status' as array of objects
        const isNewFormat = parsed.workflows && typeof parsed.workflows === 'object' && !Array.isArray(parsed.workflows);
        const isFlatFormat = parsed.workflow_status && typeof parsed.workflow_status === 'object' && !Array.isArray(parsed.workflow_status);

        let items: WorkflowItem[];
        if (isNewFormat) {
            items = parseNewFormat(parsed);
        } else if (isFlatFormat) {
            items = parseFlatFormat(parsed);
        } else {
            items = parseOldFormat(parsed);
        }

        setWorkflowParseError(null);
        return {
            lastUpdated: parsed.last_updated || '',
            status: parsed.status || '',
            statusNote: parsed.status_note,
            project: parsed.project || parsed.project_name || '',
            projectType: parsed.project_type || '',
            selectedTrack: parsed.selected_track || '',
            fieldType: parsed.field_type || '',
            workflowPath: parsed.workflow_path || '',
            items
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to parse workflow status: ${message}`);
        setWorkflowParseError(message);
        return null;
    }
}

export function getItemsForPhase(data: WorkflowData, phaseNumber: number | 'prerequisite'): WorkflowItem[] {
    return data.items.filter(item => item.phase === phaseNumber);
}

export function findWorkflowStatusFile(workspaceRoot: string): string | null {
    const candidates = [
        path.join(workspaceRoot, '_bmad-output', 'planning-artifacts', 'bmm-workflow-status.yaml'),
        path.join(workspaceRoot, '_bmad-output', 'bmm-workflow-status.yaml'),
        path.join(workspaceRoot, 'docs', 'bmm-workflow-status.yaml'),
        path.join(workspaceRoot, 'bmm-workflow-status.yaml')
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function updateWorkflowItemStatus(
    filePath: string,
    itemId: string,
    newStatus: string
): boolean {
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
        const parsed = yaml.parse(content);

        // Detect format and use appropriate update strategy
        const isNewFormat = parsed.workflows && typeof parsed.workflows === 'object' && !Array.isArray(parsed.workflows);
        const isFlatFormat = parsed.workflow_status && typeof parsed.workflow_status === 'object' && !Array.isArray(parsed.workflow_status);

        if (isNewFormat) {
            // New format: workflows object with nested status
            // Pattern: "  itemId:\n    status: value"
            const regex = new RegExp(
                `(^[ \\t]*${escapeRegex(itemId)}:\\s*\\n[ \\t]*status:\\s*)\\S+`,
                'm'
            );

            if (!regex.test(content)) {
                return false;
            }

            const updatedContent = content.replace(regex, `$1${newStatus}`);
            fs.writeFileSync(filePath, updatedContent, 'utf-8');
            return true;
        } else if (isFlatFormat) {
            // Flat format: workflow_status object with key-value pairs
            // Pattern: "  itemId: value" (value can be quoted or unquoted)
            const regex = new RegExp(
                `(^[ \\t]*${escapeRegex(itemId)}:\\s*)["']?[^\\n"']+["']?`,
                'm'
            );

            if (!regex.test(content)) {
                return false;
            }

            // Quote the new status if it contains special characters
            const quotedStatus = newStatus.includes('/') || newStatus.includes(':') ? `"${newStatus}"` : newStatus;
            const updatedContent = content.replace(regex, `$1${quotedStatus}`);
            fs.writeFileSync(filePath, updatedContent, 'utf-8');
            return true;
        } else {
            // Old format: array with id and status fields
            // Pattern: "- id: itemId" followed by "status: value"
            const regex = new RegExp(
                `(- id: ["']?${escapeRegex(itemId)}["']?[\\s\\S]*?status:\\s*)["']?[^\\s"']+["']?`,
                'm'
            );

            if (!regex.test(content)) {
                return false;
            }

            const updatedContent = content.replace(regex, `$1"${newStatus}"`);
            fs.writeFileSync(filePath, updatedContent, 'utf-8');
            return true;
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to update workflow status: ${message}`);
        return false;
    }
}
