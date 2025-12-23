# Shannon External Dependencies

Shannon relies on several external security tools to perform reconnaissance and exploitation. These tools must be installed and available in the system PATH.

## Quick Start

We provide a setup script to verify your environment:

```bash
./setup.sh
```

This script checks for Node.js, Go, Python, Nmap (with NSE), and other required tools.

## Required Tools

### 1. Nmap (Network Mapper)
**Criticality**: HIGH (Required for `NetReconAgent`)
**Minimum Version**: 7.90+
**Requirements**:
- Must be installed with **NSE (Nmap Scripting Engine)** enabled.
- Default scripts (`/usr/share/nmap/scripts` or similar) must be present.
- **Verification**: Run `nmap --script=banner 127.0.0.1`. If this fails with `could not locate nse_main.lua`, your installation is broken.

**Installation**:
- **macOS (Homebrew)**: `brew install nmap`
  - *Note*: If `nmap` command points to a broken system binary, ensure the Homebrew path (`/usr/local/bin` or `/opt/homebrew/bin`) is before `/usr/bin` in your PATH.
- **Linux (Debian/Ubuntu)**: `sudo apt-get install nmap`
- **Linux (Arch)**: `sudo pacman -S nmap`

### 2. Metasploit Framework
**Criticality**: MEDIUM (Required for `MetasploitAgent`, skip with `--no-msf`)
**Requirements**:
- `msfrpcd` daemon must be runnable.
- **Installation**: Use the nightly installers from [Metasploit](https://github.com/rapid7/metasploit-framework).

### 3. Go-based Recon Tools
These tools are used by their respective agents.
- **subfinder** (Subdomain discovery)
- **httpx** (HTTP probing)
- **katana** (Crawling)
- **nuclei** (Vulnerability scanning)
- **gau** (GetAllUrls)

**Installation**:
All can be installed via `go install`:
```bash
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest
go install -v github.com/projectdiscovery/katana/cmd/katana@latest
go install -v github.com/projectdiscovery/nuclei/v2/cmd/nuclei@latest
go install -v github.com/lc/gau/v2/cmd/gau@latest
```
Ensure `$GOPATH/bin` or `$HOME/go/bin` is in your PATH.

## Environment Resolution
The `shannon` CLI attempts to resolve these tools from your environment.
- It checks `PATH` first.
- On macOS, it has fallback logic to check common Homebrew locations if the `PATH` version is broken.
