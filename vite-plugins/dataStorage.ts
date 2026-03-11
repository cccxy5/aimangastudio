import type { Plugin, ViteDevServer, Connect } from 'vite';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(__dirname, '../data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

// Ensure directories exist
function ensureDirectories() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (!fs.existsSync(PROJECTS_DIR)) {
            fs.mkdirSync(PROJECTS_DIR, { recursive: true });
        }
    } catch (e) {
        console.error('Failed to create data directories:', e);
    }
}

// Data storage Vite plugin
export function dataStoragePlugin(): Plugin {
    return {
        name: 'vite-plugin-data-storage',
        configureServer(server: ViteDevServer) {
            ensureDirectories();

            // Handle all /api/ requests for project management
            server.middlewares.use((req: Connect.IncomingMessage, res: any, next: Connect.NextFunction) => {
                const url = req.url || '';

                // GET /api/projects - list all projects
                if (url === '/api/projects' && req.method === 'GET') {
                    try {
                        ensureDirectories();
                        const files = fs.readdirSync(PROJECTS_DIR);
                        const projects = files
                            .filter(f => f.endsWith('.json'))
                            .map(f => {
                                const filePath = path.join(PROJECTS_DIR, f);
                                const stat = fs.statSync(filePath);
                                return {
                                    id: f.replace('.json', ''),
                                    name: f.replace('.json', ''),
                                    updatedAt: stat.mtime.toISOString(),
                                };
                            });
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ projects }));
                        return;
                    } catch (error) {
                        console.error('Failed to list projects:', error);
                        res.statusCode = 500;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ error: 'Failed to list projects' }));
                        return;
                    }
                }

                // Handle /api/project/:id
                if (url.startsWith('/api/project/')) {
                    const projectId = decodeURIComponent(url.replace('/api/project/', '').split('?')[0]);

                    if (!projectId) {
                        res.statusCode = 400;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ error: 'Project ID required' }));
                        return;
                    }

                    // Sanitize project ID to prevent path traversal
                    const safeProjectId = projectId.replace(/[\/\\]/g, '_');
                    const projectPath = path.join(PROJECTS_DIR, `${safeProjectId}.json`);

                    ensureDirectories();

                    if (req.method === 'GET') {
                        try {
                            if (fs.existsSync(projectPath)) {
                                const data = fs.readFileSync(projectPath, 'utf-8');
                                res.setHeader('Content-Type', 'application/json');
                                res.end(data);
                            } else {
                                res.statusCode = 404;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: 'Project not found' }));
                            }
                        } catch (error) {
                            console.error('Failed to load project:', error);
                            res.statusCode = 500;
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ error: 'Failed to load project' }));
                        }
                        return;
                    }

                    if (req.method === 'POST' || req.method === 'PUT') {
                        let body = '';
                        req.on('data', chunk => {
                            body += chunk.toString();
                        });
                        req.on('end', () => {
                            try {
                                const data = JSON.parse(body);
                                data.updatedAt = new Date().toISOString();
                                fs.writeFileSync(projectPath, JSON.stringify(data, null, 2));
                                console.log(`Project saved: ${projectPath}`);
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ success: true, id: safeProjectId }));
                            } catch (error) {
                                console.error('Failed to save project:', error);
                                res.statusCode = 500;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: 'Failed to save project' }));
                            }
                        });
                        return;
                    }

                    if (req.method === 'DELETE') {
                        try {
                            if (fs.existsSync(projectPath)) {
                                fs.unlinkSync(projectPath);
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ success: true }));
                            } else {
                                res.statusCode = 404;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: 'Project not found' }));
                            }
                        } catch (error) {
                            console.error('Failed to delete project:', error);
                            res.statusCode = 500;
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ error: 'Failed to delete project' }));
                        }
                        return;
                    }
                }

                next();
            });
        }
    };
}