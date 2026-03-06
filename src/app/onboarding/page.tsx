"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/authFetch";

const PROVIDERS = [
    { label: "Google Gemini", base: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.0-flash" },
    { label: "OpenAI", base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    { label: "Anthropic", base: "https://api.anthropic.com/v1", model: "claude-sonnet-4-20250514" },
    { label: "Custom / Local", base: "", model: "" },
];

/* ── shared inline styles ────────────────────────────── */
const S = {
    container: {
        position: "fixed" as const, inset: 0,
        background: "#000", display: "flex", flexDirection: "column" as const,
        alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 24,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    },
    dots: { display: "flex", gap: 10, marginBottom: 40 },
    dot: (active: boolean, done: boolean) => ({
        width: 10, height: 10, borderRadius: "50%",
        background: active ? "#0a84ff" : done ? "rgba(10,132,255,0.45)" : "rgba(255,255,255,0.12)",
        boxShadow: active ? "0 0 12px rgba(10,132,255,0.3)" : "none",
        transform: active ? "scale(1.25)" : "scale(1)", transition: "all .35s ease",
    }),
    content: { width: "100%", maxWidth: 480 },
    step: { display: "flex", flexDirection: "column" as const, alignItems: "center", textAlign: "center" as const },
    emoji: { fontSize: 56, marginBottom: 16 },
    title: { fontSize: 28, fontWeight: 700, color: "#fff", marginBottom: 8, letterSpacing: "-0.03em" },
    subtitle: { color: "rgba(255,255,255,0.55)", fontSize: 15, lineHeight: 1.6, marginBottom: 32, maxWidth: 380 },
    field: { width: "100%", textAlign: "left" as const, marginBottom: 16 },
    label: {
        display: "block", fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.30)",
        textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8,
    },
    input: {
        width: "100%", padding: "12px 14px", borderRadius: 10,
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
        color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none",
    },
    btnPrimary: (disabled = false) => ({
        width: "100%", maxWidth: 280, padding: "15px 28px", border: "none", borderRadius: 10,
        background: disabled ? "rgba(10,132,255,0.3)" : "#0a84ff",
        color: "#fff", fontSize: 16, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit", transition: "all .2s", marginTop: 24, opacity: disabled ? 0.5 : 1,
    }),
    btnSmall: (disabled = false) => ({
        padding: "12px 28px", border: "none", borderRadius: 10,
        background: disabled ? "rgba(10,132,255,0.3)" : "#0a84ff",
        color: "#fff", fontSize: 14, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit", minWidth: 150, opacity: disabled ? 0.5 : 1,
    }),
    btnGhost: {
        background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
        color: "rgba(255,255,255,0.55)", padding: "12px 24px", borderRadius: 10,
        cursor: "pointer", fontSize: 14, fontFamily: "inherit",
    },
    nav: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginTop: 32, gap: 16 },
    providerGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" },
    providerBtn: (selected: boolean) => ({
        padding: "14px 12px", borderRadius: 10,
        background: selected ? "rgba(10,132,255,0.12)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${selected ? "#0a84ff" : "rgba(255,255,255,0.08)"}`,
        color: selected ? "#fff" : "rgba(255,255,255,0.55)",
        fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
        boxShadow: selected ? "0 0 20px rgba(10,132,255,0.15)" : "none", transition: "all .25s",
    }),
    fieldsGroup: { width: "100%", marginTop: 20 },
    testBtn: (status: string) => {
        let bg = "rgba(255,255,255,0.03)";
        let borderColor = "rgba(255,255,255,0.08)";
        let color = "rgba(255,255,255,0.55)";
        if (status === "ok") { bg = "rgba(52,199,89,0.08)"; borderColor = "rgba(52,199,89,0.5)"; color = "#34c759"; }
        if (status === "fail") { bg = "rgba(255,69,58,0.08)"; borderColor = "rgba(255,69,58,0.5)"; color = "#ff453a"; }
        return {
            width: "100%", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 500,
            fontFamily: "inherit", cursor: "pointer", border: `1px solid ${borderColor}`,
            background: bg, color, marginTop: 8, transition: "all .25s",
        };
    },
    testError: { color: "#ff453a", fontSize: 12, marginTop: 8, textAlign: "left" as const, wordBreak: "break-all" as const },
    togglesGroup: { width: "100%", display: "flex", flexDirection: "column" as const, gap: 8 },
    toggleRow: {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px", background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
    },
    toggleInfo: { display: "flex", flexDirection: "column" as const, alignItems: "flex-start", gap: 2 },
    toggleTitle: { fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.92)" },
    toggleDesc: { fontSize: 12, color: "rgba(255,255,255,0.30)" },
    toggleSwitch: (on: boolean) => ({
        width: 48, height: 28, borderRadius: 14, border: "none", cursor: "pointer",
        position: "relative" as const, transition: "background .3s",
        background: on ? "#0a84ff" : "rgba(255,255,255,0.12)", flexShrink: 0,
    }),
    toggleKnob: (on: boolean) => ({
        position: "absolute" as const, top: 3, left: 3, width: 22, height: 22,
        borderRadius: "50%", background: "#fff",
        transform: on ? "translateX(20px)" : "translateX(0)",
        transition: "transform .3s cubic-bezier(0.25,1,0.5,1)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
    }),
    summaryCard: {
        width: "100%", background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, overflow: "hidden" as const,
    },
    summaryRow: {
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "13px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)",
    },
    summaryLabel: { color: "rgba(255,255,255,0.55)", fontSize: 13 },
    summaryValue: { color: "rgba(255,255,255,0.92)", fontSize: 13, fontWeight: 500 },
    nestedField: { width: "100%", textAlign: "left" as const, marginBottom: 12, paddingLeft: 16, marginTop: -4 },
};

