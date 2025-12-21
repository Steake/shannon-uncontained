# Installation

This guide covers installing Shannon Uncontained on your system.

## Prerequisites

### Required

- **Node.js 18 or higher** (Node.js 20 recommended) — [Download from nodejs.org](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** — For cloning the repository

### Optional Tools

Shannon can use these reconnaissance tools if available:

- **nmap** — Network scanning
- **subfinder** — Subdomain enumeration
- **whatweb** — Technology fingerprinting
- **gau** (Get All URLs) — URL harvesting
- **katana** — Web crawler

**Installing optional tools:**

```bash
# macOS (via Homebrew)
brew install nmap
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install -v github.com/projectdiscovery/katana/cmd/katana@latest
go install github.com/lc/gau/v2/cmd/gau@latest

# Ubuntu/Debian
sudo apt-get install nmap whatweb
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install -v github.com/projectdiscovery/katana/cmd/katana@latest
go install github.com/lc/gau/v2/cmd/gau@latest
```

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/Steake/shannon.git
cd shannon
```

### 2. Install Dependencies

```bash
npm install
```

This installs all required Node.js packages, including:
- AI SDK integration
- Playwright (for JavaScript-rendered apps)
- CLI utilities
- Testing frameworks

### 3. Install Playwright Browsers

For testing JavaScript-heavy applications:

```bash
npx playwright install
```

This downloads Chromium, Firefox, and WebKit browsers used by Playwright.

### 4. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your preferred editor:

```bash
# Example .env configuration

# LLM Provider Selection (choose one or mix)
LLM_PROVIDER=openai              # Options: openai, anthropic, github, ollama, llamacpp, lmstudio

# Cloud Providers (provide at least one API key)
OPENAI_API_KEY=sk-...            # For OpenAI GPT-4/4o
ANTHROPIC_API_KEY=sk-ant-...     # For Claude
GITHUB_TOKEN=ghp_...             # For GitHub Models

# Local Providers (no API key needed)
# LLM_PROVIDER=ollama            # Ollama at localhost:11434
# LLM_PROVIDER=llamacpp          # llama.cpp at localhost:8080
# LLM_PROVIDER=lmstudio          # LM Studio at localhost:1234

# Custom Endpoint
# LLM_PROVIDER=custom
# LLM_BASE_URL=https://your-endpoint.com/v1

# Model Selection (optional, overrides defaults)
# LLM_MODEL=gpt-4o               # For OpenAI
# LLM_MODEL=claude-opus-4        # For Anthropic
# LLM_MODEL=llama3.2             # For Ollama

# Capability-specific models (advanced)
# LLM_FAST_MODEL=gpt-4-turbo     # For fast classification
# LLM_SMART_MODEL=gpt-4o         # For architecture inference
# LLM_CODE_MODEL=claude-sonnet   # For code synthesis
```

### 5. Verify Installation

Test that Shannon is correctly installed:

```bash
node shannon.mjs --help
```

You should see the Shannon help output.

## LLM Provider Setup

Shannon supports multiple LLM providers. Choose the one that fits your needs:

### Option 1: OpenAI (GPT-4)

1. Sign up at [platform.openai.com](https://platform.openai.com/)
2. Create an API key
3. Add to `.env`:
   ```bash
   LLM_PROVIDER=openai
   OPENAI_API_KEY=sk-...
   ```

**Cost:** ~$0.01-0.10 per request depending on model

### Option 2: Anthropic (Claude)

1. Sign up at [console.anthropic.com](https://console.anthropic.com/)
2. Create an API key
3. Add to `.env`:
   ```bash
   LLM_PROVIDER=anthropic
   ANTHROPIC_API_KEY=sk-ant-...
   ```

**Cost:** ~$0.01-0.10 per request depending on model

### Option 3: GitHub Models (Free Tier)

1. Get a GitHub token with appropriate scopes
2. Add to `.env`:
   ```bash
   LLM_PROVIDER=github
   GITHUB_TOKEN=ghp_...
   ```

**Cost:** Free (with rate limits)

### Option 4: Ollama (Local)

1. Install Ollama from [ollama.com](https://ollama.com/)
2. Pull a model:
   ```bash
   ollama pull llama3.2
   ```
3. Configure `.env`:
   ```bash
   LLM_PROVIDER=ollama
   LLM_MODEL=llama3.2
   ```

**Cost:** Free (local compute)

### Option 5: llama.cpp (Local)

1. Install and run llama.cpp server
2. Configure `.env`:
   ```bash
   LLM_PROVIDER=llamacpp
   LLM_BASE_URL=http://localhost:8080
   ```

**Cost:** Free (local compute)

### Option 6: LM Studio (Local)

1. Download LM Studio from [lmstudio.ai](https://lmstudio.ai/)
2. Start the local server
3. Configure `.env`:
   ```bash
   LLM_PROVIDER=lmstudio
   ```

**Cost:** Free (local compute)

## Testing Your Setup

### Basic Test

Run Shannon against a test target:

```bash
node shannon.mjs --url http://testphp.vulnweb.com --mode black-box
```

This will:
1. Perform reconnaissance
2. Build a world model
3. Generate attack hypotheses
4. Attempt exploitation

### LSG v2 Test Suite

Run the comprehensive LSG v2 tests:

```bash
cd src/local-source-generator/v2
node test-suite.mjs
```

Expected output:
```
✓ EvidenceGraph: Create and query events
✓ EvidenceGraph: Content hashing ensures idempotency
✓ TargetModel: Add entities and edges
✓ EpistemicLedger: EBSL opinion calculation
... (39 tests total)

All tests passed!
```

## Troubleshooting

### "Cannot find module" errors

Ensure all dependencies are installed:
```bash
rm -rf node_modules package-lock.json
npm install
```

### LLM provider errors

Verify your API keys:
```bash
# Test OpenAI
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Test Anthropic
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01"
```

### Reconnaissance tool not found

Shannon will work without optional tools but with reduced capabilities. Install missing tools:

```bash
# Check which tools are available
which nmap subfinder katana gau whatweb

# Install missing tools (see Prerequisites section)
```

### Permission errors

Ensure execution permissions:
```bash
chmod +x shannon.mjs
```

### Node.js version issues

Check your Node.js version:
```bash
node --version  # Should be v18.0.0 or higher (v20+ recommended)
```

Upgrade if needed:
```bash
# Using nvm (recommended: install Node.js 20)
nvm install 20
nvm use 20

# Or download from nodejs.org
```

## Docker Installation (Alternative)

If you prefer Docker despite the fork's philosophy:

```bash
# Build the image
docker build -t shannon-uncontained .

# Run Shannon
docker run -it --rm \
  -e OPENAI_API_KEY=sk-... \
  -v $(pwd)/output:/output \
  shannon-uncontained \
  --url https://example.com \
  --mode black-box
```

**Note:** The Docker setup is maintained for compatibility but not recommended.

## Upgrading

To upgrade to the latest version:

```bash
cd shannon
git pull origin main
npm install
```

Check the [Changelog](appendices/changelog.md) for breaking changes.

## Next Steps

- **[Quick Start](quick-start.md)** — Run your first scan
- **[Usage Guide](usage-guide.md)** — Learn all CLI options
- **[Configuration](configuration.md)** — Advanced configuration options
