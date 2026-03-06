import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { detectSearchCapability } from "@/lib/searchDetection";
import { validateAuth } from "@/lib/authMiddleware";

export async function POST(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    const { message, images, history, compactedSummary, memories } = await req.json();

    if (!message && (!images || images.length === 0)) {
        return NextResponse.json({ error: "Message or images required" }, { status: 400 });
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
        conversationContext += `(System Note: Here is the conversation history for context.)\n\n${contextLines.join('\n\n')}\n\n---\nCurrent message:\n`;
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
    let systemPrompt = "You are a helpful AI assistant with vision capabilities. You can analyze images shared by the user.";
    systemPrompt += "\n\n(System Note: If you write or modify any code, scripts, or files to fulfill this request, you MUST output the complete code in a markdown fenced code block in your final response.)";

    if (effectiveSearch) {
        systemPrompt += `\n\n(System Note: Your LLM provider (${detected.provider}) has built-in web search / grounding capabilities. When you need current information, prefer using your built-in search capability directly.)`;
    }

    systemPrompt += `\n\n(System Note: Whenever you reference news articles, current events, statistics, or factual claims from external sources, you MUST cite your sources.)`;

    if (settings?.allowCodeExecution) {
        systemPrompt += `\n\n(System Note: CODE EXECUTION IS ENABLED. You can execute Python code on the user's local Windows machine. Wrap executable Python code in a fenced code block with the language tag \"python:run\". The code will be automatically executed and you will receive the output. The user's OS is Windows.)`;
    }

    // Build the user message content array (text + images)
    const userContent: any[] = [];

    // Add text content with conversation context
    const fullText = conversationContext + (message || 'What do you see in this image?');
    userContent.push({ type: 'text', text: fullText });

    // Add images as image_url entries
    if (images && Array.isArray(images)) {
        for (const imageDataUrl of images) {
            userContent.push({
                type: 'image_url',
                image_url: { url: imageDataUrl },
            });
        }
    }

    // Build the API URL
    let apiBase = settings?.apiBaseUrl || 'http://localhost:11434/v1';
    apiBase = apiBase.replace(/\/+$/, '');
    if (!apiBase.endsWith('/chat/completions')) {
        apiBase = apiBase + '/chat/completions';
    }

    const apiKey = settings?.apiKey || 'picobot-local';
    const model = settings?.defaultModel || 'llama3';

    try {
        const apiResponse = await fetch(apiBase, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent },
                ],
                max_tokens: 4096,
            }),
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            return NextResponse.json({ response: `⚠️ Vision API Error (${apiResponse.status}): ${errorText}` });
        }

        const result = await apiResponse.json();
        const response = result.choices?.[0]?.message?.content || 'No response from vision model.';
        return NextResponse.json({ response });
    } catch (err: any) {
        return NextResponse.json({ response: `⚠️ Vision API connection error: ${err.message}` });
    }
}
