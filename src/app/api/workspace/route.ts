import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { validateAuth } from "@/lib/authMiddleware";
import { WORKSPACE_DIR } from "@/lib/paths";

const WORKSPACE = WORKSPACE_DIR;

type FileNode = {
    name: string;
    path: string;
    type: "file" | "directory";
    size?: number;
    children?: FileNode[];
};

function readTree(dir: string, depth = 0, maxDepth = 4): FileNode[] {
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const nodes: FileNode[] = [];

        for (const entry of entries) {
            // Skip node_modules, .git, etc.
            if (["node_modules", ".git", ".next", "__pycache__", ".cache"].includes(entry.name)) continue;

            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(WORKSPACE, fullPath).replace(/\\/g, "/");

            if (entry.isDirectory()) {
                nodes.push({
                    name: entry.name,
                    path: relativePath,
                    type: "directory",
                    children: depth < maxDepth ? readTree(fullPath, depth + 1, maxDepth) : [],
                });
            } else {
                const stats = fs.statSync(fullPath);
                nodes.push({
                    name: entry.name,
                    path: relativePath,
                    type: "file",
                    size: stats.size,
                });
            }
        }

        // Sort: directories first, then files, both alphabetical
        nodes.sort((a, b) => {
            if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        return nodes;
    } catch {
        return [];
    }
}

export async function GET(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    const tree = readTree(WORKSPACE);
    return NextResponse.json({ workspace: WORKSPACE.replace(/\\/g, "/"), tree });
}
