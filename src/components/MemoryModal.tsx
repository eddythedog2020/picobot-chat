"use client";

import React, { useState, useEffect } from "react";
import { authFetch } from "@/lib/authFetch";

type MemoryFile = {
    name: string;
    content: string;
    type: "soul" | "daily";
};

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onOpenFile: (content: string, title: string, language: string) => void;
};

function formatDateName(filename: string): string {
    const m = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return filename;
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}`);
    return d.toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function countEntries(content: string): number {
    return content.split("\n").filter((l) => l.trim().startsWith("[")).length;
}

export default function MemoryModal({ isOpen, onClose, onOpenFile }: Props) {
    const [files, setFiles] = useState<MemoryFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState<"soul" | "daily">("daily");
    const [expandedFile, setExpandedFile] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        authFetch("/api/memory")
            .then((r) => r.json())
            .then((d) => { setFiles(d.files || []); setLoading(false); })
            .catch(() => setLoading(false));
    }, [isOpen]);

    const soulFiles = files.filter((f) => f.type === "soul");
    const dailyFiles = files.filter((f) => f.type === "daily");
    const activeFiles = tab === "soul" ? soulFiles : dailyFiles;

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
                    width: "90%", maxWidth: "640px", maxHeight: "80vh",
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
                    <span style={{ fontSize: "18px" }}>🧠</span>
                    <h2 style={{ fontSize: "16px", fontWeight: 600, color: "rgba(255,255,255,0.92)", margin: 0, flex: 1 }}>Memory</h2>
                    <button
                        onClick={onClose}
                        style={{
                            width: "28px", height: "28px", borderRadius: "6px",
                            border: "none", background: "rgba(255,255,255,0.06)",
                            color: "rgba(255,255,255,0.5)", fontSize: "14px",
                            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                    >
                        ✕
                    </button>
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", gap: "4px", padding: "12px 22px 8px" }}>
                    {(["daily", "soul"] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            style={{
                                padding: "7px 16px", borderRadius: "8px",
                                border: "none", fontSize: "12.5px", fontWeight: 500,
                                fontFamily: "inherit", cursor: "pointer",
                                background: tab === t ? "rgba(10,132,255,0.15)" : "rgba(255,255,255,0.04)",
                                color: tab === t ? "#5ac8fa" : "rgba(255,255,255,0.5)",
                                transition: "all 0.12s",
                            }}
                        >
                            {t === "daily" ? `📅 Daily Logs (${dailyFiles.length})` : `✨ Long-term (${soulFiles.length})`}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: "auto", padding: "8px 22px 22px" }}>
                    {loading ? (
                        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>
                            Loading memory...
                        </div>
                    ) : activeFiles.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.25)", fontSize: "13px" }}>
                            {tab === "daily" ? "No daily logs found" : "No long-term memory files found"}
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {activeFiles.map((file) => {
                                const isExpanded = expandedFile === file.name;
                                return (
                                    <div key={file.name}>
                                        <button
                                            onClick={() => setExpandedFile(isExpanded ? null : file.name)}
                                            style={{
                                                width: "100%", padding: "12px 16px", borderRadius: "10px",
                                                background: isExpanded ? "rgba(10,132,255,0.08)" : "rgba(255,255,255,0.03)",
                                                border: `1px solid ${isExpanded ? "rgba(10,132,255,0.25)" : "rgba(255,255,255,0.06)"}`,
                                                cursor: "pointer", textAlign: "left",
                                                display: "flex", alignItems: "center", gap: "10px",
                                                transition: "all 0.12s",
                                            }}
                                            onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                                            onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = isExpanded ? "rgba(10,132,255,0.08)" : "rgba(255,255,255,0.03)"; }}
                                        >
                                            <span style={{ fontSize: "10px", transition: "transform 0.15s", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                                            <span style={{ fontSize: "13px", fontWeight: 500, color: "rgba(255,255,255,0.85)", flex: 1 }}>
                                                {file.type === "daily" ? formatDateName(file.name) : file.name.replace(".md", "")}
                                            </span>
                                            {file.type === "daily" && (
                                                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>
                                                    {countEntries(file.content)} entries
                                                </span>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onOpenFile(file.content, file.name, "markdown");
                                                    onClose();
                                                }}
                                                title="Open in Canvas"
                                                style={{
                                                    padding: "4px 8px", borderRadius: "6px",
                                                    border: "none", background: "rgba(255,255,255,0.06)",
                                                    color: "rgba(255,255,255,0.4)", fontSize: "11px",
                                                    fontFamily: "inherit", cursor: "pointer",
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
                                            >
                                                Open ↗
                                            </button>
                                        </button>

                                        {/* Expanded content preview */}
                                        {isExpanded && (
                                            <div style={{
                                                marginTop: "4px", padding: "12px 16px",
                                                background: "rgba(0,0,0,0.3)", borderRadius: "8px",
                                                border: "1px solid rgba(255,255,255,0.05)",
                                                maxHeight: "200px", overflowY: "auto",
                                            }}>
                                                {file.type === "daily" ? (
                                                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                                        {file.content.split("\n").filter((l) => l.trim()).map((line, i) => {
                                                            const timeMatch = line.match(/\[(\d{4}-\d{2}-\d{2}T[\d:]+Z?)\]/);
                                                            const time = timeMatch ? new Date(timeMatch[1]).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" }) : null;
                                                            const text = line.replace(/\[\d{4}-\d{2}-\d{2}T[\d:]+Z?\]\s*/g, "").replace(/\[\d{4}-\d{2}-\d{2}\]\s*/g, "").trim();
                                                            return (
                                                                <div key={i} style={{ display: "flex", gap: "8px", fontSize: "12px" }}>
                                                                    {time && <span style={{ color: "rgba(90,200,250,0.6)", flexShrink: 0, fontFamily: "monospace", fontSize: "11px" }}>{time}</span>}
                                                                    <span style={{ color: "rgba(255,255,255,0.6)" }}>{text}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <pre style={{
                                                        margin: 0, fontSize: "12px", color: "rgba(255,255,255,0.6)",
                                                        whiteSpace: "pre-wrap", wordWrap: "break-word",
                                                        fontFamily: "inherit",
                                                    }}>
                                                        {file.content}
                                                    </pre>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
