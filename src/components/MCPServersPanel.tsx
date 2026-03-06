"use client";

import React, { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/authFetch";

interface MCPServer {
    id: string;
    name: string;
    command: string;
    args: string[];
    enabled: boolean;
    connected: boolean;
    toolCount: number;
    tools: string[];
}

export default function MCPServersPanel() {
    const [servers, setServers] = useState<MCPServer[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newCommand, setNewCommand] = useState('npx');
    const [newArgs, setNewArgs] = useState('');
    const [newEnv, setNewEnv] = useState('');
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState('');
    const [expandedServer, setExpandedServer] = useState<string | null>(null);

    const loadServers = useCallback(async () => {
        try {
            const res = await authFetch('/api/mcp');
            if (res.ok) {
                const data = await res.json();
                setServers(data.servers || []);
            }
        } catch { /* ignore */ }
        setLoading(false);
    }, []);

    useEffect(() => { loadServers(); }, [loadServers]);

    const handleAdd = async () => {
        if (!newName.trim() || !newCommand.trim()) {
            setError('Name and command are required');
            return;
        }
        setAdding(true);
        setError('');
        try {
            let argsArray: string[] = [];
            if (newArgs.trim()) {
                try {
                    argsArray = JSON.parse(newArgs.trim());
                } catch {
                    // Treat as space-separated
                    argsArray = newArgs.trim().split(/\s+/);
                }
            }

            let envObj: Record<string, string> = {};
            if (newEnv.trim()) {
                try {
                    envObj = JSON.parse(newEnv.trim());
                } catch {
                    // Parse KEY=VALUE format
                    for (const line of newEnv.trim().split('\n')) {
                        const [k, ...v] = line.split('=');
                        if (k && v.length) envObj[k.trim()] = v.join('=').trim();
                    }
                }
            }

            const res = await authFetch('/api/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim(), command: newCommand.trim(), args: argsArray, env: envObj }),
            });
            const data = await res.json();
            if (res.ok) {
                setShowAddForm(false);
                setNewName(''); setNewArgs(''); setNewEnv('');
                loadServers();
            } else {
                setError(data.error || 'Failed to add server');
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Connection error');
        }
        setAdding(false);
    };

    const handleRemove = async (name: string) => {
        await authFetch('/api/mcp', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        loadServers();
    };

    const handleToggle = async (name: string, enabled: boolean) => {
        await authFetch('/api/mcp', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, action: 'toggle', enabled }),
        });
        loadServers();
    };

    const handleRestart = async (name: string) => {
        await authFetch('/api/mcp', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, action: 'restart' }),
        });
        loadServers();
    };

    const inputStyle: React.CSSProperties = {
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        padding: '8px 12px',
        color: 'var(--text-primary)',
        fontSize: '13px',
        width: '100%',
        outline: 'none',
    };

    return (
        <div style={{ marginTop: '24px' }}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" style={{ color: '#8B5CF6' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                    <line x1="6" y1="6" x2="6.01" y2="6" />
                    <line x1="6" y1="18" x2="6.01" y2="18" />
                </svg>
                <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    MCP Servers
                </h2>
                <span style={{
                    fontSize: '10px',
                    background: 'rgba(139,92,246,0.15)',
                    color: '#A78BFA',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontWeight: 600,
                }}>
                    {servers.reduce((acc, s) => acc + s.toolCount, 0)} tools
                </span>
            </div>

            {/* Info box */}
            <div style={{
                background: 'rgba(139,92,246,0.06)',
                borderRadius: '12px',
                padding: '12px 16px',
                border: '1px solid rgba(139,92,246,0.15)',
                marginBottom: '16px',
            }}>
                <p className="text-[11px]" style={{ color: 'rgba(139,92,246,0.9)', lineHeight: '1.5' }}>
                    🔌 MCP servers extend the AI with external tools (file access, APIs, databases). Tools are automatically available in chat when a server is connected.
                </p>
            </div>

            {/* Server list */}
            {loading ? (
                <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>Loading servers...</p>
            ) : servers.length === 0 && !showAddForm ? (
                <p className="text-[12px]" style={{ color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                    No MCP servers configured. Add one to get started.
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                    {servers.map((s) => (
                        <div
                            key={s.id}
                            style={{
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: '10px',
                                padding: '12px',
                                border: `1px solid ${s.connected ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}`,
                            }}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {/* Status dot */}
                                    <div style={{
                                        width: '8px', height: '8px', borderRadius: '50%',
                                        background: s.connected ? '#22C55E' : s.enabled ? '#EAB308' : '#6B7280',
                                        boxShadow: s.connected ? '0 0 6px rgba(34,197,94,0.5)' : 'none',
                                    }} />
                                    <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                                        {s.name}
                                    </span>
                                    {s.connected && (
                                        <span style={{
                                            fontSize: '10px',
                                            background: 'rgba(34,197,94,0.1)',
                                            color: '#22C55E',
                                            padding: '1px 6px',
                                            borderRadius: '8px',
                                        }}>
                                            {s.toolCount} tools
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleRestart(s.name)}
                                        title="Restart"
                                        style={{
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: 'var(--text-tertiary)', padding: '4px',
                                        }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => handleToggle(s.name, !s.enabled)}
                                        className="relative w-9 h-5 rounded-full transition-colors duration-200"
                                        style={{ background: s.enabled ? '#8B5CF6' : 'rgba(255,255,255,0.1)' }}
                                    >
                                        <span
                                            className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200"
                                            style={{ transform: s.enabled ? 'translateX(16px)' : 'translateX(0)' }}
                                        />
                                    </button>
                                    <button
                                        onClick={() => handleRemove(s.name)}
                                        title="Remove"
                                        style={{
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: '#EF4444', padding: '4px',
                                        }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Expandable details */}
                            <button
                                onClick={() => setExpandedServer(expandedServer === s.name ? null : s.name)}
                                className="text-[11px]"
                                style={{
                                    color: 'var(--text-tertiary)', background: 'none', border: 'none',
                                    cursor: 'pointer', padding: '4px 0 0',
                                }}
                            >
                                {s.command} {s.args.join(' ')} {expandedServer === s.name ? '▲' : '▼'}
                            </button>

                            {expandedServer === s.name && s.tools.length > 0 && (
                                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-tertiary)', marginBottom: '4px' }}>Available Tools:</p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {s.tools.map((tool) => (
                                            <span key={tool} style={{
                                                fontSize: '10px', background: 'rgba(139,92,246,0.1)',
                                                color: '#A78BFA', padding: '2px 8px', borderRadius: '6px',
                                            }}>
                                                {tool}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Add server form */}
            {showAddForm ? (
                <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '10px',
                    padding: '16px',
                    border: '1px solid rgba(139,92,246,0.2)',
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div>
                            <label className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>Server Name</label>
                            <input
                                style={inputStyle}
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="e.g. filesystem"
                            />
                        </div>
                        <div>
                            <label className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>Command</label>
                            <input
                                style={inputStyle}
                                value={newCommand}
                                onChange={(e) => setNewCommand(e.target.value)}
                                placeholder="e.g. npx, node, python"
                            />
                        </div>
                        <div>
                            <label className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>Arguments (space-separated or JSON array)</label>
                            <input
                                style={inputStyle}
                                value={newArgs}
                                onChange={(e) => setNewArgs(e.target.value)}
                                placeholder='e.g. -y @modelcontextprotocol/server-filesystem /path'
                            />
                        </div>
                        <div>
                            <label className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>Environment Variables (KEY=VALUE per line or JSON)</label>
                            <textarea
                                style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }}
                                value={newEnv}
                                onChange={(e) => setNewEnv(e.target.value)}
                                placeholder={'API_KEY=your-key-here'}
                            />
                        </div>

                        {error && (
                            <p className="text-[11px]" style={{ color: '#EF4444' }}>❌ {error}</p>
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={handleAdd}
                                disabled={adding}
                                style={{
                                    background: '#8B5CF6', color: 'white', border: 'none',
                                    borderRadius: '8px', padding: '8px 16px', fontSize: '12px',
                                    fontWeight: 600, cursor: 'pointer', opacity: adding ? 0.5 : 1,
                                }}
                            >
                                {adding ? 'Connecting...' : 'Connect Server'}
                            </button>
                            <button
                                onClick={() => { setShowAddForm(false); setError(''); }}
                                style={{
                                    background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
                                    border: 'none', borderRadius: '8px', padding: '8px 16px',
                                    fontSize: '12px', cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setShowAddForm(true)}
                    style={{
                        background: 'rgba(139,92,246,0.1)',
                        color: '#A78BFA',
                        border: '1px dashed rgba(139,92,246,0.3)',
                        borderRadius: '10px',
                        padding: '10px',
                        width: '100%',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                    }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add MCP Server
                </button>
            )}
        </div>
    );
}
