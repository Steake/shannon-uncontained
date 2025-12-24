# Shannon Edition Comparison

This document provides an objective comparison of Shannon editions to help users choose the right version for their needs.

## Overview

| Edition | License | Target Audience |
|:--------|:--------|:----------------|
| **Shannon Lite** | AGPL-3.0 | Individual researchers, small teams |
| **Shannon Uncontained** | AGPL-3.0 | Security practitioners needing black-box testing, local LLMs, or Docker-free deployment |
| **Shannon Pro** | Commercial | Enterprises requiring CI/CD integration, compliance reporting, and support SLAs |

---

## Feature Comparison

| Feature | Shannon Lite | Shannon Uncontained | Shannon Pro |
|:--------|:------------:|:-------------------:|:-----------:|
| **Core Scanning** |
| White-box analysis | ✅ | ✅ | ✅ |
| Black-box reconnaissance | ❌ | ✅ | ❌ |
| Source-sink analysis | Basic | **LLM-powered data flow** (v2) | LLM-powered data flow |
| CVSS scoring | ❌ | ✅ (v3.1 Native) | ✅ |
| Remediation guidance | Basic | **Code-level fixes** (Git Patches) | Code-level fixes |
| **LLM Providers** |
| Claude (Anthropic) | ✅ | ✅ | ✅ |
| OpenAI / GPT-4 | ❌ | ✅ | ❌ |
| GitHub Models | ❌ | ✅ | ❌ |
| Local LLMs (Ollama, llama.cpp, LM Studio) | ❌ | ✅ | ❌ |
| **Deployment** |
| Docker-based | ✅ | Optional | Cloud or Self-hosted |
| Native execution | ❌ | ✅ | ❌ |
| **Integration** |
| CI/CD pipeline support | ❌ | Basic (GitHub Actions) | Full (GitHub, GitLab, Jenkins) |
| API access | ❌ | ❌ | ✅ |
| SARIF reporting | ❌ | ✅ | ✅ |
| Webhooks (Slack/Discord/JSON) | ❌ | ✅ | ✅ |
| Jira/Linear/ServiceNow | ❌ | ❌ | ✅ |
| **Enterprise** |
| Multi-user & RBAC | ❌ | ❌ | ✅ |
| SSO/SAML | ❌ | ❌ | ✅ |
| Audit logs | ❌ | ✅ (Local JSON) | ✅ |
| Compliance reporting (OWASP, PCI-DSS, SOC2) | ❌ | OWASP mapping | ✅ |
| **Support** |
| Support | Community | Community | Dedicated + SLA |
| **Cost** | Free + API costs | Free + API costs (or local LLM) | Contact Keygraph |

---

## When to Choose Each Edition

### Shannon Lite

Choose Lite if you:
- Need white-box testing with source code access
- Are comfortable with Docker-based deployment
- Work individually or in small teams
- Need basic vulnerability scanning without enterprise features

### Shannon Uncontained

Choose Uncontained if you:
- Need **black-box testing** without source code access
- Want to use **local LLMs** (Ollama, llama.cpp, LM Studio) to avoid API costs
- Prefer **native execution** without Docker containers
- Need **multi-provider LLM support** (Claude, OpenAI, GitHub Models)
- Want basic **CI/CD integration** via GitHub Actions
- Need **SARIF reporting** for GitHub Security tab integration

### Shannon Pro

Choose Pro if you:
- Require **enterprise CI/CD integration** across multiple platforms
- Need **compliance reporting** for audits (PCI-DSS, SOC2)
- Require **dedicated support** with SLAs
- Need **SSO/SAML** integration for your organization
- Want **LLM-powered data flow analysis** for higher precision

---

## Shannon Pro Contact

For enterprise features, dedicated support, and seamless CI/CD integration:

📧 **Email**: [shannon@keygraph.io](mailto:shannon@keygraph.io)

<p align="center">
  <a href="https://docs.google.com/forms/d/e/1FAIpQLSf-cPZcWjlfBJ3TCT8AaWpf8ztsw3FaHzJE4urr55KdlQs6cQ/viewform?usp=header" target="_blank">
    <img src="https://img.shields.io/badge/📋%20Express%20Interest%20in%20Shannon%20Pro-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Express Interest">
  </a>
</p>
