# Quick Start Guide

Get Shannon Uncontained running in 5 minutes.

## Step 1: Install Prerequisites

Ensure you have Node.js 18+ installed:

```bash
node --version  # Should be v18.0.0 or higher
```

If not, download from [nodejs.org](https://nodejs.org/).

## Step 2: Clone and Install

```bash
# Clone the repository
git clone https://github.com/Steake/shannon.git
cd shannon

# Install dependencies
npm install

# Install Playwright browsers (for JS-heavy apps)
npx playwright install
```

## Step 3: Configure LLM Provider

Create a `.env` file:

```bash
cp .env.example .env
```

Choose **one** of these configurations:

### Option A: OpenAI (Recommended for beginners)

```bash
# Edit .env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...   # Get from https://platform.openai.com
```

### Option B: Claude (Anthropic)

```bash
# Edit .env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...  # Get from https://console.anthropic.com
```

### Option C: GitHub Models (Free tier)

```bash
# Edit .env
LLM_PROVIDER=github
GITHUB_TOKEN=ghp_...   # GitHub personal access token
```

### Option D: Local (Ollama)

```bash
# Install Ollama from ollama.com
ollama pull llama3.2

# Edit .env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2
```

## Step 4: Run Shannon

### Black-Box Mode (No source code)

Test a public vulnerable application:

```bash
node shannon.mjs \
  --url http://testphp.vulnweb.com \
  --mode black-box \
  --output ./output
```

This will:
1. ✅ Scan ports and discover endpoints
2. ✅ Fingerprint technologies
3. ✅ Analyze JavaScript for API calls
4. ✅ Build a world model
5. ✅ Generate exploitation code
6. ✅ Validate generated artifacts

Expected runtime: **3-5 minutes**

### White-Box Mode (With source code)

If you have application source code:

```bash
node shannon.mjs \
  --path ./your-app-source \
  --mode white-box \
  --output ./output
```

## Step 5: Review Results

Shannon generates several outputs in the `./output` directory:

```
output/
├── world-model.json        # Complete world model (Evidence + Target Model + Claims)
├── findings.json           # Discovered vulnerabilities with exploits
├── generated-code/         # Generated exploitation code
│   ├── api-client.js
│   ├── exploit-sqli.js
│   └── tests/
├── validation-results.json # Artifact validation results
└── report.md              # Human-readable report
```

### Key Files to Check

**1. findings.json**
```json
{
  "vulnerabilities": [
    {
      "type": "SQL Injection",
      "endpoint": "/artists.php?artist=1",
      "severity": "CRITICAL",
      "confidence": 0.92,
      "exploit": {
        "payload": "1' OR '1'='1",
        "proof": "Successfully extracted database structure"
      }
    }
  ]
}
```

**2. world-model.json**
```json
{
  "entities": [
    {
      "id": "endpoint:GET:/artists.php",
      "type": "endpoint",
      "attributes": {
        "method": "GET",
        "parameters": [
          { "name": "artist", "type": "integer", "vulnerable": true }
        ]
      },
      "confidence": 0.87
    }
  ]
}
```

**3. report.md**

Human-readable Markdown report with:
- Executive summary
- Discovered vulnerabilities
- Exploitation steps
- Remediation recommendations

## Step 6: Try LSG v2 (Advanced)

Test the LSG v2 world-model architecture directly:

```bash
cd src/local-source-generator/v2

# Run test suite (39 tests)
node test-suite.mjs

# Run against live target
node test-lsg-v2.mjs https://example.com ./output
```

## Common Issues

### "API key not found"

Ensure your `.env` file is in the project root and contains the correct key:

```bash
cat .env  # Verify contents
```

### "Tool not found: nmap"

Shannon works without optional tools but with reduced capabilities. Install them:

```bash
# macOS
brew install nmap

# Ubuntu/Debian
sudo apt-get install nmap
```

### "Module not found"

Reinstall dependencies:

```bash
rm -rf node_modules package-lock.json
npm install
```

### "Rate limit exceeded"

If using cloud LLM providers, you may hit rate limits. Options:

1. **Wait and retry** (limits usually reset in minutes)
2. **Use a different provider** (add fallback in `.env`)
3. **Switch to local models** (Ollama, llama.cpp)

## Next Steps

### Learn More

- **[Usage Guide](usage-guide.md)** — Full CLI reference
- **[Configuration](configuration.md)** — Advanced options
- **[LSG v2](lsg-v2/README.md)** — Understand the architecture
- **[Architecture](architecture/README.md)** — How Shannon works

### Customize Shannon

- **[Custom Agents](advanced/custom-agents.md)** — Write your own agents
- **[CI/CD Integration](advanced/cicd.md)** — Automate security testing
- **[Extending Shannon](advanced/extending.md)** — Add new features

### Get Help

- **GitHub Issues**: [Report bugs](https://github.com/Steake/shannon/issues)
- **Discord**: [Join the community](https://discord.gg/KAqzSHHpRt)
- **Discussions**: [Ask questions](https://github.com/Steake/shannon/discussions)

## Example Workflow

Here's a typical workflow for security testing:

### 1. Initial Reconnaissance

```bash
# Black-box scan to discover attack surface
node shannon.mjs \
  --url https://target.com \
  --mode black-box \
  --recon-only \
  --output ./recon
```

### 2. Review Findings

```bash
# Check world model
cat ./recon/world-model.json | jq '.entities[] | select(.type == "endpoint")'

# Review discovered endpoints
cat ./recon/findings.json | jq '.endpoints'
```

### 3. Focused Exploitation

```bash
# Target specific endpoints
node shannon.mjs \
  --url https://target.com/api/users \
  --mode black-box \
  --focus-endpoint /api/users \
  --output ./exploit
```

### 4. Generate Tests

```bash
# Create security test suite
node shannon.mjs \
  --url https://target.com \
  --mode black-box \
  --generate-tests \
  --output ./tests
```

### 5. CI/CD Integration

```bash
# Add to GitHub Actions (see advanced/github-actions.md)
# Add to GitLab CI
# Add to Jenkins pipeline
```

## Performance Tips

### Speed Up Scans

1. **Limit scope**: Use `--focus-endpoint` or `--max-depth`
2. **Reduce recon**: Use `--quick-scan` flag
3. **Use local LLMs**: Ollama is faster than API calls for simple tasks
4. **Parallel execution**: Shannon automatically parallelizes where possible

### Reduce Costs

1. **Use tier-appropriate models**:
   ```bash
   LLM_FAST_MODEL=gpt-3.5-turbo      # For classification
   LLM_SMART_MODEL=gpt-4             # For architecture inference
   LLM_CODE_MODEL=claude-sonnet      # For code generation
   ```

2. **Set budget limits** in `.env`:
   ```bash
   MAX_TOKENS_PER_AGENT=10000
   MAX_NETWORK_REQUESTS=1000
   ```

3. **Use local models** for development:
   ```bash
   LLM_PROVIDER=ollama
   LLM_MODEL=llama3.2
   ```

## Testing Shannon Itself

Verify Shannon is working correctly:

```bash
# Run unit tests
npm test

# Run LSG v2 tests
cd src/local-source-generator/v2
node test-suite.mjs

# Run integration tests
npm run test:integration
```

All tests should pass before running on production targets.

## Security Considerations

### Before Testing Production

⚠️ **WARNING**: Shannon performs active exploitation. Before running on production:

1. ✅ Get written authorization
2. ✅ Test in staging first
3. ✅ Review scope restrictions
4. ✅ Have incident response ready
5. ✅ Coordinate with SOC/security team

### Responsible Disclosure

If Shannon discovers vulnerabilities:

1. **Do not** share findings publicly
2. **Do** notify the vendor/organization privately
3. **Do** give reasonable time to fix (90 days typical)
4. **Do** coordinate disclosure timeline

### Data Privacy

Shannon may collect:
- URLs and endpoints
- Parameter names and types
- Response samples
- Generated code

Ensure compliance with:
- **GDPR** (if testing EU systems)
- **CCPA** (if testing California systems)
- **Local data protection laws**

## What's Next?

You've now:
- ✅ Installed Shannon Uncontained
- ✅ Configured an LLM provider
- ✅ Run your first scan
- ✅ Reviewed the results

**Recommended next steps:**

1. Read the [Usage Guide](usage-guide.md) for all CLI options
2. Explore the [LSG v2 Architecture](lsg-v2/README.md)
3. Try [CI/CD Integration](advanced/cicd.md)
4. Join the [Discord community](https://discord.gg/KAqzSHHpRt)

Happy hacking! 🔒
