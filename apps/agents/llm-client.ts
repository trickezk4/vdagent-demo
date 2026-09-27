/**
 * apps/agents/llm-client.ts
 * OpenRouter DeepSeek LLM integration with automatic deterministic mock fallback
 */

import dotenv from 'dotenv';
import { type z } from 'zod';

dotenv.config();

export interface LlmCallOptions<T> {
  role: string;
  systemPrompt: string;
  userPrompt: string;
  schema?: z.ZodType<T>;
  fallbackGenerator: () => Promise<T> | T;
  emitTrace?: (msg: string) => void;
  emitToken?: (token: string) => void;
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * Strips markdown code fences (```json ... ```) if returned by the LLM
 */
export function cleanJsonString(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

/**
 * Dispatches prompt to OpenRouter, with automated deterministic fallback upon error (HTTP 402, 429, timeout, network error)
 */
export async function callLlmWithFallback<T>(options: LlmCallOptions<T>): Promise<T> {
  const {
    role,
    systemPrompt,
    userPrompt,
    schema,
    fallbackGenerator,
    emitTrace,
    maxTokens = 2048,
    timeoutMs = process.env.LLM_TIMEOUT_MS
      ? Number(process.env.LLM_TIMEOUT_MS)
      : (options.timeoutMs ?? 5000),
  } = options;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = process.env.LLM_MODEL || 'deepseek/deepseek-v4-flash-0731';

  // 1. Missing API Key check
  if (!apiKey || apiKey === 'mock-key' || apiKey.startsWith('your-')) {
    emitTrace?.(`[${role}-FALLBACK] Missing or placeholder OPENAI_API_KEY. Diverting to Deterministic Rule Engine.`);
    return await fallbackGenerator();
  }

  // 2. OpenRouter Execution Attempt
  try {
    emitTrace?.(`[${role}] Dispatching inference request to OpenRouter (${model})...`);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/vda-agent-poc',
        'X-Title': 'VDaAgent PoC',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: maxTokens,
        ...(schema ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`OpenRouter HTTP ${response.status} (${response.statusText}): ${errBody.slice(0, 150)}`);
    }

    const data = (await response.json()) as any;
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent || typeof rawContent !== 'string') {
      throw new Error('Received empty text content from OpenRouter API');
    }

    // Parse and validate with Zod if schema provided
    if (schema) {
      const cleaned = cleanJsonString(rawContent);
      const parsedJson = JSON.parse(cleaned);
      const validated = schema.parse(parsedJson);
      emitTrace?.(`[${role}] Successfully received and validated structured output from LLM.`);
      return validated;
    }

    emitTrace?.(`[${role}] Successfully received response from LLM.`);
    return rawContent as unknown as T;
  } catch (err: any) {
    emitTrace?.(
      `[${role}-FALLBACK] Intercepted LLM error: ${err.message}. Diverting to Deterministic Rule Engine.`
    );
    return await fallbackGenerator();
  }
}
