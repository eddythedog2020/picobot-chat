import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
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

        const skillFolders = fs.readdirSync(skillsDir, { withFileTypes: true })
            .filter(d => d.isDirectory());

        const skills: { name: string; description: string; path: string }[] = [];

        for (const folder of skillFolders) {
            const skillFile = path.join(skillsDir, folder.name, 'SKILL.md');
            if (!fs.existsSync(skillFile)) continue;

            const content = fs.readFileSync(skillFile, 'utf-8');
            // Extract YAML frontmatter
            const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
            if (!fmMatch) continue;

            const fm = fmMatch[1];
            const nameMatch = fm.match(/name:\s*(.+)/);
            const descMatch = fm.match(/description:\s*(.+)/);

            if (nameMatch && descMatch) {
                skills.push({
                    name: nameMatch[1].trim(),
                    description: descMatch[1].trim(),
                    path: skillFile,
                });
            }
        }

        if (skills.length === 0) return '';

        let summary = '\n\n(System Note: AVAILABLE SKILLS — You have access to the following skills. IMPORTANT: When a user request matches a skill, you MUST read the SKILL.md file at the path shown and follow its "Complete Example" section EXACTLY. Do NOT improvise your own approach — the skill exists because the obvious approach has known pitfalls.\n';
        for (const s of skills) {
            summary += `- ${s.name}: ${s.description} [${s.path}]\n`;
        }
        summary += 'When creating new skills, use the skill-builder skill for the correct format.)';
        return summary;
    } catch {
        return '';
    }
}


