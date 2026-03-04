"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import ArtifactPanel, { Artifact } from "@/components/ArtifactPanel";
import WorkspaceModal from "@/components/WorkspaceModal";
import MemoryModal from "@/components/MemoryModal";
import TasksModal from "@/components/TasksModal";
import NotesModal from "@/components/NotesModal";
import { useChat } from "@/components/ChatContext";
import allSuggestions from "@/data/suggestions.json";

type Suggestion = { title: string; description: string; prompt: string };

export default function ChatPage() {
  const { chats, activeChatId, setActiveChatId, createChat, addMessageToChat, deleteChat } = useChat();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [botName, setBotName] = useState("Eddy");
  const [showSidebar, setShowSidebar] = useState(true);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const speechRecRef = useRef<any>(null);

  // Shuffle and pick 4 suggestions whenever the active chat changes
  const visibleSuggestions = useMemo<Suggestion[]>(() => {
    const shuffled = [...allSuggestions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4);
  }, [activeChatId]);

  const [settings, setSettings] = useState({
    openaiApiKey: "",
    openaiApiBase: "",
    model: "",
  });
  const [telegram, setTelegram] = useState({
    enabled: false,
    token: "",
    allowFrom: "",
  });
  const [discord, setDiscord] = useState({
    enabled: false,
    token: "",
    allowFrom: "",
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "advanced">("general");

  // Search capability detection
  const [searchCapability, setSearchCapability] = useState<{
    hasSearch: boolean;
    provider: string;
    confidence: string;
    detail: string;
    effectiveSearch: boolean;
    override: boolean | null;
  } | null>(null);
  const [searchOverride, setSearchOverride] = useState<boolean | null>(null);

  const refreshSearchCapability = useCallback(() => {
    fetch('/api/search-capability')
      .then(r => r.json())
      .then(data => {
        if (!data.error) {
          setSearchCapability(data);
          setSearchOverride(data.override);
        }
      })
      .catch(() => { });
  }, []);

  // Close tools menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setShowToolsMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch bot name from SOUL.md
  useEffect(() => {
    fetch("/api/botname")
      .then(r => r.json())
      .then(d => { if (d.name) setBotName(d.name); })
      .catch(() => { });
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((stored) => {
        if (stored && !stored.error) {
          setSettings({
            openaiApiKey: stored.apiKey || "",
            openaiApiBase: stored.apiBaseUrl || "",
            model: stored.defaultModel || "",
          });
          if (stored.telegram) {
            setTelegram({
              enabled: stored.telegram.enabled || false,
              token: stored.telegram.token || "",
              allowFrom: stored.telegram.allowFrom || "",
            });
          }
          if (stored.discord) {
            setDiscord({
              enabled: stored.discord.enabled || false,
              token: stored.discord.token || "",
              allowFrom: stored.discord.allowFrom || "",
            });
          }
        }
        setSettingsLoaded(true);
        refreshSearchCapability();
      })
      .catch((err) => {
        console.error("Failed to load settings:", err);
        setSettingsLoaded(true);
      });
  }, [refreshSearchCapability]);

  const saveSettings = async () => {
    setSaveStatus("saving");
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiBaseUrl: settings.openaiApiBase,
          apiKey: settings.openaiApiKey,
          defaultModel: settings.model,
          telegram,
          discord,
        }),
      });
      setSaveStatus("saved");
      refreshSearchCapability();
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setSaveStatus("idle");
    }
  };

  const activeChat = chats.find((c) => c.id === activeChatId);

  useEffect(() => {
    if (messagesEndRef.current && !showSettings) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeChat?.messages, isLoading, showSettings]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    let targetChatId = activeChatId;

    if (!targetChatId) {
      targetChatId = createChat();
    }

    const userMsgContent = input.trim();
    const userMsg = { id: Date.now().toString(), role: "user" as const, content: userMsgContent };

    addMessageToChat(targetChatId, userMsg);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsgContent,
          settings,
        }),
      });

      const data = await res.json();
      const aiMsg = { id: (Date.now() + 1).toString(), role: "ai" as const, content: data.response };
      addMessageToChat(targetChatId, aiMsg);
    } catch (err) {
      const errMsg = { id: (Date.now() + 1).toString(), role: "ai" as const, content: `⚠️ Failed to reach ${botName}. Check if the binary exists in \`./bin/picobot.exe\`.` };
      addMessageToChat(targetChatId, errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleSpeechRecognition = () => {
    if (isListening) {
      speechRecRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    speechRecRef.current = recognition;

    // Capture the current input value at the start
    const baseInput = input;

    recognition.onresult = (event: any) => {
      let fullTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript;
      }
      setInput((baseInput ? baseInput + ' ' : '') + fullTranscript);
    };

    recognition.onend = () => {
      setIsListening(false);
      speechRecRef.current = null;
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      speechRecRef.current = null;
      if (event.error === 'not-allowed') {
        alert('Microphone access was denied. Please allow microphone access and try again.');
      }
    };

    recognition.start();
    setIsListening(true);
  };
  return (
    <>
      <div className="flex w-full h-screen bg-black text-white">
        {/* ─── SIDEBAR ─── */}
        <div
          className="sidebar flex flex-col shrink-0"
          style={{
            width: showSidebar ? '260px' : '0px',
            overflow: 'hidden',
            transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: showSidebar ? 1 : 0,
          }}
        >
          <div className="p-5 flex flex-col h-full">
            {/* New Chat Button */}
            <button
              onClick={() => {
                createChat();
                setShowSettings(false);
                setActiveArtifact(null);
              }}
              className="sidebar-item mb-4"
              style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-60" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              <span className="text-[13px]">New Chat</span>
            </button>

            {/* Chat List */}
            <div className="flex-grow overflow-y-auto space-y-1">
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => {
                    setActiveChatId(chat.id);
                    setShowSettings(false);
                    setActiveArtifact(null);
                  }}
                  className={`sidebar-item flex justify-between items-center group ${activeChatId === chat.id && !showSettings ? "active" : ""}`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-40 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                    </svg>
                    <span className="truncate">{chat.title}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(chat.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity p-1 shrink-0 ml-2"
                    title="Delete chat"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                    </svg>
                  </button>
                </button>
              ))}
              {chats.length === 0 && (
                <div className="text-xs text-center mt-12" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  No conversations yet
                </div>
              )}
            </div>

            {/* Settings */}
            <div className="pt-3 mt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`sidebar-item ${showSettings ? "active" : ""}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-50" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
                <span>Settings</span>
              </button>
            </div>
          </div>
        </div>

        {/* ─── MAIN AREA ─── */}
        <div className="flex-1 relative flex flex-col overflow-hidden bg-black">
          {/* Hamburger toggle */}
          <button
            onClick={() => setShowSidebar(v => !v)}
            title={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
            style={{
              position: 'absolute',
              top: '14px',
              left: '14px',
              zIndex: 40,
              width: '34px',
              height: '34px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              cursor: 'pointer',
              padding: '0',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ display: 'block', width: '14px', height: '1.5px', background: 'rgba(255,255,255,0.55)', borderRadius: '2px', transition: 'all 0.2s' }} />
            <span style={{ display: 'block', width: '14px', height: '1.5px', background: 'rgba(255,255,255,0.55)', borderRadius: '2px', transition: 'all 0.2s' }} />
            <span style={{ display: 'block', width: '14px', height: '1.5px', background: 'rgba(255,255,255,0.55)', borderRadius: '2px', transition: 'all 0.2s' }} />
          </button>
          {showSettings ? (
            /* ─── SETTINGS VIEW ─── */
            <div className="flex-1 overflow-y-auto flex items-center justify-center p-6 md:p-12">
              <div className="settings-card w-full max-w-xl animate-fade-in relative" style={{ padding: '40px 48px', height: '680px', overflowY: 'auto' }}>
                {/* Close Button */}
                <button
                  onClick={() => setShowSettings(false)}
                  className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg transition-colors duration-150"
                  style={{ color: 'var(--text-tertiary)', background: 'transparent' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>

                <div className="mb-8 text-center">
                  <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Settings</h1>
                  <p className="text-sm mt-2" style={{ color: 'var(--text-tertiary)' }}>Configure your {botName} agent</p>
                </div>

                {/* Tab Navigation */}
                <div style={{ display: 'flex', gap: '0', marginBottom: '32px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {(['general', 'advanced'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setSettingsTab(tab)}
                      style={{
                        padding: '10px 20px',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: settingsTab === tab ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: settingsTab === tab ? '2px solid #3B82F6' : '2px solid transparent',
                        marginBottom: '-1px',
                        cursor: 'pointer',
                        transition: 'color 0.15s ease',
                      }}
                    >
                      {tab === 'general' ? '⚙️ General' : '🔧 Advanced'}
                    </button>
                  ))}
                </div>

                {!settingsLoaded ? (
                  <div className="flex items-center justify-center py-12">
                    <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading settings...</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>

                    {settingsTab === 'general' && (<>
                      {/* ── LLM Provider Section ── */}
                      <div>
                        <div className="flex items-center gap-2" style={{ marginBottom: '20px' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                          </svg>
                          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>LLM Provider</h2>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                          <div>
                            <label className="block text-[13px] font-medium" style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>API Base URL</label>
                            <input
                              type="url"
                              value={settings.openaiApiBase}
                              onChange={(e) => setSettings({ ...settings, openaiApiBase: e.target.value })}
                              className="form-input"
                              placeholder="https://openrouter.ai/api/v1"
                            />
                          </div>
                          <div>
                            <label className="block text-[13px] font-medium" style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>API Key</label>
                            <input
                              type="password"
                              value={settings.openaiApiKey}
                              onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                              className="form-input"
                              placeholder="sk-..."
                            />
                            <p className="text-[11px]" style={{ color: 'var(--text-tertiary)', marginTop: '6px' }}>Stored locally. Never transmitted to us.</p>
                          </div>
                          <div>
                            <label className="block text-[13px] font-medium" style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>Model</label>
                            <input
                              type="text"
                              value={settings.model}
                              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                              className="form-input"
                              placeholder="google/gemini-2.5-flash"
                            />
                          </div>
                        </div>
                      </div>

                    </>)}

                    {settingsTab === 'advanced' && (<>
                      {/* ── Search Capability Detection ── */}
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" style={{ color: searchCapability?.effectiveSearch ? '#34D399' : 'var(--text-tertiary)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Search Capability</h2>
                        </div>

                        {/* Detection Status */}
                        <div style={{
                          background: 'rgba(255,255,255,0.03)',
                          borderRadius: '12px',
                          padding: '16px',
                          border: '1px solid rgba(255,255,255,0.06)',
                          marginBottom: '16px',
                        }}>
                          {searchCapability ? (
                            <>
                              <div className="flex items-center gap-2 mb-2">
                                <span style={{
                                  display: 'inline-block',
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  background: searchCapability.effectiveSearch ? '#34D399' : '#EF4444',
                                  boxShadow: searchCapability.effectiveSearch ? '0 0 6px #34D39966' : '0 0 6px #EF444466',
                                }} />
                                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                  {searchCapability.effectiveSearch ? 'Search Available' : 'No Search Detected'}
                                </span>
                                {searchCapability.confidence && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{
                                    background: searchCapability.confidence === 'high' ? 'rgba(52,211,153,0.15)' :
                                      searchCapability.confidence === 'medium' ? 'rgba(251,191,36,0.15)' : 'rgba(239,68,68,0.15)',
                                    color: searchCapability.confidence === 'high' ? '#34D399' :
                                      searchCapability.confidence === 'medium' ? '#FBB724' : '#EF4444',
                                  }}>
                                    {searchCapability.confidence} confidence
                                  </span>
                                )}
                              </div>
                              <p className="text-[12px]" style={{ color: 'var(--text-tertiary)', lineHeight: '1.5' }}>
                                <strong style={{ color: 'var(--text-secondary)' }}>{searchCapability.provider}</strong> — {searchCapability.detail}
                              </p>
                            </>
                          ) : (
                            <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
                              Save your LLM settings first, then detection will run automatically.
                            </p>
                          )}
                        </div>

                        {/* Manual Override Toggle */}
                        <div className="flex items-center justify-between" style={{ padding: '8px 0' }}>
                          <div>
                            <p className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>Prefer LLM Search</p>
                            <p className="text-[11px]" style={{ color: 'var(--text-tertiary)', marginTop: '2px' }}>
                              Override auto-detection — force PicoBot to use LLM search
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {searchOverride !== null && (
                              <button
                                onClick={async () => {
                                  setSearchOverride(null);
                                  await fetch('/api/search-capability', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ override: null }),
                                  });
                                  refreshSearchCapability();
                                }}
                                className="text-[10px] px-2 py-0.5 rounded"
                                style={{ color: 'var(--text-tertiary)', background: 'rgba(255,255,255,0.05)' }}
                              >
                                Reset to Auto
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                const newVal = searchOverride === null ? true : !searchOverride;
                                setSearchOverride(newVal);
                                await fetch('/api/search-capability', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ override: newVal }),
                                });
                                refreshSearchCapability();
                              }}
                              className="relative w-11 h-6 rounded-full transition-colors duration-200"
                              style={{
                                background: (searchOverride !== null ? searchOverride : searchCapability?.hasSearch)
                                  ? '#34D399' : 'rgba(255,255,255,0.1)',
                              }}
                            >
                              <span
                                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200"
                                style={{
                                  transform: (searchOverride !== null ? searchOverride : searchCapability?.hasSearch)
                                    ? 'translateX(20px)' : 'translateX(0)',
                                }}
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                    </>)}

                    {settingsTab === 'general' && (<>
                      {/* ── Telegram Section ── */}
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" style={{ color: '#2AABEE' }} viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                            </svg>
                            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Telegram</h2>
                          </div>
                          <button
                            onClick={() => setTelegram({ ...telegram, enabled: !telegram.enabled })}
                            className="relative w-11 h-6 rounded-full transition-colors duration-200"
                            style={{
                              background: telegram.enabled ? '#2AABEE' : 'rgba(255,255,255,0.1)',
                            }}
                          >
                            <span
                              className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200"
                              style={{ transform: telegram.enabled ? 'translateX(20px)' : 'translateX(0)' }}
                            />
                          </button>
                        </div>
                        {telegram.enabled && (
                          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                            <div>
                              <label className="block text-[13px] font-medium" style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>Bot Token</label>
                              <input
                                type="password"
                                value={telegram.token}
                                onChange={(e) => setTelegram({ ...telegram, token: e.target.value })}
                                className="form-input"
                                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                              />
                              <p className="text-[11px]" style={{ color: 'var(--text-tertiary)', marginTop: '6px' }}>Get this from @BotFather on Telegram</p>
                            </div>
                            <div>
                              <label className="block text-[13px] font-medium" style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>Allowed User IDs</label>
                              <input
                                type="text"
                                value={telegram.allowFrom}
                                onChange={(e) => setTelegram({ ...telegram, allowFrom: e.target.value })}
                                className="form-input"
                                placeholder="123456789, 987654321"
                              />
                              <p className="text-[11px]" style={{ color: 'var(--text-tertiary)', marginTop: '6px' }}>Comma-separated. Leave empty to allow anyone.</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <hr className="apple-divider" />

                      {/* ── Discord Section ── */}
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" style={{ color: '#5865F2' }} viewBox="0 0 24 24" fill="currentColor">
                              <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
                            </svg>
                            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Discord</h2>
                          </div>
                          <button
                            onClick={() => setDiscord({ ...discord, enabled: !discord.enabled })}
                            className="relative w-11 h-6 rounded-full transition-colors duration-200"
                            style={{
                              background: discord.enabled ? '#5865F2' : 'rgba(255,255,255,0.1)',
                            }}
                          >
                            <span
                              className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200"
                              style={{ transform: discord.enabled ? 'translateX(20px)' : 'translateX(0)' }}
                            />
                          </button>
                        </div>
                        {discord.enabled && (
                          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                            <div>
                              <label className="block text-[13px] font-medium" style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>Bot Token</label>
                              <input
                                type="password"
                                value={discord.token}
                                onChange={(e) => setDiscord({ ...discord, token: e.target.value })}
                                className="form-input"
                                placeholder="MTIzNDU2Nzg5MDEyMzQ1Njc4OQ..."
                              />
                              <p className="text-[11px]" style={{ color: 'var(--text-tertiary)', marginTop: '6px' }}>From the Discord Developer Portal → Bot tab</p>
                            </div>
                            <div>
                              <label className="block text-[13px] font-medium" style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>Allowed User IDs</label>
                              <input
                                type="text"
                                value={discord.allowFrom}
                                onChange={(e) => setDiscord({ ...discord, allowFrom: e.target.value })}
                                className="form-input"
                                placeholder="123456789012345678"
                              />
                              <p className="text-[11px]" style={{ color: 'var(--text-tertiary)', marginTop: '6px' }}>Comma-separated. Leave empty to allow anyone.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </>)}

                    {/* ── Save ── */}
                    <div className="pt-4">
                      <hr className="apple-divider mb-6" />
                      <button
                        onClick={saveSettings}
                        disabled={saveStatus === "saving"}
                        className="btn-primary"
                        style={{
                          opacity: saveStatus === "saving" ? 0.6 : 1,
                          background: saveStatus === "saved" ? '#22c55e' : undefined,
                        }}
                      >
                        {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "✓ Saved" : "Save Changes"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ─── CHAT VIEW ─── */
            <div className="flex w-full h-full overflow-hidden">
              <div className="flex-1 relative flex flex-col min-w-0 transition-all duration-300">
                <div className="chat-container">
                  <div className="chat-messages" style={{ padding: '64px 24px', gap: '40px' }}>
                    {/* Empty state */}
                    {/* Empty state & Suggestions */}
                    {(!activeChat?.messages?.length || (activeChat.messages.length === 1 && activeChat.messages[0].role === "ai")) && (
                      <div className="flex flex-col items-center justify-center h-[70vh] animate-fade-in relative z-10">
                        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6" style={{ color: 'var(--text-tertiary)' }}>
                            <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97zM6.75 8.25a.75.75 0 01.75-.75h9a.75.75 0 010 1.5h-9a.75.75 0 01-.75-.75zm.75 3.75a.75.75 0 000 1.5h5.25a.75.75 0 000-1.5H7.5z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <p className="text-[17px] font-medium" style={{ color: 'var(--text-primary)', marginBottom: '40px' }}>What do you want to automate today?</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 max-w-2xl w-full px-6" style={{ gap: '32px', gridGap: '32px' }}>
                          {visibleSuggestions.map((s, i) => (
                            <button key={i} onClick={() => { setInput(s.prompt); }} className="flex flex-col text-left rounded-xl border transition-colors" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', padding: '24px' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}>
                              <h3 className="text-[14px] font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{s.title}</h3>
                              <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>{s.description}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Messages (hide the initial greeting if we are showing the empty state) */}
                    {(activeChat?.messages?.length ?? 0) > 1 && activeChat?.messages?.map((msg) => (
                      <div key={msg.id} className={`message ${msg.role === "user" ? "user" : "ai"}`}>
                        <div className="message-avatar">
                          {msg.role === "ai" ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" style={{ color: 'var(--text-secondary)' }}>
                              <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white">
                              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div className="message-bubble">
                          {msg.role === "ai" ? (
                            <div className="prose prose-invert max-w-none">
                              <ReactMarkdown
                                components={{
                                  table({ children, ...props }: any) {
                                    // Extract raw table text for canvas export
                                    const extractTableText = (node: any): string => {
                                      if (typeof node === 'string') return node;
                                      if (!node) return '';
                                      if (Array.isArray(node)) return node.map(extractTableText).join('');
                                      if (node.props?.children) return extractTableText(node.props.children);
                                      return '';
                                    };
                                    // Reconstruct markdown table from the rendered nodes
                                    const getMarkdownTable = (): string => {
                                      try {
                                        const rows: string[][] = [];
                                        const processChildren = (kids: any) => {
                                          React.Children.forEach(kids, (child: any) => {
                                            if (!child?.props) return;
                                            if (child.type === 'thead' || child.type === 'tbody') {
                                              processChildren(child.props.children);
                                            } else if (child.type === 'tr') {
                                              const cells: string[] = [];
                                              React.Children.forEach(child.props.children, (cell: any) => {
                                                cells.push(extractTableText(cell?.props?.children || ''));
                                              });
                                              rows.push(cells);
                                            }
                                          });
                                        };
                                        processChildren(children);
                                        if (rows.length === 0) return '';
                                        const header = '| ' + rows[0].join(' | ') + ' |';
                                        const separator = '| ' + rows[0].map(() => '---').join(' | ') + ' |';
                                        const body = rows.slice(1).map(r => '| ' + r.join(' | ') + ' |').join('\n');
                                        return [header, separator, body].join('\n');
                                      } catch { return ''; }
                                    };
                                    return (
                                      <div style={{ position: 'relative', marginTop: '16px', marginBottom: '16px' }} className="group">
                                        <div style={{
                                          position: 'absolute', top: '-8px', right: '0',
                                          opacity: 0, transition: 'opacity 0.15s',
                                          zIndex: 10,
                                        }} className="group-[:hover]:opacity-100">
                                          <button
                                            onClick={() => {
                                              const md = getMarkdownTable();
                                              if (md) setActiveArtifact({ type: 'table' as any, content: md, language: 'markdown', title: 'Table', id: Date.now().toString() });
                                            }}
                                            style={{
                                              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)',
                                              color: 'white', fontSize: '11px', padding: '4px 8px', borderRadius: '4px',
                                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                                              backdropFilter: 'blur(8px)',
                                            }}
                                            title="Open table in canvas"
                                          >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: '12px', height: '12px' }}>
                                              <path d="M4.25 2A2.25 2.25 0 002 4.25v11.5A2.25 2.25 0 004.25 18h11.5A2.25 2.25 0 0018 15.75V4.25A2.25 2.25 0 0015.75 2H4.25zM14 9a1 1 0 00-1-1H7a1 1 0 00-1 1v5a1 1 0 001 1h6a1 1 0 001-1V9z" />
                                            </svg>
                                            Open in Canvas
                                          </button>
                                        </div>
                                        <table {...props} style={{
                                          width: '100%', borderCollapse: 'collapse',
                                          fontSize: '13px', lineHeight: '1.5',
                                          border: '1px solid rgba(255,255,255,0.1)',
                                          borderRadius: '6px', overflow: 'hidden',
                                        }}>
                                          {children}
                                        </table>
                                      </div>
                                    );
                                  },
                                  thead({ children, ...props }: any) {
                                    return <thead {...props} style={{ background: 'rgba(255,255,255,0.06)' }}>{children}</thead>;
                                  },
                                  th({ children, ...props }: any) {
                                    return <th {...props} style={{
                                      padding: '8px 12px', textAlign: 'left', fontWeight: 600,
                                      fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px',
                                      color: 'rgba(255,255,255,0.7)',
                                      borderBottom: '1px solid rgba(255,255,255,0.12)',
                                      borderRight: '1px solid rgba(255,255,255,0.06)',
                                    }}>{children}</th>;
                                  },
                                  td({ children, ...props }: any) {
                                    return <td {...props} style={{
                                      padding: '8px 12px',
                                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                                      borderRight: '1px solid rgba(255,255,255,0.06)',
                                      color: 'rgba(255,255,255,0.85)',
                                    }}>{children}</td>;
                                  },
                                  tr({ children, node, ...props }: any) {
                                    return <tr {...props} style={{
                                      transition: 'background 0.1s',
                                    }} onMouseEnter={(e: any) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                      onMouseLeave={(e: any) => e.currentTarget.style.background = 'transparent'}
                                    >{children}</tr>;
                                  },
                                  code({ node, inline, className, children, ...props }: any) {
                                    const match = /language-(\w+)/.exec(className || '');
                                    const isBlock = !inline && match;
                                    if (isBlock) {
                                      return (
                                        <div className="relative group mt-4 mb-4">
                                          <div className="absolute top-2 right-2 opacity-0 group-[&:hover]:opacity-100 transition-opacity z-10 hidden sm:block">
                                            <button
                                              onClick={() => setActiveArtifact({ type: 'code', content: String(children).replace(/\n$/, ''), language: match[1], title: 'Generated Code', id: Date.now().toString() })}
                                              className="bg-white/10 hover:bg-white/20 text-white text-xs px-2 py-1 rounded backdrop-blur-md border border-white/10 flex items-center gap-1 transition-colors shadow-sm"
                                              title="Open code in canvas"
                                            >
                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                <path d="M4.25 2A2.25 2.25 0 002 4.25v11.5A2.25 2.25 0 004.25 18h11.5A2.25 2.25 0 0018 15.75V4.25A2.25 2.25 0 0015.75 2H4.25zM14 9a1 1 0 00-1-1H7a1 1 0 00-1 1v5a1 1 0 001 1h6a1 1 0 001-1V9z" />
                                              </svg>
                                              Open in Canvas
                                            </button>
                                          </div>
                                          <pre className={className} {...props}>
                                            <code className={className} {...props}>{children}</code>
                                          </pre>
                                        </div>
                                      );
                                    }
                                    return <code className={className} {...props}>{children}</code>;
                                  }
                                }}
                              >
                                {(() => {
                                  // Pre-process: fix pipe-delimited tables missing the markdown separator row
                                  let text = msg.content.replace(/PicoBot/g, botName);
                                  const lines = text.split('\n');
                                  const processed: string[] = [];
                                  for (let i = 0; i < lines.length; i++) {
                                    const line = lines[i].trim();
                                    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
                                    processed.push(lines[i]);
                                    // If this line looks like a pipe-delimited header row and the next line is NOT a separator
                                    if (line.startsWith('|') && line.endsWith('|') && line.split('|').filter(Boolean).length >= 2) {
                                      const isSeparator = (l: string) => /^\|[\s\-:|]+\|$/.test(l);
                                      if (!isSeparator(nextLine) && nextLine.startsWith('|') && nextLine.endsWith('|')) {
                                        // Check if any previous line was already a separator for this table
                                        const prevLine = i > 0 ? processed[processed.length - 2]?.trim() : '';
                                        if (!isSeparator(prevLine)) {
                                          const colCount = line.split('|').filter(Boolean).length;
                                          processed.push('| ' + Array(colCount).fill('---').join(' | ') + ' |');
                                        }
                                      }
                                    }
                                  }
                                  return processed.join('\n');
                                })()}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            msg.content.replace(/PicoBot/g, botName)
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Loading indicator */}
                    {isLoading && (
                      <div className="message ai">
                        <div className="message-avatar">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" style={{ color: 'var(--text-secondary)' }}>
                            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="message-bubble flex items-center gap-2 h-[36px]">
                          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--text-tertiary)', animationDelay: '0s' }}></span>
                          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--text-tertiary)', animationDelay: '0.15s' }}></span>
                          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--text-tertiary)', animationDelay: '0.3s' }}></span>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} className="h-4" />
                  </div>
                </div>

                {/* Input */}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: '0 0 28px 0',
                  background: 'linear-gradient(to top, #000 50%, transparent)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  pointerEvents: 'none',
                }}>
                  <div style={{
                    pointerEvents: 'auto',
                    maxWidth: '700px',
                    width: '88%',
                    borderRadius: '20px',
                    background: '#1a1a1a',
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: '0 0 0 0.5px rgba(255,255,255,0.04) inset, 0 16px 50px rgba(0,0,0,0.45)',
                    display: 'flex',
                    flexDirection: 'column',
                  }}>
                    {/* Row 1: Textarea */}
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`Message ${botName}...`}
                      rows={1}
                      disabled={isLoading}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: 'rgba(255,255,255,0.92)',
                        fontFamily: 'inherit',
                        fontSize: '14.5px',
                        letterSpacing: '-0.005em',
                        resize: 'none',
                        minHeight: '24px',
                        maxHeight: '180px',
                        padding: '16px 20px 10px 20px',
                        width: '100%',
                        lineHeight: '1.6',
                      }}
                    />
                    {/* Row 2: Toolbar */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 12px 10px 12px',
                      gap: '4px',
                    }}>
                      {/* Tools button with popup */}
                      <div ref={toolsMenuRef} style={{ position: 'relative' }}>
                        <button
                          onClick={() => setShowToolsMenu(v => !v)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '7px 12px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: showToolsMenu ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: 'rgba(255,255,255,0.65)',
                            fontSize: '13px',
                            fontFamily: 'inherit',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            letterSpacing: '-0.01em',
                          }}
                          onMouseEnter={e => { if (!showToolsMenu) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'; }}
                          onMouseLeave={e => { if (!showToolsMenu) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                        >
                          {/* Sliders icon */}
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z" />
                          </svg>
                          Tools
                        </button>

                        {/* Popup menu */}
                        {showToolsMenu && (
                          <div style={{
                            position: 'absolute',
                            bottom: 'calc(100% + 8px)',
                            left: 0,
                            background: '#1e1e1e',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '12px',
                            padding: '6px',
                            minWidth: '180px',
                            boxShadow: '0 8px 30px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.04) inset',
                            zIndex: 50,
                          }}>
                            <button
                              onClick={() => {
                                setShowToolsMenu(false);
                                // Open canvas with an empty placeholder artifact
                                setActiveArtifact({
                                  id: 'canvas-empty',
                                  type: 'code',
                                  title: 'Canvas',
                                  language: 'text',
                                  content: '',
                                });
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: 'none',
                                background: 'transparent',
                                color: 'rgba(255,255,255,0.85)',
                                fontSize: '13.5px',
                                fontFamily: 'inherit',
                                fontWeight: 400,
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'background 0.12s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 15, height: 15, opacity: 0.7, flexShrink: 0 }}>
                                <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v11.5A2.25 2.25 0 004.25 18h11.5A2.25 2.25 0 0018 15.75V4.25A2.25 2.25 0 0015.75 2H4.25zm4.03 6.28a.75.75 0 00-1.06-1.06L4.97 9.47a.75.75 0 000 1.06l2.25 2.25a.75.75 0 001.06-1.06L6.56 10l1.72-1.72zm4.5-1.06a.75.75 0 10-1.06 1.06L13.44 10l-1.72 1.72a.75.75 0 101.06 1.06l2.25-2.25a.75.75 0 000-1.06l-2.25-2.25z" clipRule="evenodd" />
                              </svg>
                              Open Canvas
                            </button>
                            <button
                              onClick={() => {
                                setShowToolsMenu(false);
                                setShowSettings(true);
                                setActiveArtifact(null);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: 'none',
                                background: 'transparent',
                                color: 'rgba(255,255,255,0.85)',
                                fontSize: '13.5px',
                                fontFamily: 'inherit',
                                fontWeight: 400,
                                cursor: 'pointer',
                                textAlign: 'left' as const,
                                transition: 'background 0.12s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 15, height: 15, opacity: 0.7, flexShrink: 0 }}>
                                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                              </svg>
                              Settings
                            </button>
                            <button
                              onClick={() => {
                                setShowToolsMenu(false);
                                setShowWorkspace(true);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: 'none',
                                background: 'transparent',
                                color: 'rgba(255,255,255,0.85)',
                                fontSize: '13.5px',
                                fontFamily: 'inherit',
                                fontWeight: 400,
                                cursor: 'pointer',
                                textAlign: 'left' as const,
                                transition: 'background 0.12s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <span style={{ fontSize: '14px', flexShrink: 0, opacity: 0.7 }}>📂</span>
                              Workspace
                            </button>
                            {/* Utilities submenu */}
                            <div
                              style={{ position: 'relative' }}
                              onMouseEnter={(e) => {
                                const sub = e.currentTarget.querySelector('[data-submenu]') as HTMLElement;
                                if (sub) sub.style.display = 'block';
                                (e.currentTarget.firstElementChild as HTMLElement).style.background = 'rgba(255,255,255,0.07)';
                              }}
                              onMouseLeave={(e) => {
                                const sub = e.currentTarget.querySelector('[data-submenu]') as HTMLElement;
                                if (sub) sub.style.display = 'none';
                                (e.currentTarget.firstElementChild as HTMLElement).style.background = 'transparent';
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                  width: '100%',
                                  padding: '9px 12px',
                                  borderRadius: '8px',
                                  background: 'transparent',
                                  color: 'rgba(255,255,255,0.85)',
                                  fontSize: '13.5px',
                                  fontWeight: 400,
                                  cursor: 'pointer',
                                  transition: 'background 0.12s',
                                }}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 15, height: 15, opacity: 0.7, flexShrink: 0 }}>
                                  <path d="M2 4.25A2.25 2.25 0 014.25 2h2.5A2.25 2.25 0 019 4.25v2.5A2.25 2.25 0 016.75 9h-2.5A2.25 2.25 0 012 6.75v-2.5zM2 13.25A2.25 2.25 0 014.25 11h2.5A2.25 2.25 0 019 13.25v2.5A2.25 2.25 0 016.75 18h-2.5A2.25 2.25 0 012 15.75v-2.5zM11 4.25A2.25 2.25 0 0113.25 2h2.5A2.25 2.25 0 0118 4.25v2.5A2.25 2.25 0 0115.75 9h-2.5A2.25 2.25 0 0111 6.75v-2.5zM11 13.25A2.25 2.25 0 0113.25 11h2.5A2.25 2.25 0 0118 13.25v2.5A2.25 2.25 0 0115.75 18h-2.5A2.25 2.25 0 0111 15.75v-2.5z" />
                                </svg>
                                Utilities
                                <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.4 }}>▶</span>
                              </div>
                              {/* Submenu */}
                              <div
                                data-submenu
                                style={{
                                  display: 'none',
                                  position: 'absolute',
                                  left: 'calc(100% + 6px)',
                                  top: '0',
                                  background: '#1e1e1e',
                                  border: '1px solid rgba(255,255,255,0.12)',
                                  borderRadius: '10px',
                                  padding: '5px',
                                  minWidth: '160px',
                                  boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                                  zIndex: 51,
                                }}
                              >
                                <button
                                  onClick={() => { setShowToolsMenu(false); setShowMemory(true); }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                                    padding: '9px 12px', borderRadius: '7px', border: 'none',
                                    background: 'transparent', color: 'rgba(255,255,255,0.85)',
                                    fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer',
                                    textAlign: 'left' as const, transition: 'background 0.12s',
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                  <span style={{ fontSize: '13px', flexShrink: 0 }}>🧠</span>
                                  Memory
                                </button>
                                <button
                                  onClick={() => { setShowToolsMenu(false); setShowTasks(true); }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                                    padding: '9px 12px', borderRadius: '7px', border: 'none',
                                    background: 'transparent', color: 'rgba(255,255,255,0.85)',
                                    fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer',
                                    textAlign: 'left' as const, transition: 'background 0.12s',
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                  <span style={{ fontSize: '13px', flexShrink: 0 }}>📋</span>
                                  Tasks
                                </button>
                                <button
                                  onClick={() => { setShowToolsMenu(false); setShowNotes(true); }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                                    padding: '9px 12px', borderRadius: '7px', border: 'none',
                                    background: 'transparent', color: 'rgba(255,255,255,0.85)',
                                    fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer',
                                    textAlign: 'left' as const, transition: 'background 0.12s',
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                  <span style={{ fontSize: '13px', flexShrink: 0 }}>📝</span>
                                  Notes
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Spacer */}
                      <div style={{ flex: 1 }} />

                      {/* Mic button */}
                      <button
                        onClick={toggleSpeechRecognition}
                        title={isListening ? 'Stop recording' : 'Voice input'}
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: isListening ? 'rgba(239,68,68,0.15)' : 'transparent',
                          color: isListening ? '#f87171' : 'rgba(255,255,255,0.45)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: isListening ? '2px solid rgba(239,68,68,0.4)' : '1px solid transparent',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          flexShrink: 0,
                          animation: isListening ? 'pulse-mic 1.5s ease-in-out infinite' : 'none',
                        }}
                        onMouseEnter={e => { if (!isListening) { e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; } }}
                        onMouseLeave={e => { if (!isListening) { e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; e.currentTarget.style.background = 'transparent'; } }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 16, height: 16 }}>
                          <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4z" />
                          <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-1.5v-1.546A6.001 6.001 0 0016 10v-.357a.75.75 0 00-1.5 0V10a4.5 4.5 0 01-9 0v-.357z" />
                        </svg>
                      </button>
                      <button
                        onClick={sendMessage}
                        disabled={!input.trim() || isLoading}
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: (!input.trim() || isLoading) ? 'rgba(255,255,255,0.1)' : '#0a84ff',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: 'none',
                          cursor: (!input.trim() || isLoading) ? 'not-allowed' : 'pointer',
                          flexShrink: 0,
                          transition: 'all 0.2s ease',
                          boxShadow: (!input.trim() || isLoading) ? 'none' : '0 2px 10px rgba(10,132,255,0.3)',
                          opacity: (!input.trim() || isLoading) ? 0.4 : 1,
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 16, height: 16 }}>
                          <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

              </div>

              <ArtifactPanel
                artifact={activeArtifact}
                isOpen={!!activeArtifact}
                onClose={() => setActiveArtifact(null)}
              />
            </div>
          )}
        </div>
      </div>

      <WorkspaceModal
        isOpen={showWorkspace}
        onClose={() => setShowWorkspace(false)}
        onOpenFile={(content, title, language) => {
          setActiveArtifact({
            id: `workspace-${Date.now()}`,
            type: 'code',
            title,
            language,
            content,
          });
        }}
      />

      <MemoryModal
        isOpen={showMemory}
        onClose={() => setShowMemory(false)}
        onOpenFile={(content, title, language) => {
          setActiveArtifact({
            id: `memory-${Date.now()}`,
            type: 'code',
            title,
            language,
            content,
          });
        }}
      />

      <TasksModal
        isOpen={showTasks}
        onClose={() => setShowTasks(false)}
      />

      <NotesModal
        isOpen={showNotes}
        onClose={() => setShowNotes(false)}
      />
    </>
  );
}
