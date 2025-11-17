'use server';
import 'server-only';

import { experimental_generateSpeech as generateSpeech, NoSpeechGeneratedError } from 'ai';
import { openaiAISDK } from '@/lib/ai-clients';

export async function POST(request: Request) {
  try {
    const { text, instructions } = await request.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: 'No text provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { audio } = await generateSpeech({
      model: openaiAISDK.speech('gpt-4o-mini-tts'),
      voice: 'alloy',
      text,
      ...(instructions && { instructions: instructions }),
      speed: 1.2,
    });

    return new Response(new Blob([audio.uint8Array.buffer as ArrayBuffer]), {
      headers: {
        'Content-Type': audio.mediaType,
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    if (NoSpeechGeneratedError.isInstance(error)) {
      const noSpeechGeneratedError = error as NoSpeechGeneratedError;
      return new Response(
        JSON.stringify({ error: noSpeechGeneratedError.cause }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({ error: 'Failed to generate speech' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

