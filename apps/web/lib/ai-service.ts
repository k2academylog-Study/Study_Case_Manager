import "server-only";

export function aiServiceBaseUrl() {
  return process.env.AI_SERVICE_URL || (process.env.VERCEL ? undefined : process.env.AI_BACKEND_URL);
}