export default function OnboardingPage() {
    const router = useRouter();
    const [step, setStep] = useState(0);
    const [botName, setBotName] = useState("Eddy");

    const [selectedProvider, setSelectedProvider] = useState(-1);
    const [apiBase, setApiBase] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [model, setModel] = useState("");
    const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
    const [testError, setTestError] = useState("");

    const [codeExecution, setCodeExecution] = useState(false);
    const [telegramEnabled, setTelegramEnabled] = useState(false);
    const [telegramToken, setTelegramToken] = useState("");
    const [discordEnabled, setDiscordEnabled] = useState(false);
    const [discordToken, setDiscordToken] = useState("");

    const [saving, setSaving] = useState(false);

    useEffect(() => {
        authFetch("/api/settings")
            .then(r => r.json())
            .then(data => {
                if (data && data.apiKey && data.apiKey !== "picobot-local" && data.apiKey.length > 5) {
                    router.replace("/");
                }
            })
            .catch(() => { });
    }, [router]);

    const selectProvider = (idx: number) => {
        setSelectedProvider(idx);
        setApiBase(PROVIDERS[idx].base);
        setModel(PROVIDERS[idx].model);
        setTestStatus("idle"); setTestError("");
    };

    const testConnection = async () => {
        setTestStatus("testing"); setTestError("");
        try {
            const res = await fetch(`${apiBase}/models`, {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(10000),
            });
            if (res.ok) { setTestStatus("ok"); return; }
            const txt = await res.text().catch(() => "");
            setTestStatus("fail"); setTestError(`HTTP ${res.status}: ${txt.slice(0, 100)}`);
        } catch (e: any) {
            try {
                const res2 = await fetch(`${apiBase}/chat/completions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                    body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
                    signal: AbortSignal.timeout(15000),
                });
                if (res2.ok) { setTestStatus("ok"); } else {
                    setTestStatus("fail"); setTestError(`Could not verify: ${e.message}`);
                }
            } catch (e2: any) { setTestStatus("fail"); setTestError(e2.message || "Connection failed"); }
        }
    };

    const saveAndFinish = async () => {
        setSaving(true);
        try {
            await authFetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    apiBaseUrl: apiBase, apiKey, defaultModel: model,
                    allowCodeExecution: codeExecution ? 1 : 0,
                    telegram: telegramEnabled ? { enabled: true, token: telegramToken, allowFrom: "" } : undefined,
                    discord: discordEnabled ? { enabled: true, token: discordToken, allowFrom: "" } : undefined,
                }),
            });
            try {
                await authFetch("/api/botname", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: botName }),
                });
            } catch { }
            router.replace("/");
        } catch (err) { console.error("Failed to save:", err); setSaving(false); }
    };

    const canProceed = apiBase.length > 0 && apiKey.length > 0 && model.length > 0;

    const steps = [
        // 0 — Welcome
        <div key="welcome" style={S.step}>
            <div style={S.emoji}>👋</div>
            <h1 style={S.title}>Welcome!</h1>
            <p style={S.subtitle}>Let&apos;s get your assistant set up.<br />It only takes a minute.</p>
            <div style={S.field}>
                <label style={S.label}>What should I call myself?</label>
                <input style={S.input} value={botName} onChange={e => setBotName(e.target.value)} placeholder="Eddy" autoFocus />
            </div>
            <button style={S.btnPrimary()} onClick={() => setStep(1)}>Let&apos;s Go →</button>
        </div>,

        // 1 — Connect AI
        <div key="connect" style={S.step}>
            <div style={S.emoji}>🧠</div>
            <h1 style={S.title}>Connect Your Brain</h1>
            <p style={S.subtitle}>I need an AI provider to think. Pick one or enter a custom endpoint.</p>
            <div style={S.providerGrid}>
                {PROVIDERS.map((p, i) => (
                    <button key={p.label} style={S.providerBtn(selectedProvider === i)} onClick={() => selectProvider(i)}>
                        {p.label}
                    </button>
                ))}
            </div>
            {selectedProvider >= 0 && (
                <div style={S.fieldsGroup}>
                    <div style={S.field}>
                        <label style={S.label}>API Base URL</label>
                        <input style={S.input} value={apiBase} onChange={e => { setApiBase(e.target.value); setTestStatus("idle"); }} placeholder="https://api.openai.com/v1" />
                    </div>
                    <div style={S.field}>
                        <label style={S.label}>API Key</label>
                        <input style={S.input} type="password" value={apiKey} onChange={e => { setApiKey(e.target.value); setTestStatus("idle"); }} placeholder="sk-..." />
                    </div>
                    <div style={S.field}>
                        <label style={S.label}>Model</label>
                        <input style={S.input} value={model} onChange={e => setModel(e.target.value)} placeholder="gpt-4o-mini" />
                    </div>
                    <button style={S.testBtn(testStatus)} onClick={testConnection} disabled={!canProceed || testStatus === "testing"}>
                        {testStatus === "idle" && "🔌 Test Connection"}
                        {testStatus === "testing" && "⏳ Testing..."}
                        {testStatus === "ok" && "✅ Connected!"}
                        {testStatus === "fail" && "❌ Failed — Retry"}
                    </button>
                    {testError && <p style={S.testError}>{testError}</p>}
                </div>
            )}
            <div style={S.nav}>
                <button style={S.btnGhost} onClick={() => setStep(0)}>← Back</button>
                <button style={S.btnSmall(!canProceed)} onClick={() => setStep(2)} disabled={!canProceed}>Continue →</button>
            </div>
        </div>,

        // 2 — Superpowers
        <div key="superpowers" style={S.step}>
            <div style={S.emoji}>⚡</div>
            <h1 style={S.title}>Superpowers</h1>
            <p style={S.subtitle}>These are optional extras. You can always change them later in Settings.</p>
            <div style={S.togglesGroup}>
                <div style={S.toggleRow}>
                    <div style={S.toggleInfo}>
                        <span style={S.toggleTitle}>🐍 Code Execution</span>
                        <span style={S.toggleDesc}>Let me run Python on your machine</span>
                    </div>
                    <button style={S.toggleSwitch(codeExecution)} onClick={() => setCodeExecution(!codeExecution)}>
                        <span style={S.toggleKnob(codeExecution)} />
                    </button>
                </div>
                <div style={S.toggleRow}>
                    <div style={S.toggleInfo}>
                        <span style={S.toggleTitle}>📨 Telegram Bot</span>
                        <span style={S.toggleDesc}>Connect via Telegram</span>
                    </div>
                    <button style={S.toggleSwitch(telegramEnabled)} onClick={() => setTelegramEnabled(!telegramEnabled)}>
                        <span style={S.toggleKnob(telegramEnabled)} />
                    </button>
                </div>
                {telegramEnabled && (
                    <div style={S.nestedField}>
                        <input style={S.input} value={telegramToken} onChange={e => setTelegramToken(e.target.value)} placeholder="Telegram Bot Token" />
                    </div>
                )}
                <div style={S.toggleRow}>
                    <div style={S.toggleInfo}>
                        <span style={S.toggleTitle}>💬 Discord Bot</span>
                        <span style={S.toggleDesc}>Connect via Discord</span>
                    </div>
                    <button style={S.toggleSwitch(discordEnabled)} onClick={() => setDiscordEnabled(!discordEnabled)}>
                        <span style={S.toggleKnob(discordEnabled)} />
                    </button>
                </div>
                {discordEnabled && (
                    <div style={S.nestedField}>
                        <input style={S.input} value={discordToken} onChange={e => setDiscordToken(e.target.value)} placeholder="Discord Bot Token" />
                    </div>
                )}
            </div>
            <div style={S.nav}>
                <button style={S.btnGhost} onClick={() => setStep(1)}>← Back</button>
                <button style={S.btnSmall()} onClick={() => setStep(3)}>Continue →</button>
            </div>
        </div>,

        // 3 — Ready
        <div key="ready" style={S.step}>
            <div style={S.emoji}>🚀</div>
            <h1 style={S.title}>You&apos;re Ready!</h1>
            <p style={S.subtitle}>Everything is configured. Here&apos;s a summary:</p>
            <div style={S.summaryCard}>
                {[
                    ["Bot Name", botName],
                    ["Provider", selectedProvider >= 0 ? PROVIDERS[selectedProvider].label : "—"],
                    ["Model", model || "—"],
                    ["Code Execution", codeExecution ? "✅ Enabled" : "Off"],
                    ["Telegram", telegramEnabled ? "✅ Enabled" : "Off"],
                    ["Discord", discordEnabled ? "✅ Enabled" : "Off"],
                ].map(([label, value], i, arr) => (
                    <div key={label} style={{ ...S.summaryRow, ...(i === arr.length - 1 ? { borderBottom: "none" } : {}) }}>
                        <span style={S.summaryLabel}>{label}</span>
                        <span style={S.summaryValue}>{value}</span>
                    </div>
                ))}
            </div>
            <div style={S.nav}>
                <button style={S.btnGhost} onClick={() => setStep(2)}>← Back</button>
                <button style={S.btnSmall(saving)} onClick={saveAndFinish} disabled={saving}>
                    {saving ? "Saving..." : "Start Chatting →"}
                </button>
            </div>
        </div>,
    ];

    return (
        <div style={S.container}>
            <div style={S.dots}>
                {[0, 1, 2, 3].map(i => <span key={i} style={S.dot(i === step, i < step)} />)}
            </div>
            <div style={S.content}>{steps[step]}</div>
        </div>
    );
}
