export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function toApiPath(path: string): string {
  if (path.startsWith("/api")) return path;
  return `/api${path}`;
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);

  const isForm =
    typeof options.body !== "undefined" &&
    options.body !== null &&
    !(options.body instanceof FormData) &&
    typeof options.body !== "string";
  if (isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(toApiPath(path), {
    ...options,
    headers,
    credentials: "same-origin",
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string; message?: string };
      message = data.error || data.message || message;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  try {
    return (await res.json()) as T;
  } catch {
    return undefined as T;
  }
}

export const api = {
  get: <T = unknown>(path: string): Promise<T> => apiFetch<T>(path),
  post: <T = unknown>(path: string, body?: unknown): Promise<T> =>
    apiFetch<T>(path, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  patch: <T = unknown>(path: string, body?: unknown): Promise<T> =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  delete: <T = unknown>(path: string): Promise<T> =>
    apiFetch<T>(path, { method: "DELETE" }),
};