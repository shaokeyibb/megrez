'use server';
import 'server-only';

import { openaiSDK } from '@/lib/ai-clients';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 使用 OpenAI SDK 进行转录
    const transcription = await openaiSDK.audio.transcriptions.create({
      file: file,
      model: 'gpt-4o-transcribe',
      prompt: 'The following audio is in a tech interview of a candidate.',
    });

    return new Response(
      JSON.stringify({ text: transcription.text }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Transcription error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to transcribe audio' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

