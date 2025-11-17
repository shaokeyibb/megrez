import 'server-only';

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import OpenAI from 'openai';

// Anthropic 客户端（用于聊天 Agent）
export const anthropic = createAnthropic({
  baseURL: 'https://api.openai-proxy.org/anthropic/v1',
});

// OpenAI AI SDK 客户端（用于语音生成）
export const openaiAISDK = createOpenAI({
  baseURL: 'https://api.openai-proxy.org/v1/',
});

// OpenAI 官方 SDK 客户端（用于音频转录）
export const openaiSDK = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai-proxy.org/v1/',
});

