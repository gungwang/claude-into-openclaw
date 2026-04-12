/**
 * Voice / Text-to-Speech Tools (Track E — Advanced Tools)
 *
 * Multi-provider TTS synthesis with lazy-loaded backends.
 * Supports Edge TTS (free), ElevenLabs, OpenAI, and generic HTTP endpoints.
 * Output formats: Opus (.ogg) for voice messages, MP3 for general use.
 *
 * Ported from hermes-agent `tools/tts_tool.py`.
 * Adapted to TypeScript with lazy provider loading and injectable HTTP client.
 */

// ── Types ──

export type TtsProvider = "edge" | "elevenlabs" | "openai" | "minimax" | "generic";

export type TtsConfig = {
  /** Enable TTS tools. Default: false (opt-in). */
  enabled: boolean;
  /** Default TTS provider. Default: "edge". */
  defaultProvider: TtsProvider;
  /** Output format. Default: "mp3". */
  outputFormat: "mp3" | "ogg" | "wav";
  /** Max text length (chars). Default: 4_000. */
  maxTextLength: number;
  /** Output directory for generated audio. */
  outputDir: string;
  /** Provider-specific configs. */
  providers: {
    edge?: EdgeTtsConfig;
    elevenlabs?: ElevenLabsConfig;
    openai?: OpenAiTtsConfig;
    minimax?: MinimaxTtsConfig;
    generic?: GenericTtsConfig;
  };
};

export type EdgeTtsConfig = {
  /** Voice name. Default: "en-US-AriaNeural". */
  voice: string;
};

export type ElevenLabsConfig = {
  apiKey: string;
  voiceId: string;
  modelId: string;
};

export type OpenAiTtsConfig = {
  apiKey: string;
  model: string;
  voice: string;
  baseUrl?: string;
};

export type MinimaxTtsConfig = {
  apiKey: string;
  model: string;
  voiceId: string;
  baseUrl?: string;
};

export type GenericTtsConfig = {
  /** HTTP endpoint for TTS synthesis. */
  endpoint: string;
  /** HTTP method. Default: "POST". */
  method?: string;
  /** Additional headers. */
  headers?: Record<string, string>;
  /** Request body template. Use {{text}} for text substitution. */
  bodyTemplate?: string;
};

export const DEFAULT_TTS_CONFIG: TtsConfig = {
  enabled: false,
  defaultProvider: "edge",
  outputFormat: "mp3",
  maxTextLength: 4_000,
  outputDir: "",
  providers: {
    edge: { voice: "en-US-AriaNeural" },
  },
};

export type TtsResult = {
  ok: boolean;
  /** Path to generated audio file. */
  filePath?: string;
  /** Audio format. */
  format?: string;
  /** Duration in seconds (if known). */
  durationSec?: number;
  /** Provider used. */
  provider: TtsProvider;
  /** Error message if failed. */
  error?: string;
};

// ── TTS engine interface ──

export type TtsEngine = {
  readonly provider: TtsProvider;
  synthesize(text: string, outputPath: string): Promise<TtsResult>;
  isAvailable(): Promise<boolean>;
};

// ── HTTP client interface (injectable for testing) ──

export type HttpClient = {
  post(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<{ ok: boolean; data: Buffer; status: number }>;
};

// ── TTS tool ──

export type TtsTool = {
  /** Synthesize text to speech. */
  synthesize(text: string, provider?: TtsProvider): Promise<TtsResult>;
  /** Check if the configured provider is available. */
  checkAvailability(): Promise<boolean>;
  /** Get the tool definition for LLM registration. */
  getToolDefinition(): { name: string; description: string; parameters: Record<string, unknown> };
};

/**
 * Create a TTS tool with the given config and engine factory.
 */
export function createTtsTool(
  config: TtsConfig,
  engineFactory: (provider: TtsProvider, config: TtsConfig) => TtsEngine,
): TtsTool {
  const engines = new Map<TtsProvider, TtsEngine>();

  function getEngine(provider: TtsProvider): TtsEngine {
    let engine = engines.get(provider);
    if (!engine) {
      engine = engineFactory(provider, config);
      engines.set(provider, engine);
    }
    return engine;
  }

  return {
    async synthesize(text: string, provider?: TtsProvider): Promise<TtsResult> {
      if (!config.enabled) {
        return { ok: false, provider: provider ?? config.defaultProvider, error: "TTS is disabled" };
      }

      if (text.length > config.maxTextLength) {
        return {
          ok: false,
          provider: provider ?? config.defaultProvider,
          error: `Text too long (${text.length} > ${config.maxTextLength})`,
        };
      }

      const selectedProvider = provider ?? config.defaultProvider;
      const engine = getEngine(selectedProvider);

      const timestamp = Date.now().toString(36);
      const outputPath = `${config.outputDir}/tts-${timestamp}.${config.outputFormat}`;

      return engine.synthesize(text, outputPath);
    },

    async checkAvailability(): Promise<boolean> {
      const engine = getEngine(config.defaultProvider);
      return engine.isAvailable();
    },

    getToolDefinition() {
      return {
        name: "text_to_speech",
        description:
          "Convert text to speech audio. Returns a file path to the generated audio.",
        parameters: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "The text to synthesize into speech.",
            },
            provider: {
              type: "string",
              enum: ["edge", "elevenlabs", "openai", "minimax", "generic"],
              description: "TTS provider to use. Defaults to configured provider.",
            },
          },
          required: ["text"],
        },
      };
    },
  };
}

// ── Audio transcription tool ──

export type TranscriptionConfig = {
  /** Enable transcription. Default: false. */
  enabled: boolean;
  /** Provider for transcription. Default: "openai". */
  provider: "openai" | "generic";
  /** OpenAI API key for Whisper. */
  apiKey?: string;
  /** Model name. Default: "whisper-1". */
  model?: string;
  /** Max audio file size (bytes). Default: 25_000_000 (25MB). */
  maxFileSizeBytes?: number;
};

export type TranscriptionResult = {
  ok: boolean;
  text?: string;
  language?: string;
  durationSec?: number;
  error?: string;
};

export function getTranscriptionToolDefinition(): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  return {
    name: "transcribe_audio",
    description: "Transcribe an audio file to text using speech-to-text.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to the audio file to transcribe.",
        },
      },
      required: ["file_path"],
    },
  };
}

// ── Image generation tool ──

export type ImageGenConfig = {
  /** Enable image generation. Default: false. */
  enabled: boolean;
  /** Provider. Default: "openai". */
  provider: "openai" | "generic";
  /** API key. */
  apiKey?: string;
  /** Model name. Default: "dall-e-3". */
  model?: string;
  /** Default image size. Default: "1024x1024". */
  defaultSize?: string;
  /** Output directory. */
  outputDir?: string;
};

export type ImageGenResult = {
  ok: boolean;
  filePath?: string;
  url?: string;
  revisedPrompt?: string;
  error?: string;
};

export function getImageGenToolDefinition(): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  return {
    name: "image_generate",
    description: "Generate an image from a text description using AI.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Description of the image to generate.",
        },
        size: {
          type: "string",
          enum: ["256x256", "512x512", "1024x1024", "1792x1024", "1024x1792"],
          description: "Image size. Default: 1024x1024.",
        },
      },
      required: ["prompt"],
    },
  };
}
