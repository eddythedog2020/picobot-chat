# PicoBot Chat 🤖

A private, self-hosted agentic chat interface and command centre for automation, personal memory, workflow management, and code execution. Deploy to a VPS, run in Docker, or use locally on Windows, macOS, or Linux — your data never leaves your infrastructure.

## 🚀 Key Features

### Core Chat
- **Multi-LLM Support**: Works with any OpenAI-compatible API — Google Gemini, OpenAI, Perplexity, local models, and more.
- **Streaming Responses**: Real-time streamed output with markdown rendering and syntax highlighting.
- **Chat History**: Full conversation persistence with chat list, rename, and delete. Survives restarts.
- **Voice Input**: Real-time speech-to-text using the Web Speech API.
- **Vision / Image Analysis**: Upload or paste images for multimodal analysis via the chat.
- **Smart Suggestions**: 20+ rotating use-case suggestions — from website monitoring to professional drafting.
- **Source Citations**: Auto-instructs the LLM to cite sources when referencing news or factual claims.

### Code Execution
- **Python Execution Engine**: Execute Python code directly on the host machine from the chat (toggle in Settings).
- **Auto-detect & Run**: Code blocks tagged `python:run` are automatically executed with output displayed inline.
- **Follow-up Interpretation**: After execution, the LLM interprets the results and explains them.
- **Cross-platform**: Uses `python` on Windows, `python3` on Linux/macOS automatically.
- **Safe Defaults**: Code execution is disabled by default — opt-in via Settings with a safety warning.

### Netlify Deployment Skill
- **One-prompt deploys**: Tell the bot to create an HTML page and deploy to Netlify — it handles everything.
- **Unique sites per deploy**: Each deploy creates a brand-new Netlify site with a unique URL using `sites:create`.
- **ANSI-safe parsing**: Strips terminal escape codes from CLI output before regex matching.
- **Clean-room isolation**: Projects are built in a temp directory to avoid framework detection conflicts.

### Skill System
- **Auto-discovery**: Skills are automatically detected and injected into the LLM system prompt.
- **SKILL.md Format**: Each skill is a folder with a `SKILL.md` file containing YAML frontmatter and structured instructions.
- **Skill Builder**: A meta-skill for creating new skills with the correct format and structure.
- **Included Skills**: `netlify-deploy`, `weather`, `cron`, `site-monitor-run`, `sol-whale-monitor-run`, `skill-builder`, `example`.

### Agentic Utilities
- 🧠 **Memory Viewer**: Navigate daily agent logs and long-term memory files in a clean timeline.
- 📋 **Tasks & Reminders**: Persistent local task system with reminders that survive restarts.
- 📝 **Quick Notes**: Monospace scratchpad with debounced auto-save.
- 📁 **Workspace File Manager**: Browse, view, and manage workspace files from the chat UI.

### Intelligence
- **LLM Search Detection**: Auto-detects if your provider supports native web search/grounding and optimises accordingly.
- **Canvas Panel**: Code output displayed in a side panel for easy viewing and copying.
- **PicoBot Binary Integration**: Lightweight Go binary for bot identity and agentic tasks.
- **Telegram & Discord Integration**: Connect to messaging platforms from the Settings panel.

## 🛠️ Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS
- **Backend**: Next.js API Routes, SQLite (via `better-sqlite3`)
- **Persistence**: SQLite for chats, settings, and metadata; Markdown for memory, tasks, and notes
- **Code Execution**: Python subprocess with UTF-8 encoding and 120s timeout
- **Process Management**: PM2 (for server deployments)
- **Reverse Proxy**: nginx (for server deployments)

## 🏁 Getting Started

### Prerequisites

- **Node.js**: 18.x or later
- **Python 3**: Required for code execution feature
- **PicoBot Binary** (optional): For bot identity
  - Windows: `bin/picobot.exe`
  - macOS: `public/bin/picobot-darwin-amd64`
  - Linux: `public/bin/picobot-linux-amd64`

### Quick Start (Local or VPS)

```bash
npm install
npm run dev
```

Open `http://<your-server-ip>:3000` (or `http://localhost:3000` if running locally) and configure your API credentials in **Settings** (gear icon).

> **Recommended**: Deploy on a VPS (DigitalOcean, Hetzner, etc.) for always-on availability. See the Server Deployment section below.

## ☁️ Server Deployment (Ubuntu/DigitalOcean)

### Quick Deploy

```bash
# 1. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs python3 make g++ gcc nginx

# 2. Add swap if < 2GB RAM
fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile

# 3. Clone and build
git clone <your-repo-url> /opt/picobot
cd /opt/picobot
npm ci && npm run build

# 4. Set up PicoBot binary
mkdir -p bin
cp public/bin/picobot-linux-amd64 bin/picobot && chmod +x bin/picobot

# 5. Install PM2 and start
npm install -g pm2
PORT=3000 pm2 start npm --name picobot -- start
pm2 save && pm2 startup

# 6. Configure nginx reverse proxy
cat > /etc/nginx/sites-available/picobot << 'EOF'
server {
    listen 80;
    server_name _;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
ln -sf /etc/nginx/sites-available/picobot /etc/nginx/sites-enabled/picobot
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
```

### Skills Deployment

Copy the skills folder to the server:
```bash
mkdir -p /root/.picobot/workspace/skills
# scp -r ./skills/* root@your-server:/root/.picobot/workspace/skills/
```

## 🐳 Docker

```bash
# Quick start
docker compose up -d

# Manual build
docker build -t picobot-chat .
docker run -d -p 3000:3000 -v picobot-data:/app/data --name picobot-chat picobot-chat

# Stop
docker compose down        # data preserved
docker compose down -v     # delete data volume
```

## ⚙️ Configuration

All settings are managed via the **Settings** page in the UI:

| Setting | Description |
|---|---|
| API Base URL | Your LLM provider endpoint (OpenAI-compatible) |
| API Key | Authentication key for the LLM API |
| Default Model | Model to use (e.g., `gemini-2.0-flash`) |
| Bot Name | Display name for the assistant |
| Code Execution | Enable/disable Python execution (off by default) |
| Telegram Token | Connect to a Telegram bot |
| Discord Token | Connect to a Discord bot |

## ⚖️ License

MIT — use it, deploy it, make it yours.
