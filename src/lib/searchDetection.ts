/**
 * LLM Search Detection Utility
 *
 * Auto-detects whether the configured LLM provider has native web search
 * capabilities based on the API base URL and model name.
 */

export type SearchCapability = {
    hasSearch: boolean;
    provider: string;
    confidence: 'high' | 'medium' | 'low';
    detail: string;
};

type DetectionRule = {
    /** Match against the API base URL (lowercased) */
    hostPatterns?: string[];
    /** Match against model name (lowercased) */
    modelPatterns?: string[];
    provider: string;
    detail: string;
    confidence: 'high' | 'medium' | 'low';
};

const DETECTION_RULES: DetectionRule[] = [
    // ── Always-on search providers ──
    {
        hostPatterns: ['perplexity.ai'],
        provider: 'Perplexity',
        detail: 'Always-on real-time web search (core product)',
        confidence: 'high',
    },
    {
        hostPatterns: ['api.x.ai'],
        provider: 'xAI Grok',
        detail: 'Live Search + X/Twitter grounding',
        confidence: 'high',
    },

    // ── Google Gemini ──
    {
        hostPatterns: ['generativelanguage.googleapis.com', 'aiplatform.googleapis.com'],
        provider: 'Google Gemini',
        detail: 'Google Search Grounding (native, fast)',
        confidence: 'high',
    },
    {
        modelPatterns: ['gemini'],
        provider: 'Google Gemini',
        detail: 'Google Search Grounding via compatible provider',
        confidence: 'medium',
    },

    // ── OpenAI ──
    {
        hostPatterns: ['api.openai.com'],
        modelPatterns: ['gpt-4', 'gpt-3.5'],
        provider: 'OpenAI',
        detail: 'Web browsing tool (GPT-4o, GPT-4.1 and newer)',
        confidence: 'high',
    },

    // ── Anthropic Claude ──
    {
        hostPatterns: ['api.anthropic.com'],
        provider: 'Anthropic Claude',
        detail: 'Web search tool (Claude 3.5+ models)',
        confidence: 'high',
    },
    {
        modelPatterns: ['claude'],
        provider: 'Anthropic Claude',
        detail: 'Web search tool (if using Claude 3.5+)',
        confidence: 'medium',
    },

    // ── Mistral ──
    {
        hostPatterns: ['api.mistral.ai'],
        provider: 'Mistral',
        detail: 'Web search via Agents API',
        confidence: 'high',
    },
    {
        modelPatterns: ['mistral'],
        provider: 'Mistral',
        detail: 'Web search available on Mistral platform',
        confidence: 'medium',
    },

    // ── Cohere ──
    {
        hostPatterns: ['api.cohere.ai', 'api.cohere.com'],
        provider: 'Cohere',
        detail: 'RAG + web grounding (Command-R models)',
        confidence: 'high',
    },
    {
        modelPatterns: ['command-r', 'command-a'],
        provider: 'Cohere',
        detail: 'Built-in grounded generation',
        confidence: 'medium',
    },

    // ── Alibaba Qwen ──
    {
        hostPatterns: ['dashscope.aliyuncs.com'],
        provider: 'Alibaba Qwen',
        detail: 'Intelligent Search with real-time web + image search',
        confidence: 'high',
    },
    {
        modelPatterns: ['qwen'],
        provider: 'Alibaba Qwen',
        detail: 'Intelligent Search (Qwen 3+)',
        confidence: 'medium',
    },

    // ── Moonshot Kimi ──
    {
        hostPatterns: ['api.moonshot.cn', 'kimi.ai', 'kimi.moonshot.cn'],
        provider: 'Moonshot Kimi',
        detail: 'Native web search via API (K2+)',
        confidence: 'high',
    },
    {
        modelPatterns: ['kimi', 'moonshot'],
        provider: 'Moonshot Kimi',
        detail: 'Web search when using Kimi models',
        confidence: 'medium',
    },

    // ── Baidu ERNIE ──
    {
        hostPatterns: ['aip.baidubce.com'],
        provider: 'Baidu ERNIE',
        detail: 'Advanced search + webpage reading (ERNIE X1)',
        confidence: 'high',
    },
    {
        modelPatterns: ['ernie'],
        provider: 'Baidu ERNIE',
        detail: 'Web search with ERNIE models',
        confidence: 'medium',
    },

    // ── DeepSeek (cloud API only) ──
    {
        hostPatterns: ['api.deepseek.com'],
        provider: 'DeepSeek',
        detail: 'Web search toggle available on cloud API',
        confidence: 'medium',
    },
    {
        modelPatterns: ['deepseek'],
        provider: 'DeepSeek',
        detail: 'Web search if using DeepSeek cloud',
        confidence: 'low',
    },

    // ── Microsoft Azure OpenAI ──
    {
        hostPatterns: ['openai.azure.com', 'cognitiveservices.azure.com'],
        provider: 'Azure OpenAI',
        detail: 'Bing Search grounding (enterprise)',
        confidence: 'high',
    },

    // ── OpenRouter (proxy — detect by model name) ──
    {
        hostPatterns: ['openrouter.ai'],
        provider: 'OpenRouter',
        detail: 'Search depends on the underlying model — check model name',
        confidence: 'low',
    },
];

/** Patterns that confidently indicate NO search capability */
const NO_SEARCH_HOSTS = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '192.168.',
    '10.0.',
    '172.16.',
];

export function detectSearchCapability(
    apiBaseUrl: string,
    modelName: string
): SearchCapability {
    const url = (apiBaseUrl || '').toLowerCase().trim();
    const model = (modelName || '').toLowerCase().trim();

    // Fast exit: local servers never have search
    if (NO_SEARCH_HOSTS.some((p) => url.includes(p))) {
        return {
            hasSearch: false,
            provider: 'Local / Offline',
            confidence: 'high',
            detail: 'Local models do not have web search capabilities',
        };
    }

    // Check rules: prefer host-based matches (higher confidence), then model-based
    let bestMatch: SearchCapability | null = null;

    for (const rule of DETECTION_RULES) {
        const hostMatch = rule.hostPatterns?.some((p) => url.includes(p)) ?? false;
        const modelMatch = rule.modelPatterns?.some((p) => model.includes(p)) ?? false;

        // Both match = strongest signal
        if (hostMatch && modelMatch) {
            return {
                hasSearch: true,
                provider: rule.provider,
                confidence: 'high',
                detail: rule.detail,
            };
        }

        // Host match alone
        if (hostMatch && (!bestMatch || confidenceRank(rule.confidence) > confidenceRank(bestMatch.confidence))) {
            bestMatch = {
                hasSearch: true,
                provider: rule.provider,
                confidence: rule.confidence,
                detail: rule.detail,
            };
        }

        // Model match alone (only if no host match yet)
        if (modelMatch && !bestMatch) {
            bestMatch = {
                hasSearch: true,
                provider: rule.provider,
                confidence: rule.confidence,
                detail: rule.detail,
            };
        }
    }

    if (bestMatch) return bestMatch;

    // Default: unknown
    return {
        hasSearch: false,
        provider: 'Unknown',
        confidence: 'low',
        detail: 'Could not detect search capability — you can override this manually',
    };
}

function confidenceRank(c: 'high' | 'medium' | 'low'): number {
    return c === 'high' ? 3 : c === 'medium' ? 2 : 1;
}
