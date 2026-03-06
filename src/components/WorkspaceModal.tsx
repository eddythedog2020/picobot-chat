"use client";

import React, { useState, useEffect, useMemo } from "react";
import { authFetch } from "@/lib/authFetch";

type FileNode = {
    name: string;
    path: string;
    type: "file" | "directory";
    size?: number;
    children?: FileNode[];
};

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onOpenFile: (content: string, title: string, language: string) => void;
};

/* ── helpers ── */
function prettyProjectName(folderName: string): string {
    // "project-20260303-134500-neon-tetra-breeding" → "Neon Tetra Breeding"
    const cleaned = folderName
        .replace(/^project-\d{8}-?\d{0,6}-?/, "")
        .replace(/[-_]/g, " ")
        .trim();
    if (!cleaned) return folderName;
    return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractDate(folderName: string): string | null {
    const m = folderName.match(/(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}`);
    return d.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

function countFiles(node: FileNode): number {
    if (node.type === "file") return 1;
    return (node.children || []).reduce((sum, c) => sum + countFiles(c), 0);
}

function extToLang(ext: string): string {
    const map: Record<string, string> = {
        ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
        py: "python", json: "json", html: "html", css: "css", md: "markdown",
        sh: "bash", yml: "yaml", yaml: "yaml", sql: "sql", txt: "text",
    };
    return map[ext] || "text";
}

function fileIcon(name: string) {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (["md"].includes(ext)) return "📝";
    if (["ts", "tsx", "js", "jsx"].includes(ext)) return "⚡";
    if (["py"].includes(ext)) return "🐍";
    if (["html", "htm"].includes(ext)) return "🌐";
    if (["css"].includes(ext)) return "🎨";
    if (["json", "yml", "yaml"].includes(ext)) return "⚙️";
    if (["sh", "bat"].includes(ext)) return "🖥️";
    return "📄";
}

/* ── Tree Node ── */
function TreeItem({ node, depth, onFileClick }: { node: FileNode; depth: number; onFileClick: (path: string) => void }) {
    const [expanded, setExpanded] = useState(false);

    if (node.type === "file") {
        return (
            <button
                onClick={() => onFileClick(node.path)}
                style={{
                    display: "flex", alignItems: "center", gap: "6px", width: "100%",
                    padding: "5px 10px", paddingLeft: `${14 + depth * 18}px`,
                    border: "none", background: "transparent", color: "rgba(255,255,255,0.8)",
                    fontSize: "12.5px", fontFamily: "inherit", cursor: "pointer",
                    borderRadius: "6px", textAlign: "left", transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
                <span style={{ fontSize: "12px", flexShrink: 0 }}>{fileIcon(node.name)}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
                {node.size !== undefined && (
                    <span style={{ marginLeft: "auto", fontSize: "11px", color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>
                        {node.size < 1024 ? `${node.size}B` : `${(node.size / 1024).toFixed(1)}KB`}
                    </span>
                )}
            </button>
        );
    }

    return (
        <div>
            <button
                onClick={() => setExpanded((v) => !v)}
                style={{
                    display: "flex", alignItems: "center", gap: "6px", width: "100%",
                    padding: "5px 10px", paddingLeft: `${14 + depth * 18}px`,
                    border: "none", background: "transparent", color: "rgba(255,255,255,0.9)",
                    fontSize: "12.5px", fontFamily: "inherit", fontWeight: 500, cursor: "pointer",
                    borderRadius: "6px", textAlign: "left", transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
                <span style={{ fontSize: "10px", flexShrink: 0, transition: "transform 0.15s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                <span>📁</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
            </button>
            {expanded && node.children && (
                <div>
                    {node.children.map((child) => (
                        <TreeItem key={child.path} node={child} depth={depth + 1} onFileClick={onFileClick} />
                    ))}
                    {node.children.length === 0 && (
                        <div style={{ paddingLeft: `${14 + (depth + 1) * 18}px`, fontSize: "11px", color: "rgba(255,255,255,0.25)", padding: "4px 10px" }}>
                            Empty folder
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ── Main Component ── */
export default function WorkspaceModal({ isOpen, onClose, onOpenFile }: Props) {
    const [tree, setTree] = useState<FileNode[]>([]);
    const [workspaceRoot, setWorkspaceRoot] = useState("");
    const [search, setSearch] = useState("");
    const [expandedProject, setExpandedProject] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [copiedPath, setCopiedPath] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        authFetch("/api/workspace")
            .then((r) => r.json())
            .then((d) => { setTree(d.tree || []); setWorkspaceRoot(d.workspace || ""); setLoading(false); })
            .catch(() => setLoading(false));

        // Auto-refresh every 5 seconds to pick up new projects
        const interval = setInterval(() => {
            authFetch("/api/workspace")
                .then((r) => r.json())
                .then((d) => setTree(d.tree || []))
                .catch(() => { });
        }, 5000);

        return () => clearInterval(interval);
    }, [isOpen]);

    const refreshTree = () => {
        authFetch("/api/workspace")
            .then((r) => r.json())
            .then((d) => setTree(d.tree || []))
            .catch(() => { });
    };

    const handleDelete = async (projPath: string) => {
        setDeleting(true);
        try {
            const res = await authFetch(`/api/workspace/delete?path=${encodeURIComponent(projPath)}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                setConfirmDelete(null);
                setExpandedProject(null);
                refreshTree();
            } else {
                alert(data.error || "Failed to delete");
            }
        } catch {
            alert("Failed to delete project");
        }
        setDeleting(false);
    };

    // Categorize items
    const { projects, coreFiles, skills } = useMemo(() => {
        const projects: FileNode[] = [];
        const coreFiles: FileNode[] = [];
        const skills: FileNode[] = [];

        for (const node of tree) {
            if (node.name === "skills" && node.type === "directory") {
                skills.push(...(node.children || []));
            } else if (node.name === "memory" && node.type === "directory") {
                // skip memory for now
            } else if (node.type === "directory" && node.name.startsWith("project-")) {
                projects.push(node);
            } else {
                coreFiles.push(node);
            }
        }

        // Sort projects newest first
        projects.sort((a, b) => b.name.localeCompare(a.name));
        return { projects, coreFiles, skills };
    }, [tree]);

    // Filter by search
    const filteredProjects = useMemo(() => {
        if (!search.trim()) return projects;
        const q = search.toLowerCase();
        return projects.filter((p) => prettyProjectName(p.name).toLowerCase().includes(q) || p.name.includes(q));
    }, [projects, search]);

    const handleFileClick = async (filePath: string) => {
        try {
            const res = await authFetch(`/api/workspace/file?path=${encodeURIComponent(filePath)}`);
            const data = await res.json();
            if (data.error) { alert(data.error); return; }
            onOpenFile(data.content, data.name, extToLang(data.extension));
            onClose();
        } catch {
            alert("Failed to load file");
        }
    };

    if (!isOpen) return null;

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed", inset: 0, zIndex: 100,
                background: "rgba(0,0,0,0.65)",
                backdropFilter: "blur(8px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                animation: "fadeIn 0.2s ease",
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "90%", maxWidth: "720px", maxHeight: "80vh",
                    background: "#111", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "16px", display: "flex", flexDirection: "column",
                    boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
                    overflow: "hidden",
                }}
            >
                {/* Header */}
                <div style={{
                    display: "flex", alignItems: "center", padding: "18px 22px 14px",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    gap: "12px",
                }}>
                    <span style={{ fontSize: "18px" }}>📂</span>
                    <h2 style={{ fontSize: "16px", fontWeight: 600, color: "rgba(255,255,255,0.92)", margin: 0, flex: 1 }}>Workspace</h2>
                    <button
                        onClick={onClose}
                        style={{
                            width: "28px", height: "28px", borderRadius: "6px",
                            border: "none", background: "rgba(255,255,255,0.06)",
                            color: "rgba(255,255,255,0.5)", fontSize: "14px",
                            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                    >
                        ✕
                    </button>
                </div>

                {/* Search */}
                <div style={{ padding: "12px 22px 8px" }}>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search projects..."
                        style={{
                            width: "100%", padding: "9px 14px", borderRadius: "10px",
                            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                            color: "rgba(255,255,255,0.9)", fontSize: "13px", fontFamily: "inherit",
                            outline: "none",
                        }}
                    />
                </div>

                {/* Scrollable body */}
                <div style={{ flex: 1, overflowY: "auto", padding: "8px 22px 22px" }}>
                    {loading ? (
                        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>
                            Loading workspace...
                        </div>
                    ) : (
                        <>
                            {/* ── Projects Grid ── */}
                            {filteredProjects.length > 0 && (
                                <div>
                                    <div style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "10px", marginTop: "8px" }}>
                                        Projects ({filteredProjects.length})
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px" }}>
                                        {filteredProjects.map((proj) => {
                                            const isExpanded = expandedProject === proj.path;
                                            return (
                                                <div key={proj.path}>
                                                    <div style={{ display: "flex", gap: "6px" }}>
                                                        <button
                                                            onClick={() => setExpandedProject(isExpanded ? null : proj.path)}
                                                            style={{
                                                                flex: 1, padding: "14px 16px", borderRadius: "12px",
                                                                background: isExpanded ? "rgba(10,132,255,0.1)" : "rgba(255,255,255,0.04)",
                                                                border: `1px solid ${isExpanded ? "rgba(10,132,255,0.3)" : "rgba(255,255,255,0.07)"}`,
                                                                cursor: "pointer", textAlign: "left",
                                                                transition: "all 0.15s",
                                                                display: "flex", flexDirection: "column", gap: "6px",
                                                            }}
                                                            onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
                                                            onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                                                        >
                                                            <div style={{ fontSize: "13.5px", fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>
                                                                {prettyProjectName(proj.name)}
                                                            </div>
                                                            <div style={{ display: "flex", gap: "10px", fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>
                                                                {extractDate(proj.name) && <span>{extractDate(proj.name)}</span>}
                                                                <span>{countFiles(proj)} files</span>
                                                            </div>
                                                        </button>
                                                        {confirmDelete === proj.path ? (
                                                            <div style={{ display: "flex", flexDirection: "column", gap: "4px", justifyContent: "center" }}>
                                                                <button
                                                                    onClick={() => handleDelete(proj.path)}
                                                                    disabled={deleting}
                                                                    style={{
                                                                        padding: "5px 10px", borderRadius: "6px",
                                                                        border: "1px solid rgba(239,68,68,0.4)",
                                                                        background: "rgba(239,68,68,0.15)",
                                                                        color: "#f87171", fontSize: "11px",
                                                                        fontFamily: "inherit", fontWeight: 500,
                                                                        cursor: deleting ? "wait" : "pointer",
                                                                    }}
                                                                >
                                                                    {deleting ? "..." : "Yes"}
                                                                </button>
                                                                <button
                                                                    onClick={() => setConfirmDelete(null)}
                                                                    style={{
                                                                        padding: "5px 10px", borderRadius: "6px",
                                                                        border: "none", background: "rgba(255,255,255,0.06)",
                                                                        color: "rgba(255,255,255,0.5)", fontSize: "11px",
                                                                        fontFamily: "inherit", cursor: "pointer",
                                                                    }}
                                                                >
                                                                    No
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => setConfirmDelete(proj.path)}
                                                                title="Delete project"
                                                                style={{
                                                                    padding: "8px", borderRadius: "8px",
                                                                    border: "none", background: "transparent",
                                                                    color: "rgba(255,255,255,0.2)", cursor: "pointer",
                                                                    transition: "all 0.12s", alignSelf: "center",
                                                                }}
                                                                onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
                                                                onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)"; e.currentTarget.style.background = "transparent"; }}
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 14, height: 14 }}>
                                                                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Expanded tree */}
                                                    {isExpanded && proj.children && (
                                                        <div style={{
                                                            marginTop: "6px", padding: "6px 0",
                                                            background: "rgba(255,255,255,0.02)",
                                                            borderRadius: "10px",
                                                            border: "1px solid rgba(255,255,255,0.06)",
                                                        }}>
                                                            {proj.children.map((child) => (
                                                                <TreeItem key={child.path} node={child} depth={0} onFileClick={handleFileClick} />
                                                            ))}
                                                            {proj.children.length === 0 && (
                                                                <div style={{ padding: "10px 16px", fontSize: "12px", color: "rgba(255,255,255,0.25)" }}>Empty project</div>
                                                            )}

                                                            {/* Folder path bar */}
                                                            <div style={{
                                                                display: "flex", alignItems: "center", gap: "8px",
                                                                margin: "6px 10px", padding: "7px 12px",
                                                                background: "rgba(255,255,255,0.03)",
                                                                borderRadius: "8px",
                                                                border: "1px solid rgba(255,255,255,0.06)",
                                                            }}>
                                                                <span style={{ fontSize: "12px", flexShrink: 0 }}>📁</span>
                                                                <span style={{
                                                                    fontSize: "11px", color: "rgba(255,255,255,0.4)",
                                                                    fontFamily: "monospace", overflow: "hidden",
                                                                    textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                                                                    direction: "rtl", textAlign: "left",
                                                                }}>
                                                                    {workspaceRoot ? `${workspaceRoot}/${proj.name}` : proj.path}
                                                                </span>
                                                                <button
                                                                    onClick={() => {
                                                                        const fullPath = workspaceRoot ? `${workspaceRoot}/${proj.name}` : proj.path;
                                                                        navigator.clipboard.writeText(fullPath.replace(/\//g, "\\"));
                                                                        setCopiedPath(true);
                                                                        setTimeout(() => setCopiedPath(false), 2000);
                                                                    }}
                                                                    title="Copy folder path"
                                                                    style={{
                                                                        padding: "3px 8px", borderRadius: "5px",
                                                                        border: "1px solid rgba(255,255,255,0.1)",
                                                                        background: copiedPath ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)",
                                                                        color: copiedPath ? "#4ade80" : "rgba(255,255,255,0.5)",
                                                                        fontSize: "10px", fontFamily: "inherit",
                                                                        cursor: "pointer", flexShrink: 0,
                                                                        transition: "all 0.15s",
                                                                    }}
                                                                >
                                                                    {copiedPath ? "✓ Copied" : "Copy path"}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ── Core Files ── */}
                            {coreFiles.length > 0 && (
                                <div style={{ marginTop: "20px" }}>
                                    <div style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "8px" }}>
                                        Core Files
                                    </div>
                                    <div style={{
                                        background: "rgba(255,255,255,0.02)", borderRadius: "10px",
                                        border: "1px solid rgba(255,255,255,0.06)", padding: "4px 0",
                                    }}>
                                        {coreFiles.map((f) => (
                                            <TreeItem key={f.path} node={f} depth={0} onFileClick={handleFileClick} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── Skills ── */}
                            {skills.length > 0 && (
                                <div style={{ marginTop: "20px" }}>
                                    <div style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "8px" }}>
                                        Skills ({skills.length})
                                    </div>
                                    <div style={{
                                        background: "rgba(255,255,255,0.02)", borderRadius: "10px",
                                        border: "1px solid rgba(255,255,255,0.06)", padding: "4px 0",
                                    }}>
                                        {skills.map((sk) => (
                                            <TreeItem key={sk.path} node={sk} depth={0} onFileClick={handleFileClick} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
