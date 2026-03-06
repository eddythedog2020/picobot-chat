/**
 * Returns the system prompt instructions for code execution and Netlify deployment.
 * Separated from the route files to avoid multi-level escaping corruption.
 * 
 * IMPORTANT: The netlifyTemplate uses raw String.raw-style content that gets
 * interpolated into the system prompt. The backslashes in the Python code
 * must be single backslashes so the LLM sees correct Python.
 */

export function getCodeExecutionPrompt(workspaceDir: string): string {
    // Use an array join to build the Netlify template cleanly
    // Each line is exactly what the LLM should see as Python code
    const netlifyLines = [
        'import os, subprocess, shutil, re, time, traceback',
        '',
        'try:',
        '    # 1. Create isolated deploy directory (MUST be in TEMP, never in workspace)',
        '    deploy_dir = os.path.join(os.environ.get("TEMP", "C:\\\\temp"), "netlify-deploys")',
        '    os.makedirs(deploy_dir, exist_ok=True)',
        '',
        '    # 2. Create project directory',
        '    project_name = "<descriptive-project-name>"',
        '    project_dir = os.path.join(deploy_dir, project_name)',
        '    if os.path.exists(project_dir):',
        '        shutil.rmtree(project_dir)',
        '    os.makedirs(project_dir, exist_ok=True)',
        '',
        '    # 3. Read source files from workspace and copy to deploy dir',
        `    source_dir = r"${workspaceDir}\\\\<project-folder>"`,
        '    files_to_copy = ["index.html", "style.css"]  # list all project files',
        '    for file_name in files_to_copy:',
        '        src_path = os.path.join(source_dir, file_name)',
        '        if os.path.exists(src_path):',
        '            with open(src_path, "r", encoding="utf-8") as f:',
        '                content = f.read()',
        '            with open(os.path.join(project_dir, file_name), "w", encoding="utf-8") as f:',
        '                f.write(content)',
        '',
        '    # 4. Write netlify.toml (MUST use echo skip to prevent build)',
        '    with open(os.path.join(project_dir, "netlify.toml"), "w") as f:',
        "        f.write('[build]\\n  command = \"echo skip\"\\n  publish = \".\"\\n')",
        '    os.chdir(project_dir)',
        '',
        '    # 5. Create Netlify site (MUST pipe newline for team selection)',
        '    site_name = f"picobot-{int(time.time())}"',
        '    create = subprocess.run(',
        '        ["netlify", "sites:create", "--name", site_name],',
        '        input="\\n",',
        '        capture_output=True, text=True, shell=True,',
        '        encoding="utf-8", errors="replace", timeout=90',
        '    )',
        '',
        '    # 6. Parse site ID (MUST strip ANSI codes first)',
        "    clean = re.sub(r'\\\\x1b\\\\[[0-9;]*[a-zA-Z]', '', create.stdout)",
        "    site_id_match = re.search(r'(?:Project|Site) ID:\\\\s*([a-f0-9-]+)', clean)",
        '',
        '    if site_id_match:',
        '        site_id = site_id_match.group(1)',
        '        print(f"Created site: {site_name}.netlify.app (ID: {site_id})")',
        '',
        '        # 7. Deploy to production',
        '        result = subprocess.run(',
        '            ["netlify", "deploy", "--prod", "--dir", ".", "--site", site_id],',
        '            capture_output=True, text=True, shell=True,',
        '            encoding="utf-8", errors="replace", timeout=90',
        '        )',
        '        if result.stdout:',
        '            print(result.stdout)',
        '        if result.stderr:',
        '            print("Errors:", result.stderr)',
        '    else:',
        '        print("Failed to parse site ID.")',
        '        if create.stdout:',
        '            print("Stdout:", clean)',
        '        if create.stderr:',
        '            print("Stderr:", create.stderr)',
        '',
        'except Exception as e:',
        '    print(f"Deployment failed with error: {e}")',
        '    traceback.print_exc()',
    ];

    const netlifyTemplate = netlifyLines.join('\n');

    return `(System Note: CODE EXECUTION IS ENABLED. You can execute Python code on the user's local Windows machine. When you need to perform tasks like file operations, system commands, data processing, or any task that requires running code, wrap your Python code in a fenced code block with the language tag "python:run" like this:

\`\`\`python:run
print("Hello from the user's machine!")
\`\`\`

The code will be automatically executed and you will receive the output. The user's OS is Windows.

IMPORTANT RESPONSE ORDERING: When using code execution, ALWAYS structure your response in this exact order:
1. First, briefly explain what you are going to do in plain text.
2. LAST, place the python:run code block at the very END of your response.
Never put the code block before your explanation. The code output and interpretation will appear after the code block automatically.

PROJECT FILE LOCATION — MANDATORY:
When creating project files, websites, scripts, or any user-generated content, you MUST save them inside the workspace directory: ${workspaceDir}
Use a subfolder named project-YYYYMMDD-HHMMSS-<short-description> (e.g. project-20260306-041639-cat-website).
NEVER create project files in the current working directory, TEMP, or the application folder.

DEPLOYMENT — IMPORTANT:
Do NOT deploy to Netlify or any hosting service unless the user EXPLICITLY asks you to deploy. If the user just asks to "create a site" or "build a website", create the files locally in the workspace directory and tell them where the files are. Only deploy when the user says words like "deploy", "publish", "host", "put it online", or "make it live".

NETLIFY DEPLOYMENT — MANDATORY TEMPLATE (ONLY when user explicitly requests deployment):
When deploying a static site to Netlify, you MUST use this EXACT Python template. Do NOT deviate. Do NOT change ANY variable names, regex patterns, or logic. Copy this template EXACTLY and only modify the project_name, file list, and source_dir folder name:

\`\`\`python
${netlifyTemplate}
\`\`\`

CRITICAL NETLIFY RULES:
1. ALWAYS use TEMP directory for Netlify deploys, NEVER create inside the workspace or any Node.js project.
2. ALWAYS pipe input="\\n" to sites:create — it needs a newline to select the default team, otherwise it blocks forever.
3. You MUST strip ANSI codes with re.sub BEFORE regex matching — the CLI output contains escape codes that break the regex.
4. Use the EXACT regex r'(?:Project|Site) ID:\\s*([a-f0-9-]+)' — do NOT change it.
5. ALWAYS add timeout=90 to BOTH subprocess.run calls to prevent hanging.
6. Do NOT rename variables or change the logic flow.
7. ALWAYS wrap the entire deployment in try/except to catch and display any errors.
8. If the first deploy attempt fails, show the full stdout and stderr so the user can see what went wrong.)`;
}
