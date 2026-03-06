import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import db from "@/lib/db";
import { detectSearchCapability } from "@/lib/searchDetection";
import { validateAuth } from "@/lib/authMiddleware";
import { getCodeExecutionPrompt } from "@/lib/codeExecutionPrompt";
import { WORKSPACE_DIR } from "@/lib/paths";
import mcpManager from "@/lib/mcpManager";

// Load skill summaries from workspace skills directory
function loadSkillSummaries(): string {
    try {
        const skillsDir = path.join(WORKSPACE_DIR, 'skills');
        if (!fs.existsSync(skillsDir)) return '';
        const skillFolders = fs.readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory());
        const skills: { name: string; description: string; path: string }[] = [];
        for (const folder of skillFolders) {
            const skillFile = path.join(skillsDir, folder.name, 'SKILL.md');
            if (!fs.existsSync(skillFile)) continue;
            const content = fs.readFileSync(skillFile, 'utf-8');
            const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
            if (!fmMatch) continue;
            const fm = fmMatch[1];
            const nameMatch = fm.match(/name:\s*(.+)/);
            const descMatch = fm.match(/description:\s*(.+)/);
            if (nameMatch && descMatch) {
                skills.push({ name: nameMatch[1].trim(), description: descMatch[1].trim(), path: skillFile });
            }
        }
        if (skills.length === 0) return '';
        let summary = '\n\n(System Note: AVAILABLE SKILLS — You have access to the following skills. IMPORTANT: When a user request matches a skill, you MUST read the SKILL.md file at the path shown and follow its "Complete Example" section EXACTLY. Do NOT improvise your own approach — the skill exists because the obvious approach has known pitfalls.\n';
        for (const s of skills) { summary += `- ${s.name}: ${s.description} [${s.path}]\n`; }
        summary += 'When creating new skills, use the skill-builder skill for the correct format.)';
        return summary;
    } catch { return ''; }
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });

    const { message, history, compactedSummary, memories } = await req.json();

    if (!message) {
        return new Response(JSON.stringify({ error: "Message is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Build persistent memories context
    let memoriesContext = '';
    if (memories) {
        memoriesContext = `(System Note: The following are persistent user memories/preferences. Always keep these in mind when responding.)\n${memories}\n\n`;
    }

    // Build conversation context from compacted summary or history
    let conversationContext = memoriesContext;
    if (compactedSummary) {
        conversationContext += `(System Note: The following is a compacted summary of the earlier conversation. Use it to maintain continuity and understand references to earlier discussions.)\n\n${compactedSummary}\n\n`;
        if (history && Array.isArray(history) && history.length > 0) {
            const contextLines = history.map((msg: { role: string; content: string }) => {
                const role = msg.role === 'user' ? 'User' : 'Assistant';
                const content = msg.role === 'ai' && msg.content.length > 800
                    ? msg.content.substring(0, 800) + '...[truncated]'
                    : msg.content;
                return `${role}: ${content}`;
            });
            conversationContext += `(Recent messages since compaction:)\n\n${contextLines.join('\n\n')}\n\n---\nCurrent message:\n`;
        } else {
            conversationContext += `---\nCurrent message:\n`;
        }
    } else if (history && Array.isArray(history) && history.length > 0) {
        const contextLines = history.map((msg: { role: string; content: string }) => {
            const role = msg.role === 'user' ? 'User' : 'Assistant';
            const content = msg.role === 'ai' && msg.content.length > 800
                ? msg.content.substring(0, 800) + '...[truncated]'
                : msg.content;
            return `${role}: ${content}`;
        });
        conversationContext += `(System Note: Here is the conversation history for context. Use this to understand references like "the data", "that table", etc.)\n\n${contextLines.join('\n\n')}\n\n---\nCurrent message:\n`;
    }

    // Read settings from SQLite
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as {
        apiBaseUrl: string;
        apiKey: string;
        defaultModel: string;
        preferLlmSearch?: number | null;
        allowCodeExecution?: number | null;
    } | undefined;

    // Detect search capability
    const detected = detectSearchCapability(
        settings?.apiBaseUrl || '',
        settings?.defaultModel || ''
    );
    const hasOverride = settings?.preferLlmSearch !== null && settings?.preferLlmSearch !== undefined;
    const effectiveSearch = hasOverride ? settings!.preferLlmSearch === 1 : detected.hasSearch;

    // Build system prompt
    let systemPrompt = "You are a helpful AI assistant.";
    systemPrompt += "\n\n(System Note: If you write or modify any code, scripts, or files to fulfill this request, you MUST output the complete code in a markdown fenced code block in your final response. This is required so the Web UI can display the code in the Canvas panel.)";

    if (effectiveSearch) {
        systemPrompt += `\n\n(System Note: Your LLM provider (${detected.provider}) has built-in web search / grounding capabilities. When you need current information, real-time data, or need to look something up, prefer using your built-in search capability directly instead of the browser tool — it is significantly faster and more reliable.)`;
    }

    systemPrompt += `\n\n(System Note: Whenever you reference news articles, current events, statistics, or factual claims that come from external sources, you MUST cite your sources. Include the publication name and URL where possible. Format citations clearly at the end of your response, e.g. "Source: [Publication Name](URL)". Never present news or factual information without attribution.)`;

    if (settings?.allowCodeExecution) {
        const workspaceDir = WORKSPACE_DIR.replace(/\\/g, '\\\\');
        systemPrompt += `\n\n` + getCodeExecutionPrompt(workspaceDir);
    }

    // Auto-inject available skill summaries
    systemPrompt += loadSkillSummaries();

    // Build the full user message with conversation context
    const fullUserMessage = conversationContext + message;

    // --- MCP Tool Integration ---
    // Initialize MCP servers (no-op if already done)
    await mcpManager.initialize();
    const mcpTools = mcpManager.getToolsForLLM();
    const hasMCPTools = mcpTools.length > 0;

    // If MCP tools are available, add a note to the system prompt
    if (hasMCPTools) {
        const toolNames = mcpTools.map(t => `- ${t.function.name}: ${t.function.description}`).join('\n');
        systemPrompt += `\n\n(System Note: You have access to the following MCP tools. Use them when they would help answer the user's question. Call tools by name with the required arguments.\nAvailable tools:\n${toolNames})`;
    }

    // Build the messages array
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: fullUserMessage },
    ];

    // Build the API URL — ensure it ends with /chat/completions
    let apiBase = settings?.apiBaseUrl || 'http://localhost:11434/v1';
    apiBase = apiBase.replace(/\/+$/, '');
    if (!apiBase.endsWith('/chat/completions')) {
        apiBase = apiBase + '/chat/completions';
    }
    const apiKey = settings?.apiKey || 'picobot-local';
    const model = settings?.defaultModel || 'llama3';

    try {
        // --- Tool-calling flow ---
        // If MCP tools are available, make a NON-streaming first call to check for tool calls.
        // If no tools, skip straight to streaming.
        if (hasMCPTools) {
            const firstCallBody: Record<string, unknown> = {
                model,
                messages,
                tools: mcpTools,
                stream: false,
            };

            const firstResponse = await fetch(apiBase, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(firstCallBody),
            });

            if (firstResponse.ok) {
                const firstResult = await firstResponse.json();
                const choice = firstResult.choices?.[0];
                const toolCalls = choice?.message?.tool_calls;

                if (toolCalls && toolCalls.length > 0) {
                    // Execute each tool call via MCPManager
                    const toolMessages: Array<{ role: string; content: string; tool_call_id?: string }> = [
                        ...messages,
                        choice.message, // Include the assistant's tool_calls message
                    ];

                    for (const tc of toolCalls) {
                        const toolName = tc.function?.name || '';
                        let toolArgs: Record<string, unknown> = {};
                        try {
                            toolArgs = JSON.parse(tc.function?.arguments || '{}');
                        } catch { /* use empty args */ }

                        console.log(`[MCP] Calling tool: ${toolName}`, toolArgs);
                        const toolResult = await mcpManager.callTool(toolName, toolArgs);
                        console.log(`[MCP] Tool result (${toolName}):`, toolResult.substring(0, 200));

                        toolMessages.push({
                            role: 'tool',
                            content: toolResult,
                            tool_call_id: tc.id,
                        });
                    }

                    // Second call — streaming — with tool results included
                    const secondResponse = await fetch(apiBase, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`,
                        },
                        body: JSON.stringify({
                            model,
                            messages: toolMessages,
                            stream: true,
                        }),
                    });

                    if (secondResponse.ok) {
                        return createStreamResponse(secondResponse);
                    } else {
                        const errorText = await secondResponse.text();
                        return createErrorStreamResponse(`API Error after tool call (${secondResponse.status}): ${errorText}`);
                    }
                } else {
                    // No tool calls — LLM responded directly
                    // Stream the text content back as if it were streamed
                    const content = choice?.message?.content || '';
                    return createTextStreamResponse(content);
                }
            }
            // If the first call failed (e.g., provider doesn't support tools),
            // fall through to the normal streaming path without tools
            console.log('[MCP] First call with tools failed, falling back to normal streaming');
        }

        // --- Normal streaming path (no MCP tools, or tool call failed) ---
        const apiResponse = await fetch(apiBase, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                stream: true,
            }),
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            return createErrorStreamResponse(`API Error (${apiResponse.status}): ${errorText}`);
        }

        return createStreamResponse(apiResponse);
    } catch (err: any) {
        return createErrorStreamResponse(`Connection error: ${err.message}`);
    }
}

// --- Helper functions ---

/** Create an SSE stream response from an upstream API streaming response */
function createStreamResponse(apiResponse: Response): Response {
    const encoder = new TextEncoder();
    const apiReader = apiResponse.body?.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
        async start(controller) {
            if (!apiReader) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "No response body" })}\n\n`));
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                return;
            }

            let buffer = '';
            try {
                while (true) {
                    const { done, value } = await apiReader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || !trimmed.startsWith('data: ')) continue;

                        const payload = trimmed.slice(6);
                        if (payload === '[DONE]') {
                            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                            controller.close();
                            return;
                        }

                        try {
                            const parsed = JSON.parse(payload);
                            const delta = parsed.choices?.[0]?.delta?.content;
                            if (delta) {
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: delta })}\n\n`));
                            }
                        } catch {
                            // Skip malformed JSON chunks
                        }
                    }
                }
            } catch (err: any) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message || "Stream error" })}\n\n`));
            }

            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
}

/** Create an SSE stream that sends a single text content (for non-streaming tool call responses) */
function createTextStreamResponse(content: string): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            // Send content in chunks to simulate streaming
            const chunkSize = 20;
            for (let i = 0; i < content.length; i += chunkSize) {
                const chunk = content.substring(i, i + chunkSize);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: chunk })}\n\n`));
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
}

/** Create an SSE stream that sends a single error message */
function createErrorStreamResponse(message: string): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: `⚠️ ${message}` })}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
}