export async function POST(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    let body;
    try {
        body = await req.json();
    } catch (e) {
        return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
    }
    const { message, history, compactedSummary, memories } = body;

    // This block seems to be an attempt to add task-related logic,
    // but it's incomplete and would cause syntax errors if inserted directly.
    // Assuming the intent was to add a new handler or conditional logic for a different payload.
    // For now, I'm commenting it out to maintain the original file's functionality and syntax.
    // If this was intended for a different route or a specific conditional flow,
    // please provide more context or a complete, syntactically correct block.

    // const { text, title, category } = body;
    // const taskText = text || title;
    // if (!taskText) return NextResponse.json({ error: "text or title is required" }, { status: 400 });

    // const tasks = readTasks(); // readTasks is not defined
    // const newTask: Task = { // Task is not defined
    //     id: Math.random().toString(36).slice(2, 10),
    //     text: taskText,
    //     done: false,
    //     created: new Date().toISOString(),
    //     category: category || "general",
    // };

    if (!message) {
        return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Build persistent memories context
    let memoriesContext = '';
    if (memories) {
        memoriesContext = `(System Note: The following are persistent user memories/preferences. Always keep these in mind when responding.)\n${memories}\n\n`;
    }

    // Build conversation context from compacted summary or history
    let conversationContext = memoriesContext;
    if (compactedSummary) {
        // Use the compacted summary as primary context
        conversationContext += `(System Note: The following is a compacted summary of the earlier conversation. Use it to maintain continuity and understand references to earlier discussions.)\n\n${compactedSummary}\n\n`;
        // Also append any recent post-compaction messages
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

    // Read settings from SQLite (these are the user's preferred provider settings)
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

    // Append instructions for Canvas
    let promptSuffix = "\n\n(System Note: If you write or modify any code, scripts, or files to fulfill this request, you MUST output the complete code in a markdown fenced code block in your final response. This is required so the Web UI can display the code in the Canvas panel.)";

    // If the LLM has native search, tell EddyTheBot to prefer it
    if (effectiveSearch) {
        promptSuffix += `\n\n(System Note: Your LLM provider (${detected.provider}) has built-in web search / grounding capabilities. When you need current information, real-time data, or need to look something up, prefer using your built-in search capability directly instead of the browser tool — it is significantly faster and more reliable.)`;
    }

    // Always cite sources for news and factual claims
    promptSuffix += `\n\n(System Note: Whenever you reference news articles, current events, statistics, or factual claims that come from external sources, you MUST cite your sources. Include the publication name and URL where possible. Format citations clearly at the end of your response, e.g. "Source: [Publication Name](URL)". Never present news or factual information without attribution.)`;

    if (settings?.allowCodeExecution) {
        const workspaceDir = WORKSPACE_DIR.replace(/\\/g, '\\\\');
        promptSuffix += `\n\n` + getCodeExecutionPrompt(workspaceDir);
    }

    // Auto-inject available skill summaries so the LLM knows what skills exist
    promptSuffix += loadSkillSummaries();

    const fullMessage = conversationContext + message + promptSuffix;

    // Build the API URL
    let apiBase = settings?.apiBaseUrl || 'http://localhost:11434/v1';
    apiBase = apiBase.replace(/\/+$/, '');
    if (!apiBase.endsWith('/chat/completions')) {
        apiBase = apiBase + '/chat/completions';
    }

    const apiKey = settings?.apiKey || 'picobot-local';
    const model = settings?.defaultModel || 'llama3';

    // Build system prompt
    let systemPrompt = "You are a helpful AI assistant.";
    systemPrompt += promptSuffix;

    // Get MCP tools if available
    let mcpTools: any[] = [];
    try {
        await mcpManager.initialize(); // Ensure servers from DB are connected
        mcpTools = mcpManager.getToolsForLLM();
        if (mcpTools.length > 0) {
            console.log(`[MCP] ${mcpTools.length} tools available for LLM:`);
            mcpTools.forEach((t: any) => console.log(`  - ${t.function.name}: ${t.function.description?.substring(0, 100)}`));
            // Add MCP tool awareness to system prompt
            const toolNames = mcpTools.map((t: any) => t.function.name).join(', ');
            systemPrompt += `\n\n(System Note: MCP TOOLS AVAILABLE — You have access to external tools via the Model Context Protocol. When a user request can be fulfilled by one of these tools, you MUST use the tool instead of writing code. Available tools: ${toolNames}. To use a tool, respond with a tool_call. PREFER MCP tools over code execution when the tool matches the task.)`;
        }
    } catch (e) {
        console.error('[MCP] Failed to get tools:', e);
    }

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: fullMessage },
    ];

    try {
        // Build API request body
        const requestBody: Record<string, unknown> = {
            model,
            messages,
            stream: false,
        };

        // Add tools if available
        if (mcpTools.length > 0) {
            requestBody.tools = mcpTools;
        }

        const apiResponse = await fetch(apiBase, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            console.error(`[MCP] API call failed (${apiResponse.status}):`, errorText);
            return NextResponse.json({ response: `⚠️ API Error (${apiResponse.status}): ${errorText}` });
        }

        const data = await apiResponse.json();
        const firstChoice = data.choices?.[0];
        let response: string = '';

        // Multi-round tool-calling loop
        // The LLM may need multiple tool calls (e.g. create project → deploy site)
        const MAX_TOOL_ROUNDS = 5;
        let currentMessages = [...messages];
        let currentData = data;
        let currentChoice = firstChoice;

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const toolCalls = currentChoice?.message?.tool_calls;
            if (!toolCalls || toolCalls.length === 0) {
                // No more tool calls — extract the text response
                response = currentChoice?.message?.content || '';
                break;
            }

            console.log(`[MCP] Round ${round + 1}: LLM requested ${toolCalls.length} tool call(s):`, toolCalls.map((tc: any) => tc.function.name));

            // Execute all tool calls
            const toolResults: { role: string; tool_call_id: string; content: string }[] = [];
            for (const toolCall of toolCalls) {
                const toolName = toolCall.function.name;
                let toolArgs: Record<string, unknown> = {};
                try {
                    toolArgs = JSON.parse(toolCall.function.arguments || '{}');
                } catch {
                    toolArgs = {};
                }

                console.log(`[MCP] Executing tool: ${toolName}`, toolArgs);
                try {
                    const result = await mcpManager.callTool(toolName, toolArgs);
                    const resultText = typeof result === 'string' ? result : JSON.stringify(result);
                    console.log(`[MCP] Tool ${toolName} result (${resultText.length} chars): ${resultText.substring(0, 200)}`);
                    toolResults.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: resultText,
                    });
                } catch (toolErr: any) {
                    console.error(`[MCP] Tool ${toolName} failed:`, toolErr);
                    toolResults.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: `Error executing tool: ${toolErr.message}`,
                    });
                }
            }

            // Build follow-up messages including tool results
            currentMessages = [
                ...currentMessages,
                currentChoice.message, // Include the assistant's tool_calls message
                ...toolResults,
            ];

            console.log(`[MCP] Making follow-up API call (round ${round + 1}) with tool results`);

            // Follow-up call WITH tools so the LLM can make more tool calls if needed
            const followUpResponse = await fetch(apiBase, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages: currentMessages,
                    tools: mcpTools.length > 0 ? mcpTools : undefined,
                    stream: false,
                }),
            });

            if (followUpResponse.ok) {
                currentData = await followUpResponse.json();
                currentChoice = currentData.choices?.[0];
                response = currentChoice?.message?.content || '';
                console.log(`[MCP] Follow-up response: content=${response.length} chars, tool_calls=${currentChoice?.message?.tool_calls?.length || 0}`);
                // Loop continues — if there are more tool_calls, they'll be handled in the next iteration
            } else {
                const errText = await followUpResponse.text();
                console.error('[MCP] Follow-up call failed (status ' + followUpResponse.status + '):', errText.substring(0, 500));
                // Try simplified fallback (for Gemini compatibility)
                const toolResultsText = toolResults.map(r => r.content).join('\n\n');
                const simplifiedMessages = [
                    ...messages,
                    {
                        role: 'user',
                        content: `I called the following MCP tools on your behalf and got these results. Please summarize the results for me in a clear, helpful way:\n\nTools called: ${toolCalls.map((tc: any) => tc.function.name).join(', ')}\n\nResults:\n${toolResultsText}`,
                    },
                ];

                const fallbackResponse = await fetch(apiBase, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model,
                        messages: simplifiedMessages,
                        stream: false,
                    }),
                });

                if (fallbackResponse.ok) {
                    const fallbackData = await fallbackResponse.json();
                    response = fallbackData.choices?.[0]?.message?.content || '';
                    console.log('[MCP] Fallback response content length:', response.length);
                }

                if (!response) {
                    response = `MCP tool results:\n\n${toolResultsText}`;
                }
                break; // Exit loop on error
            }
        }

        // If no response was generated after all rounds, provide a fallback
        if (!response) {
            response = currentChoice?.message?.content || 'No response from API';
        }

        // PERSISTENCE FOR AUTOMATED TESTS: 
        // If this is a direct API call (likely from a test suite), ensure the interaction is recorded
        try {
            const chatId = body.chatId || `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const chatExists = db.prepare('SELECT id FROM chats WHERE id = ?').get(chatId);

            if (!chatExists) {
                db.prepare('INSERT INTO chats (id, title, updatedAt) VALUES (?, ?, ?)').run(
                    chatId,
                    message.substring(0, 100),
                    Date.now()
                );
            } else {
                db.prepare('UPDATE chats SET updatedAt = ? WHERE id = ?').run(Date.now(), chatId);
            }

            db.prepare('INSERT INTO messages (id, chatId, role, content, timestamp) VALUES (?, ?, ?, ?, ?)').run(
                Date.now().toString(), chatId, 'user', message, Date.now()
            );
            db.prepare('INSERT INTO messages (id, chatId, role, content, timestamp) VALUES (?, ?, ?, ?, ?)').run(
                (Date.now() + 1).toString(), chatId, 'ai', response, Date.now() + 1
            );
        } catch (dbErr) {
            console.error("Failed to persist test interaction:", dbErr);
        }

        return NextResponse.json({ response });
    } catch (e: any) {
        return NextResponse.json({ response: `⚠️ Failed to reach AI: ${e.message}` });
    }
}
