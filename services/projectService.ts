import type { Character, Page } from '../types';

export interface Project {
    id: string;
    name: string;
    characters: Character[];
    pages: Page[];
    worldview: string;
    colorMode: 'color' | 'monochrome';
    updatedAt: string;
}

export interface ProjectMeta {
    id: string;
    name: string;
    updatedAt: string;
}

// Get list of all projects
export async function listProjects(): Promise<ProjectMeta[]> {
    const response = await fetch('/api/projects');
    if (!response.ok) {
        throw new Error('Failed to list projects');
    }
    const data = await response.json();
    return data.projects || [];
}

// Load a project by ID
export async function loadProject(id: string): Promise<Project> {
    const response = await fetch(`/api/project/${encodeURIComponent(id)}`);
    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('Project not found');
        }
        throw new Error('Failed to load project');
    }
    return await response.json();
}

// Save a project
export async function saveProject(project: Project): Promise<{ success: boolean; id: string }> {
    const response = await fetch(`/api/project/${encodeURIComponent(project.id)}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(project),
    });
    if (!response.ok) {
        throw new Error('Failed to save project');
    }
    return await response.json();
}

// Delete a project
export async function deleteProject(id: string): Promise<{ success: boolean }> {
    const response = await fetch(`/api/project/${encodeURIComponent(id)}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error('Failed to delete project');
    }
    return await response.json();
}

// Create a new project with current data
export function createProject(
    name: string,
    characters: Character[],
    pages: Page[],
    worldview: string,
    colorMode: 'color' | 'monochrome'
): Project {
    return {
        id: name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_') + '_' + Date.now(),
        name,
        characters,
        pages,
        worldview,
        colorMode,
        updatedAt: new Date().toISOString(),
    };
}