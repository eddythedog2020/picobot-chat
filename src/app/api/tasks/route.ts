import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { validateAuth } from "@/lib/authMiddleware";
import { WORKSPACE_DIR } from "@/lib/paths";

export const dynamic = 'force-dynamic';

const TASKS_PATH = path.join(WORKSPACE_DIR, "TASKS.md");

type Task = {
    id: string;
    text: string;
    done: boolean;
    created: string;
    category: string;
};

function readTasks(): Task[] {
    if (!fs.existsSync(TASKS_PATH)) return [];
    const content = fs.readFileSync(TASKS_PATH, "utf-8");
    const tasks: Task[] = [];
    for (const line of content.split("\n")) {
        const m = line.match(/^- \[([ x])\] (.+)/);
        if (!m) continue;
        // Parse metadata from line: text |id:xxx|created:xxx|cat:xxx
        const raw = m[2];
        const idMatch = raw.match(/\|id:([^|]+)/);
        const createdMatch = raw.match(/\|created:([^|]+)/);
        const catMatch = raw.match(/\|cat:([^|]+)/);
        const text = raw.replace(/\|id:[^|]+/g, "").replace(/\|created:[^|]+/g, "").replace(/\|cat:[^|]+/g, "").replace(/\|$/g, "").trim();
        tasks.push({
            id: idMatch ? idMatch[1] : Math.random().toString(36).slice(2, 10),
            text,
            done: m[1] === "x",
            created: createdMatch ? createdMatch[1] : new Date().toISOString(),
            category: catMatch ? catMatch[1] : "general",
        });
    }
    return tasks;
}

function writeTasks(tasks: Task[]) {
    const dir = path.dirname(TASKS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const lines = tasks.map((t) => {
        const check = t.done ? "x" : " ";
        return `- [${check}] ${t.text} |id:${t.id}|created:${t.created}|cat:${t.category}|`;
    });

    const header = "# Tasks\n\n";
    fs.writeFileSync(TASKS_PATH, header + lines.join("\n") + "\n", "utf-8");
}

export async function GET(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    try {
        const tasks = readTasks();
        return NextResponse.json({ tasks });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    try {
        let body;
        try {
            body = await req.json();
        } catch (e) {
            return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
        }

        const { text, title, category } = body;
        const taskText = text || title;
        if (!taskText) return NextResponse.json({ error: "text or title is required" }, { status: 400 });

        const tasks = readTasks();
        const newTask: Task = {
            id: Math.random().toString(36).slice(2, 10),
            text: taskText,
            done: false,
            created: new Date().toISOString(),
            category: category || "general",
        };
        tasks.push(newTask);
        writeTasks(tasks);
        return NextResponse.json({ success: true, task: newTask });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");
        if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

        const tasks = readTasks();
        const filtered = tasks.filter((t) => t.id !== id);
        writeTasks(filtered);
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    try {
        const body = await req.json();
        const { id, done } = body;
        if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

        const tasks = readTasks();
        const task = tasks.find((t) => t.id === id);
        if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });
        task.done = done;
        writeTasks(tasks);
        return NextResponse.json({ success: true, task });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
