# PicoBot Chat 🤖

A private, local-first agentic chat interface designed to run alongside the PicoBot ecosystem. PicoBot Chat serves as your command center for automation, personal memory, and workflow management.

## 🚀 Key Features

- **Agentic Utilities**:
  - 🧠 **Memory Viewer**: Navigate your agent's daily logs and long-term "soul" memory files in a clean timeline view.
  - 📋 **Tasks & Reminders**: A persistent local task system for managing reminders and to-do lists that survive restarts.
  - 📝 **Quick Notes**: A monospace scratchpad for jotting down code snippets or ideas with debounced auto-save.
- **Voice-Enabled**: Real-time speech-to-text transcription using the Web Speech API.
- **Smart Suggestions**: A rotating pool of 20+ tailored use cases—from website monitoring and whale tracking to professional drafting and brainstorming.
- **Local-First History**: Full conversation persistence using a local SQLite database (`picobot.db`).
- **LLM Search Detection**: Auto-detects whether your LLM provider supports native web search/grounding (Google Gemini, Perplexity, OpenAI, etc.) and optimises search behaviour accordingly.
- **PicoBot Integration**: Designed to interact with the PicoBot binary for executing heavy-duty agentic tasks.
- **Telegram & Discord Integration**: Connect your agent to Telegram and Discord bots from the Settings panel.

## 🛠️ Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS.
- **Persistence**: 
  - **SQLite**: Stores chat history, metadata, and settings.
  - **Markdown**: Stores agentic data (Memory, Tasks, Notes) for human/agent readability.
- **Transcription**: Browser-native Web Speech API.

## 🏁 Getting Started

### Prerequisites

- **Node.js**: 18.x or later.
- **PicoBot Binary**: Ensure you have the `picobot` binary in the `bin/` directory for your platform.
  - Windows: `bin/picobot.exe`
  - macOS: `public/bin/picobot-darwin-amd64`
  - Linux: `public/bin/picobot-linux-amd64`

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🐳 Docker

For users who prefer running PicoBot Chat in a container for isolation and security:

### Quick Start

```bash
docker compose up -d
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### What's Included

- **Multi-stage Alpine build** — small, production-optimised image.
- **Persistent data volume** — SQLite database and PicoBot config survive container restarts.
- **Auto-restart** — the container restarts automatically unless explicitly stopped.

### Manual Build & Run

```bash
# Build the image
docker build -t picobot-chat .

# Run the container
docker run -d -p 3000:3000 -v picobot-data:/app/data --name picobot-chat picobot-chat
```

### Stopping

```bash
docker compose down        # stop container (data preserved)
docker compose down -v     # stop container and delete data volume
```

## ⚖️ License

This project is private and intended for local use.

