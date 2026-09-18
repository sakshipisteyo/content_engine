/**
 * ElevenLabs provider. The ONLY place @elevenlabs/elevenlabs-js is imported.
 * speak() -> synthesises `text` with `voiceId` and returns the audio bytes.
 */
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { requireEnv } from "../config";
import { streamToBuffer } from "../media";

let client: ElevenLabsClient | null = null;
function getClient(): ElevenLabsClient {
  if (!client) client = new ElevenLabsClient({ apiKey: requireEnv("ELEVENLABS_API_KEY") });
  return client;
}

export interface SpeakOptions {
  model: string;
  outputFormat?: string;
}

/** Text-to-speech. Returns the raw audio buffer (mp3/wav per outputFormat). */
export async function speak(
  text: string,
  voiceId: string,
  opts: SpeakOptions,
): Promise<Buffer> {
  const audio = await getClient().textToSpeech.convert(voiceId, {
    text,
    modelId: opts.model,
    outputFormat: opts.outputFormat as never,
  });
  return streamToBuffer(audio as unknown as ReadableStream<Uint8Array>);
}
