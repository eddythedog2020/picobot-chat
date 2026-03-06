import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import db from "@/lib/db";
import { validateAuth } from "@/lib/authMiddleware";

export async function POST(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    // Check if code execution is enabled
    const settings = db.prepare('SELECT allowCodeExecution FROM settings WHERE id = 1').get() as { allowCodeExecution?: number } | undefined;
    if (!settings?.allowCodeExecution) {
        return NextResponse.json({ error: "Code execution is disabled in settings" }, { status: 403 });
    }

    const { code, language } = await req.json();

    if (!code) {
        return NextResponse.json({ error: "No code provided" }, { status: 400 });
    }

    if (language !== "python") {
        return NextResponse.json({ error: "Only Python execution is supported" }, { status: 400 });
    }

    // Write code to a temp file
    const tmpFile = path.join(tmpdir(), `picobot_exec_${Date.now()}.py`);

    try {
        writeFileSync(tmpFile, code, "utf-8");

        // Execute with a 120-second timeout
        const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
            const pythonCmd = process.platform === "win32" ? "python" : "python3";
            const child = execFile(pythonCmd, [tmpFile], {
                timeout: 120000,
                maxBuffer: 1024 * 1024, // 1MB output limit
                windowsHide: true,
                env: { ...process.env, PYTHONIOENCODING: "utf-8" },
            }, (error, stdout, stderr) => {
                let exitCode = 0;
                let stderrStr = stderr?.toString() || "";
                if (error) {
                    exitCode = (error as any).code || 1;
                    // Capture timeout/killed info
                    if ((error as any).killed) {
                        stderrStr += `\n[Process was killed - likely timeout after 120s]`;
                    }
                    if ((error as any).signal) {
                        stderrStr += `\n[Signal: ${(error as any).signal}]`;
                    }
                    if (error.message && !stderrStr.includes(error.message)) {
                        stderrStr += `\n[Error: ${error.message}]`;
                    }
                }
                resolve({
                    stdout: stdout?.toString() || "",
                    stderr: stderrStr,
                    exitCode,
                });
            });
        });

        return NextResponse.json(result);
    } catch (err: any) {
        return NextResponse.json({
            stdout: "",
            stderr: `Execution error: ${err.message}`,
            exitCode: 1,
        });
    } finally {
        // Clean up temp file
        try { unlinkSync(tmpFile); } catch { /* ignore */ }
    }
}
