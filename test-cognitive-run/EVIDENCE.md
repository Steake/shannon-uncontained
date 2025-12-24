# Evidence Map

> Provenance and uncertainty documentation for https://REDACTED_DOMAIN

## Evidence Sources

| Source | Events | Types |
|--------|--------|-------|
| SitemapAgent | 3 | robots_parsed, endpoint_discovered |
| subfinder | 1 | dns_record |
| WAFDetector | 1 |  |
| BrowserCrawlerAgent | 63 | endpoint_discovered, browser_crawl |
| whatweb | 1 | tech_detection |
| httpx | 2 | http_response, tech_detection |
| nmap | 1 | port_scan |
| MetasploitRecon | 1 | msf_scan_result |
| SecurityHeaderAnalyzer | 1 |  |
| XSSValidatorAgent | 1 |  |
| CommandInjectionAgent | 1 |  |
| MetasploitExploit | 1 | msf_scan_result |
| SQLmapAgent | 1 |  |
| ValidationHarness | 30 | validation_result |

## Claim Summary

| Type | Count | Avg Confidence |
|------|-------|----------------|
| waf_present | 1 | 40% |
| missing_security_header | 3 | 50% |

## High Uncertainty Items

The following items have uncertainty > 50% and may require manual verification:

- **waf_present**: https://REDACTED_DOMAIN
  - Uncertainty: 100%
  - Evidence refs: 0

- **missing_security_header**: https://REDACTED_DOMAIN
  - Uncertainty: 100%
  - Evidence refs: 0

- **missing_security_header**: https://REDACTED_DOMAIN
  - Uncertainty: 100%
  - Evidence refs: 0

- **missing_security_header**: https://REDACTED_DOMAIN
  - Uncertainty: 100%
  - Evidence refs: 0


---

## Why We Think This

Each claim in this analysis is derived from multiple evidence sources.
The confidence scores reflect the strength and consistency of the evidence.

**Legend**:
- **b (belief)**: Degree of belief the claim is true
- **d (disbelief)**: Degree of belief the claim is false
- **u (uncertainty)**: Degree of uncertainty
- **P**: Expected probability (b + a*u)

---

*Evidence collected by Shannon LSG v2*
