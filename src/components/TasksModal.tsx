"use client";

import React, { useState, useEffect } from "react";
import { authFetch } from "@/lib/authFetch";

type Task = {
    id: string;
    text: string;
    done: boolean;
    created: string;
    category: string;
};

type Props = {
    isOpen: boolean;
    onClose: () => void;
};

const CATEGORIES = [
    { value: "general", label: "📋 General", color: "rgba(255,255,255,0.4)" },
    { value: "reminder", label: "⏰ Reminder", color: "#5ac8fa" },
    { value: "todo", label: "✅ To-Do", color: "#30d158" },
    { value: "idea", label: "💡 Idea", color: "#ffd60a" },
    { value: "bug", label: "🐛 Bug", color: "#ff6961" },
];

function getCatInfo(cat: string) {
    return CATEGORIES.find((c) => c.value === cat) || CATEGORIES[0];
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export default function TasksModal({ isOpen, onClose }: Props) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(false);
    const [newText, setNewText] = useState("");
    const [newCat, setNewCat] = useState("general");
    const [filter, setFilter] = useState<"all" | "active" | "done">("all");

    const fetchTasks = () => {
        setLoading(true);
        authFetch("/api/tasks")
            .then((r) => r.json())
            .then((d) => { setTasks(d.tasks || []); setLoading(false); })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        if (isOpen) fetchTasks();
    }, [isOpen]);

    const addTask = async () => {
        if (!newText.trim()) return;
        await authFetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: newText.trim(), category: newCat }),
        });
        setNewText("");
        fetchTasks();
    };

    const toggleTask = async (id: string, done: boolean) => {
        await authFetch("/api/tasks", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, done: !done }),
        });
        fetchTasks();
    };

    const deleteTask = async (id: string) => {
        await authFetch(`/api/tasks?id=${id}`, { method: "DELETE" });
        fetchTasks();
    };

    const filteredTasks = tasks.filter((t) => {
        if (filter === "active") return !t.done;
        if (filter === "done") return t.done;
        return true;
    });

    const activeCount = tasks.filter((t) => !t.done).length;
    const doneCount = tasks.filter((t) => t.done).length;

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
                    width: "90%", maxWidth: "560px", maxHeight: "80vh",
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
                    <span style={{ fontSize: "18px" }}>📋</span>
                    <h2 style={{ fontSize: "16px", fontWeight: 600, color: "rgba(255,255,255,0.92)", margin: 0, flex: 1 }}>Tasks</h2>
                    {activeCount > 0 && (
                        <span style={{
                            padding: "3px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: 600,
                            background: "rgba(10,132,255,0.15)", color: "#5ac8fa",
                        }}>
                            {activeCount} active
                        </span>
                    )}
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

                {/* Quick Add */}
                <div style={{ padding: "14px 22px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <input
                            value={newText}
                            onChange={(e) => setNewText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") addTask(); }}
                            placeholder="Add a new task..."
                            style={{
                                flex: 1, padding: "9px 14px", borderRadius: "10px",
                                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                                color: "rgba(255,255,255,0.9)", fontSize: "13px", fontFamily: "inherit",
                                outline: "none",
                            }}
                        />
                        <button
                            onClick={addTask}
                            disabled={!newText.trim()}
                            style={{
                                padding: "9px 16px", borderRadius: "10px",
                                background: newText.trim() ? "rgba(10,132,255,0.2)" : "rgba(255,255,255,0.04)",
                                border: newText.trim() ? "1px solid rgba(10,132,255,0.3)" : "1px solid rgba(255,255,255,0.06)",
                                color: newText.trim() ? "#5ac8fa" : "rgba(255,255,255,0.25)",
                                fontSize: "13px", fontWeight: 500, fontFamily: "inherit", cursor: newText.trim() ? "pointer" : "default",
                                transition: "all 0.12s",
                            }}
                        >
                            Add
                        </button>
                    </div>
                    {/* Category pills */}
                    <div style={{ display: "flex", gap: "6px", marginTop: "10px", flexWrap: "wrap" }}>
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.value}
                                onClick={() => setNewCat(cat.value)}
                                style={{
                                    padding: "4px 10px", borderRadius: "14px",
                                    border: "none", fontSize: "11px", fontFamily: "inherit",
                                    background: newCat === cat.value ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
                                    color: newCat === cat.value ? cat.color : "rgba(255,255,255,0.3)",
                                    cursor: "pointer", transition: "all 0.1s",
                                }}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Filter tabs */}
                <div style={{ display: "flex", gap: "4px", padding: "10px 22px 4px" }}>
                    {([
                        { key: "all" as const, label: `All (${tasks.length})` },
                        { key: "active" as const, label: `Active (${activeCount})` },
                        { key: "done" as const, label: `Done (${doneCount})` },
                    ]).map((f) => (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key)}
                            style={{
                                padding: "5px 12px", borderRadius: "6px",
                                border: "none", fontSize: "11.5px", fontWeight: 500,
                                fontFamily: "inherit", cursor: "pointer",
                                background: filter === f.key ? "rgba(255,255,255,0.08)" : "transparent",
                                color: filter === f.key ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
                                transition: "all 0.1s",
                            }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Task list */}
                <div style={{ flex: 1, overflowY: "auto", padding: "8px 22px 22px" }}>
                    {loading ? (
                        <div style={{ textAlign: "center", padding: "30px 0", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>
                            Loading tasks...
                        </div>
                    ) : filteredTasks.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "30px 0", color: "rgba(255,255,255,0.2)", fontSize: "13px" }}>
                            {filter === "all" ? "No tasks yet — add one above!" : `No ${filter} tasks`}
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            {filteredTasks.map((task) => {
                                const catInfo = getCatInfo(task.category);
                                return (
                                    <div
                                        key={task.id}
                                        style={{
                                            display: "flex", alignItems: "center", gap: "10px",
                                            padding: "10px 12px", borderRadius: "8px",
                                            background: "rgba(255,255,255,0.02)",
                                            border: "1px solid rgba(255,255,255,0.04)",
                                            transition: "background 0.1s",
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                                    >
                                        {/* Checkbox */}
                                        <button
                                            onClick={() => toggleTask(task.id, task.done)}
                                            style={{
                                                width: "18px", height: "18px", borderRadius: "4px", flexShrink: 0,
                                                border: task.done ? "none" : "2px solid rgba(255,255,255,0.2)",
                                                background: task.done ? "rgba(48,209,88,0.2)" : "transparent",
                                                color: task.done ? "#30d158" : "transparent",
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                cursor: "pointer", fontSize: "11px", transition: "all 0.12s",
                                            }}
                                        >
                                            {task.done ? "✓" : ""}
                                        </button>

                                        {/* Text + meta */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: "13px", color: task.done ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.85)",
                                                textDecoration: task.done ? "line-through" : "none",
                                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                            }}>
                                                {task.text}
                                            </div>
                                            <div style={{ display: "flex", gap: "8px", marginTop: "2px" }}>
                                                <span style={{ fontSize: "10px", color: catInfo.color, opacity: 0.7 }}>{catInfo.label}</span>
                                                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)" }}>{timeAgo(task.created)}</span>
                                            </div>
                                        </div>

                                        {/* Delete */}
                                        <button
                                            onClick={() => deleteTask(task.id)}
                                            title="Delete task"
                                            style={{
                                                padding: "4px", borderRadius: "4px",
                                                border: "none", background: "transparent",
                                                color: "rgba(255,255,255,0.15)", cursor: "pointer",
                                                transition: "color 0.1s", flexShrink: 0,
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
                                            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.15)")}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" style={{ width: 12, height: 12 }}>
                                                <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
                                            </svg>
                                        </button>
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
