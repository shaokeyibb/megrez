'use server';
import 'server-only';

import { validateUIMessages, UIMessage } from 'ai';
import { randomUUID } from 'crypto';
import { mainAgent } from './agent';
import { pendingAuthenticityVerifications } from './tools';

export async function POST(request: Request) {
    const { messages }: { messages: UIMessage[] } = await request.json();

    const verificationContents: string[] = [];
    if (pendingAuthenticityVerifications.length) {
        const processed = pendingAuthenticityVerifications.splice(0);

        for (const verification of processed) {
            if ('answer' in verification) {
                const { confidence, reason, answer } = verification.answer;
                verificationContents.push(
                    `Authenticity verification result: ID: ${verification.id}\n` +
                    `Confidence: ${confidence}\n` +
                    `Reason: ${reason}\n` +
                    `Answer: ${answer}`
                );
            } else {
                verificationContents.push(
                    `Authenticity verification error: ID: ${verification.id}\n` +
                    `Error: ${verification.error}`
                );
            }
        }
    }

    const allMessages: UIMessage[] = [...messages, ...verificationContents.map(content => ({
        id: randomUUID(),
        role: 'assistant' as const,
        parts: [{
            type: 'text' as const,
            text: content,
        }]
    }))];

    return mainAgent.respond({
        messages: await validateUIMessages({ messages: allMessages }),
    });
}

