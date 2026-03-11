import React, { useState, useEffect, useCallback } from 'react';
import { listProjects, loadProject, saveProject, deleteProject, createProject, type ProjectMeta, type Project } from '../services/projectService';
import type { Character, Page } from '../types';

interface ProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    characters: Character[];
    pages: Page[];
    worldview: string;
    colorMode: 'color' | 'monochrome';
    onLoadProject: (project: Project) => void;
}

export function ProjectModal({
    isOpen,
    onClose,
    characters,
    pages,
    worldview,
    colorMode,
    onLoadProject,
}: ProjectModalProps): React.ReactElement | null {
    const [projects, setProjects] = useState<ProjectMeta[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [newProjectName, setNewProjectName] = useState('');
    const [showSaveForm, setShowSaveForm] = useState(false);

    const fetchProjects = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const projectList = await listProjects();
            setProjects(projectList);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load projects');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchProjects();
        }
    }, [isOpen, fetchProjects]);

    const handleSave = async () => {
        if (!newProjectName.trim()) {
            setError('Please enter a project name');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const project = createProject(newProjectName.trim(), characters, pages, worldview, colorMode);
            await saveProject(project);
            setNewProjectName('');
            setShowSaveForm(false);
            fetchProjects();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save project');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLoad = async (id: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const project = await loadProject(id);
            onLoadProject(project);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load project');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this project?')) {
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            await deleteProject(id);
            fetchProjects();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to delete project');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">项目管理</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
                        {error}
                    </div>
                )}

                {/* Save current project section */}
                <div className="mb-6">
                    <button
                        onClick={() => setShowSaveForm(!showSaveForm)}
                        className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                        {showSaveForm ? '取消保存' : '保存当前项目'}
                    </button>

                    {showSaveForm && (
                        <div className="mt-3 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
                            <input
                                type="text"
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                placeholder="输入项目名称..."
                                className="w-full p-2 border rounded-lg dark:bg-gray-600 dark:border-gray-500 dark:text-white mb-3"
                            />
                            <button
                                onClick={handleSave}
                                disabled={isLoading}
                                className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                                {isLoading ? '保存中...' : '保存'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Project list */}
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">已保存的项目</h3>

                    {isLoading && projects.length === 0 ? (
                        <div className="text-center py-4 text-gray-500">加载中...</div>
                    ) : projects.length === 0 ? (
                        <div className="text-center py-4 text-gray-500">暂无保存的项目</div>
                    ) : (
                        <div className="space-y-2">
                            {projects.map((project) => (
                                <div
                                    key={project.id}
                                    className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700 rounded-lg"
                                >
                                    <div className="flex-1">
                                        <div className="font-medium text-gray-900 dark:text-white">{project.name}</div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(project.updatedAt).toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleLoad(project.id)}
                                            disabled={isLoading}
                                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
                                        >
                                            加载
                                        </button>
                                        <button
                                            onClick={() => handleDelete(project.id)}
                                            disabled={isLoading}
                                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors disabled:opacity-50"
                                        >
                                            删除
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}