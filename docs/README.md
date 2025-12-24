# Shannon Uncontained Documentation

This directory contains the official documentation for Shannon Uncontained.

## Documentation Structure

### GitBook

The primary documentation is organized as a GitBook in the `gitbook/` directory.

**Building the GitBook:**

```bash
cd docs/gitbook

# Install GitBook CLI (if not already installed)
npm install -g gitbook-cli

# Install plugins
gitbook install

# Serve locally
gitbook serve

# Build static site
gitbook build
```

**Viewing the documentation:**

Once built, open `http://localhost:4000` in your browser.

### Documentation Sections

1. **[Introduction](gitbook/introduction.md)** — Understanding Shannon Uncontained
2. **[Installation](gitbook/installation.md)** — Getting started
3. **[Fork Philosophy](gitbook/fork-philosophy.md)** — Why this fork exists
4. **[LSG v2](gitbook/lsg-v2/)** — World-model-first architecture
5. **[Architecture](gitbook/architecture/)** — System design
6. **[Configuration](gitbook/configuration.md)** — Setup and options
7. **[Advanced Topics](gitbook/advanced/)** — CI/CD, custom agents
8. **[API Reference](gitbook/api-reference/)** — Programmatic usage

## Alternative Documentation Formats

### Markdown Browsing

All documentation is written in standard Markdown and can be read directly on GitHub or in any Markdown viewer.

Navigate to `docs/gitbook/` and follow the links in `SUMMARY.md`.

### PDF Export

To generate a PDF version:

```bash
cd docs/gitbook
gitbook pdf . shannon-uncontained-docs.pdf
```

### EPUB/MOBI Export

To generate e-book formats:

```bash
cd docs/gitbook
gitbook epub . shannon-uncontained-docs.epub
gitbook mobi . shannon-uncontained-docs.mobi
```

## Contributing to Documentation

### Documentation Standards

- Use **clear, concise language**
- Include **code examples** where applicable
- Add **diagrams** for complex concepts (Mermaid syntax)
- Link to **related pages** for context
- Keep **line length < 120 characters** for readability

### Adding New Pages

1. Create the Markdown file in the appropriate directory
2. Add an entry to `gitbook/SUMMARY.md`
3. Update cross-references in related pages
4. Test locally with `gitbook serve`
5. Submit a pull request

### Documentation Testing

Before submitting documentation changes:

```bash
# Check for broken links
cd docs/gitbook
npm install -g markdown-link-check
find . -name "*.md" -exec markdown-link-check {} \;

# Spell check (optional)
npm install -g markdown-spellcheck
mdspell '**/*.md' --en-us --ignore-numbers --ignore-acronyms

# Build GitBook to verify
gitbook build
```

## Documentation Versioning

Documentation is versioned alongside the codebase:

- **Latest (main branch)** — Current development version
- **Tagged releases** — Frozen documentation for specific versions

To view documentation for a specific version:

```bash
git checkout v2.0.0
cd docs/gitbook
gitbook serve
```

## License

Documentation is licensed under [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).

Code examples within documentation are licensed under AGPL-3.0, same as the main project.

## Questions or Issues?

- **GitHub Issues**: [Report documentation issues](https://github.com/Steake/shannon/issues)
- **Discord**: [Join community discussions](https://discord.gg/KAqzSHHpRt)
- **Upstream**: [Original Shannon docs](https://github.com/KeygraphHQ/shannon)
