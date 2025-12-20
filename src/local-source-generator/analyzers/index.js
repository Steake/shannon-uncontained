/**
 * Analyzers barrel export for Local Source Generator
 */

export { LLMAnalyzer } from './llm-analyzer.js';
export {
    mapEndpointsToVulnerabilities,
    generateHypothesisQueue,
    identifyInputVectors,
    VULNERABILITY_CLASSES
} from './vuln-mapper.js';
export {
    parseWhatwebOutput,
    fingerprintFromHTML,
    fingerprintFromHeaders,
    runEnhancedWhatweb,
    generateTechFingerprint,
    TECH_SIGNATURES
} from './fingerprinter.js';
export {
    discoverOpenAPISchemas,
    introspectGraphQL,
    extractAPIsFromJS,
    generateSchemathesisConfig,
    discoverAPIs,
    API_SCHEMA_PATHS
} from './api-discovery.js';
export {
    generateReplayTraffic,
    generateFuzzingRequests,
    generateRaceConditionTests,
    generateBehavioralPattern,
    TRAFFIC_PATTERNS,
    FUZZ_PAYLOADS
} from './ghost-traffic.js';
export {
    extractCloudBuckets,
    identifyDevEnvironments,
    checkGitLeakage,
    scanSensitiveFiles,
    correlateCloudAssets,
    huntShadowIT,
    CLOUD_SIGNATURES,
    DEV_INDICATORS
} from './shadow-it.js';
export {
    extractHiddenEndpoints,
    detectObfuscation,
    identifyWebSockets,
    scanHiddenDirectories,
    analyzeDarkMatter,
    HIDDEN_DIRECTORIES
} from './dark-matter.js';
export {
    detectGodModeParams,
    scanForSecrets,
    detectBuildPaths,
    extractSecurityTodos,
    checkCORSMisconfig,
    scanMisconfigurations,
    GOD_MODE_PARAMS,
    SECRET_PATTERNS
} from './misconfig-detector.js';
