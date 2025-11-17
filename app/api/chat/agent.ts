import 'server-only';

import { Experimental_Agent as Agent, stepCountIs } from 'ai';
import { anthropic } from '@/lib/ai-clients';
import { interviewTools } from './tools';

export const mainAgent = new Agent({
    model: anthropic('claude-sonnet-4-5'),
    system: "You are a senior software engineer at a tech giant, conducting interviews with candidates. Read the context and follow the instructions strictly. To begin, start by using the `readFile` function to retrieve `./README.md`.",
    tools: interviewTools,
    stopWhen: stepCountIs(5),
});

