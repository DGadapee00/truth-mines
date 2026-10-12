/** The Worker's address as built into the page. It is not a secret (the secret is typed on each device). */
export const DEFAULT_WORKER_URL: string = (import.meta.env.VITE_WORKER_URL as string | undefined) ?? '';
