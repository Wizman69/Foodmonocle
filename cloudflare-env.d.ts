interface FoodMonocleImageBinding {
  input(stream: ReadableStream): {
    transform(options: Record<string, unknown>): {
      output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
    };
  };
}

interface FoodMonocleEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: FoodMonocleImageBinding;
  FOODMONOCLE_OWNER_HMAC_SECRET?: string;
}

declare namespace Cloudflare {
  interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    IMAGES: FoodMonocleImageBinding;
    FOODMONOCLE_OWNER_HMAC_SECRET?: string;
  }
}
