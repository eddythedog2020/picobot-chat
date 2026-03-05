import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import db from "@/lib/db";
import { detectSearchCapability } from "@/lib/searchDetection";

// Load skill summaries from workspace skills directory
function loadSkillSummaries(): string {
    try {
        const skillsDir = path.join(os.homedir(), '.picobot', 'workspace', 'skills');
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
const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
    const { message, history, compactedSummary, memories } = await req.json();

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

    // If the LLM has native search, tell PicoBot to prefer it
    if (effectiveSearch) {
        promptSuffix += `\n\n(System Note: Your LLM provider (${detected.provider}) has built-in web search / grounding capabilities. When you need current information, real-time data, or need to look something up, prefer using your built-in search capability directly instead of the browser tool — it is significantly faster and more reliable.)`;
    }

    // Always cite sources for news and factual claims
    promptSuffix += `\n\n(System Note: Whenever you reference news articles, current events, statistics, or factual claims that come from external sources, you MUST cite your sources. Include the publication name and URL where possible. Format citations clearly at the end of your response, e.g. "Source: [Publication Name](URL)". Never present news or factual information without attribution.)`;

    if (settings?.allowCodeExecution) {
        const workspaceDir = path.join(os.homedir(), '.picobot', 'workspace').replace(/\\/g, '\\\\');
        promptSuffix += `\n\n(System Note: CODE EXECUTION IS ENABLED. You can execute Python code on the user's local Windows machine. When you need to perform tasks like file operations, system commands, data processing, or any task that requires running code, wrap your Python code in a fenced code block with the language tag \"python:run\" like this:\n\n\`\`\`python:run\nprint(\"Hello from the user's machine!\")\n\`\`\`\n\nThe code will be automatically executed and you will receive the output. The user's OS is Windows.\n\nIMPORTANT RESPONSE ORDERING: When using code execution, ALWAYS structure your response in this exact order:\n1. First, briefly explain what you are going to do in plain text.\n2. LAST, place the python:run code block at the very END of your response.\nNever put the code block before your explanation. The code output and interpretation will appear after the code block automatically.\n\nPROJECT FILE LOCATION — MANDATORY:\nWhen creating project files, websites, scripts, or any user-generated content, you MUST save them inside the workspace directory: ${workspaceDir}\nUse a subfolder named project-YYYYMMDD-HHMMSS-<short-description> (e.g. project-20260306-041639-cat-website).\nNEVER create project files in the current working directory, TEMP, or the application folder.\n\nDEPLOYMENT — IMPORTANT:\nDo NOT deploy to Netlify or any hosting service unless the user EXPLICITLY asks you to deploy. If the user just asks to \"create a site\" or \"build a website\", create the files locally in the workspace directory and tell them where the files are. Only deploy when the user says words like \"deploy\", \"publish\", \"host\", \"put it online\", or \"make it live\".\n\nNETLIFY DEPLOYMENT — RULES (ONLY when user explicitly requests deployment):\nWhen deploying a static site to Netlify, you MUST use this EXACT Python template. Do NOT deviate. Do NOT change ANY variable names, regex patterns, or logic:\n\nimport os, subprocess, shutil, re, time\ndeploy_dir = os.path.join(os.environ.get(\"TEMP\", \"C:\\\\\\\\temp\"), \"netlify-deploys\")\nos.makedirs(deploy_dir, exist_ok=True)\nproject_dir = os.path.join(deploy_dir, \"<project-name>\")\nif os.path.exists(project_dir):\n    shutil.rmtree(project_dir)\nos.makedirs(project_dir, exist_ok=True)\nwith open(os.path.join(project_dir, \"index.html\"), \"w\", encoding=\"utf-8\") as f:\n    f.write(\"<your html>\")\nwith open(os.path.join(project_dir, \"netlify.toml\"), \"w\") as f:\n    f.write('[build]\\\\\\\\n  command = \"echo skip\"\\\\\\\\n  publish = \".\"\\\\\\\\n')\nos.chdir(project_dir)\nsite_name = f\"picobot-{int(time.time())}\"\ncreate = subprocess.run([\"netlify\", \"sites:create\", \"--name\", site_name], input=\"\\\\\\\\n\", capture_output=True, text=True, shell=True, encoding=\"utf-8\", errors=\"replace\", timeout=90)\nclean = re.sub(r'\\\\\\\\x1b\\\\\\\\[[0-9;]*[a-zA-Z]', '', create.stdout)\nsite_id_match = re.search(r'(?:Project|Site) ID:\\\\\\\\s*([a-f0-9-]+)', clean)\nif site_id_match:\n    site_id = site_id_match.group(1)\n    print(f\"Created site: {site_name}.netlify.app (ID: {site_id})\")\n    result = subprocess.run([\"netlify\", \"deploy\", \"--prod\", \"--dir\", \".\", \"--site\", site_id], capture_output=True, text=True, shell=True, encoding=\"utf-8\", errors=\"replace\")\n    print(result.stdout)\n    if result.stderr:\n        print(\"Errors:\", result.stderr)\nelse:\n    print(\"Failed to parse site ID. Raw output:\", clean)\n\nCRITICAL NETLIFY RULES:\n1. ALWAYS use TEMP directory for Netlify deploys, NEVER create inside the workspace or any Node.js project.\n2. You MUST strip ANSI codes with re.sub before regex matching — the CLI output contains escape codes.\n3. Use the EXACT regex r'(?:Project|Site) ID:\\\\\\\\s*([a-f0-9-]+)' — do NOT change it.\n4. Do NOT rename variables or change the logic flow.)`;
    }

    // Auto-inject available skill summaries so the LLM knows what skills exist
    promptSuffix += loadSkillSummaries();

    const fullMessage = conversationContext + message + promptSuffix;




    // Resolve binary path
    const ext = process.platform === "win32" ? ".exe" : "";
    const binPath = path.join(process.cwd(), "bin", `picobot${ext}`);

    // Build args — use -M flag to override model per-request
    const args = ["agent", "-m", fullMessage];
    if (settings?.defaultModel) {
        args.push("-M", settings.defaultModel);
    }

    // Override the provider via environment variables so the chat uses
    // the SQLite settings (e.g. OpenRouter) while PicoBot's config.json
    // can stay pointed at the local Ollama for gateway/heartbeat use.
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (settings) {
        if (settings.apiKey) env.OPENAI_API_KEY = settings.apiKey;
        if (settings.apiBaseUrl) env.OPENAI_API_BASE = settings.apiBaseUrl;
    }

    try {
        const { stdout, stderr } = await execFileAsync(binPath, args, {
            env,
            timeout: 120000, // 2 min timeout
        });

        const response = (stdout || stderr).trim();
        return NextResponse.json({ response });
    } catch (e: any) {
        const fallback = e.stdout || e.stderr || e.message || "PicoBot error";
        return NextResponse.json({ response: fallback });
    }
}
