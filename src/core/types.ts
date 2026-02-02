// src/core/types.ts

// Workflow item from bmm-workflow-status.yaml
export interface WorkflowItem {
    id: string;
    phase: number | 'prerequisite';
    status: string;  // 'required' | 'optional' | 'conditional' | 'skipped' | 'complete' | 'not_started' | file path
    agent?: string;
    command?: string;
    note?: string;
    outputFile?: string;  // For completed workflows in new format
}

export interface WorkflowData {
    lastUpdated: string;
    status: string;
    statusNote?: string;
    project: string;
    projectType: string;
    selectedTrack: string;
    fieldType: string;
    workflowPath: string;
    items: WorkflowItem[];
}

// Phase definitions
export type PhaseId = 'discovery' | 'planning' | 'solutioning' | 'implementation';

export interface PhaseConfig {
    id: PhaseId;
    phaseNumber: number | 'prerequisite';
    label: string;
    viewId: string;
}

export const PHASES: PhaseConfig[] = [
    { id: 'discovery', phaseNumber: 0, label: 'Discovery', viewId: 'cliqueDiscovery' },
    { id: 'planning', phaseNumber: 1, label: 'Planning', viewId: 'cliquePlanning' },
    { id: 'solutioning', phaseNumber: 2, label: 'Solutioning', viewId: 'cliqueSolutioning' },
    { id: 'implementation', phaseNumber: 3, label: 'Implementation', viewId: 'cliqueImplementation' }
];

// Re-export existing types for backward compatibility
export type StoryStatus = 'backlog' | 'drafted' | 'ready-for-dev' | 'in-progress' | 'review' | 'done' | 'optional' | 'completed';

export interface Story {
    id: string;
    status: StoryStatus;
    epicId: string;
}

export interface Epic {
    id: string;
    name: string;
    status: StoryStatus;
    stories: Story[];
}

export interface SprintData {
    project: string;
    projectKey: string;
    epics: Epic[];
}
