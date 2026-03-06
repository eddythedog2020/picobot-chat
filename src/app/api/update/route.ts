import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { validateAuth } from "@/lib/authMiddleware";

/**
 * POST /api/update
 * Pulls the latest code from the Git release repo and runs npm install.
 * Returns step-by-step output so the user can see what happened.
 */
export async function POST(req: NextRequest) {
    const authError = validateAuth(req);
    if (authError) return authError;

    const appDir = process.cwd();
    const steps: { step: string; success: boolean; output: string }[] = [];

    // Expand PATH for macOS/Linux where non-interactive shells lack full PATH
    const extraPaths = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
    const currentPath = process.env.PATH || '';
    const env = {
        ...process.env,
        PATH: extraPaths.filter(p => !currentPath.includes(p)).join(process.platform === 'win32' ? ';' : ':')
            + (currentPath ? (process.platform === 'win32' ? ';' : ':') + currentPath : ''),
    };

    try {
        // Step 1: git pull
        const pullResult = await runCommand("git pull", appDir, env);
        steps.push({
            step: "Pull latest code",
            success: pullResult.exitCode === 0,
            output: pullResult.output,
        });

        if (pullResult.exitCode !== 0) {
            return NextResponse.json({
                success: false,
                steps,
                message: `Failed to pull updates: ${pullResult.output.slice(-200)}`,
            });
        }

        // Check if anything actually changed
        const alreadyUpToDate = pullResult.output.includes("Already up to date");
        if (alreadyUpToDate) {
            return NextResponse.json({
                success: true,
                steps,
                message: "Already up to date — no new updates available.",
                needsRestart: false,
            });
        }

        // Step 2: npm install (in case dependencies changed)
        const installResult = await runCommand("npm install --prefer-offline", appDir, env);
        steps.push({
            step: "Install dependencies",
            success: installResult.exitCode === 0,
            output: installResult.output.slice(-500), // Last 500 chars to avoid huge output
        });

        return NextResponse.json({
            success: true,
            steps,
            message: "Update complete! Restart the app to apply changes.",
            needsRestart: true,
        });
    } catch (err: any) {
        return NextResponse.json({
            success: false,
            steps,
            message: `Update failed: ${err.message}`,
        }, { status: 500 });
    }
}

function runCommand(cmd: string, cwd: string, env?: NodeJS.ProcessEnv): Promise<{ output: string; exitCode: number }> {
    return new Promise((resolve) => {
        exec(cmd, { cwd, timeout: 120000, maxBuffer: 5 * 1024 * 1024, env }, (error: any, stdout: any, stderr: any) => {
            const output = (stdout || "") + (stderr ? `\n${stderr}` : "");
            resolve({
                output: output.trim(),
                exitCode: error ? (error as any).code || 1 : 0,
            });
        });
    });
}
