"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { authFetch } from "@/lib/authFetch";

type Props = {
    isOpen: boolean;
    onClose: () => void;
};

export default function NotesModal({ isOpen, onClose }: Props) {
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(false);
    const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
    const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        authFetch("/api/notes")
            .then((r) => r.json())
            .then((d) => { setContent(d.content || ""); setLoading(false); setSaveStatus("saved"); })
            .catch(() => setLoading(false));
    }, [isOpen]);

    const saveNotes = useCallback(async (text: string) => {
        setSaveStatus("saving");
        try {
            await authFetch("/api/notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: text }),
            });
            setSaveStatus("saved");
        } catch {
            setSaveStatus("unsaved");
        }
    }, []);

    const handleChange = (text: string) => {
        setContent(text);
        setSaveStatus("unsaved");
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => saveNotes(text), 800);
    };

    // Save on close
    const handleClose = () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        if (saveStatus === "unsaved") saveNotes(content);
        onClose();
    };

    const charCount = content.length;
    const lineCount = content ? content.split("\n").length : 0;
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

    if (!isOpen) return null;

    return (
        <div
            onClick={handleClose}
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
                    width: "90%", maxWidth: "600px", maxHeight: "80vh",
                    background: "#111", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "16px", display: "flex", flexDirection: "column",
                    boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
                    overflow: "hidden",
                }}
            >
                {/* Header */}
                <div style={{
                    display: "flex", alignItems: "center", padding: "18px 22px 14px",
                    borderBottom: "1px solid rgba(255,255,255,0.08)", gap: "12px",
                }}>
                    <span style={{ fontSize: "18px" }}>📝</span>
                    <h2 style={{ fontSize: "16px", fontWeight: 600, color: "rgba(255,255,255,0.92)", margin: 0, flex: 1 }}>Quick Notes</h2>
                    <span style={{
                        fontSize: "11px", fontWeight: 500,
                        color: saveStatus === "saved" ? "rgba(48,209,88,0.7)"
                            : saveStatus === "saving" ? "rgba(90,200,250,0.6)"
                                : "rgba(255,214,10,0.6)",
                    }}>
                        {saveStatus === "saved" ? "✓ Saved" : saveStatus === "saving" ? "Saving..." : "Unsaved"}
                    </span>
                    <button
                        onClick={handleClose}
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

                {/* Editor */}
                <div style={{ flex: 1, padding: "0" }}>
                    {loading ? (
                        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>
                            Loading notes...
                        </div>
                    ) : (
                        <textarea
                            value={content}
                            onChange={(e) => handleChange(e.target.value)}
                            placeholder="Jot down your thoughts, ideas, or anything you want to remember..."
                            style={{
                                width: "100%", height: "350px", padding: "18px 22px",
                                background: "transparent", border: "none",
                                color: "rgba(255,255,255,0.85)", fontSize: "13.5px",
                                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                                lineHeight: "1.7", resize: "none", outline: "none",
                            }}
                        />
                    )}
                </div>

                {/* Footer stats */}
                <div style={{
                    display: "flex", gap: "16px", padding: "10px 22px",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    fontSize: "11px", color: "rgba(255,255,255,0.2)",
                }}>
                    <span>{wordCount} words</span>
                    <span>{lineCount} lines</span>
                    <span>{charCount} chars</span>
                    <span style={{ marginLeft: "auto", fontSize: "10px" }}>Auto-saves to NOTES.md</span>
                </div>
            </div>
        </div>
    );
}
