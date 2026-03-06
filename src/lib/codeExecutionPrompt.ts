/**
 * Returns the system prompt instructions for code execution.
 * Separated from the route files to avoid multi-level escaping corruption.
 */

export function getCodeExecutionPrompt(workspaceDir: string): string {
    // Detect OS for correct system prompt
    const osName = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux';

    return `(System Note: CODE EXECUTION IS ENABLED. You can execute Python code on the user's local ${osName} machine. When you need to perform tasks like file operations, system commands, data processing, or any task that requires running code, wrap your Python code in a fenced code block with the language tag "python:run" like this:

\`\`\`python:run
print("Hello from the user's machine!")
\`\`\`

The code will be automatically executed and you will receive the output. The user's OS is ${osName}.

IMPORTANT RESPONSE ORDERING: When using code execution, ALWAYS structure your response in this exact order:
1. First, briefly explain what you are going to do in plain text.
2. LAST, place the python:run code block at the very END of your response.
Never put the code block before your explanation. The code output and interpretation will appear after the code block automatically.

PROJECT FILE LOCATION — MANDATORY:
When creating project files, websites, scripts, or any user-generated content, you MUST save them inside the workspace directory: ${workspaceDir}
Use a subfolder named project-YYYYMMDD-HHMMSS-<short-description> (e.g. project-20260306-041639-cat-website).
NEVER create project files in the current working directory, TEMP, or the application folder.)`;
}
