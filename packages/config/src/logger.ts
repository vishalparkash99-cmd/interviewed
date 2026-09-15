import { config } from "./config";

type Meta = Record<string, unknown>;

export type Logger = {
  info: (metaOrMessage: Meta | string, messageOrMeta?: string | Meta) => void;
  error: (metaOrMessage: Meta | string, messageOrMeta?: string | Meta) => void;
  warn: (metaOrMessage: Meta | string, messageOrMeta?: string | Meta) => void;
  debug: (metaOrMessage: Meta | string, messageOrMeta?: string | Meta) => void;
};

function normalize(
  metaOrMessage: Meta | string,
  messageOrMeta?: string | Meta
): { message: string; meta: Meta } {
  if (typeof metaOrMessage === "string") {
    if (messageOrMeta === undefined || typeof messageOrMeta === "string") {
      return { message: metaOrMessage, meta: {} };
    }
    return { message: metaOrMessage, meta: messageOrMeta };
  }
  const message = typeof messageOrMeta === "string" ? messageOrMeta : String(messageOrMeta ?? "");
  return { message, meta: metaOrMessage };
}

function formatMessage(level: string, message: string, meta?: Meta): string {
  const entry: Record<string, unknown> = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };
  return JSON.stringify(entry);
}

export function createLogger(module: string): Logger {
  const logLevel = config.getLogLevel();
  const levels: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
  const currentLevel = levels[logLevel] ?? 1;

  function shouldLog(level: string): boolean {
    return (levels[level] ?? 1) >= currentLevel;
  }

  function write(
    level: string,
    metaOrMessage: Meta | string,
    messageOrMeta?: string | Meta
  ): void {
    if (!shouldLog(level)) return;
    const { message, meta } = normalize(metaOrMessage, messageOrMeta);
    const output = formatMessage(level, message, meta);
    if (level === "error") {
      console.error(output);
    } else {
      console.log(output);
    }
  }

  return {
    info: (metaOrMessage, messageOrMeta) => write("info", metaOrMessage, messageOrMeta),
    error: (metaOrMessage, messageOrMeta) => write("error", metaOrMessage, messageOrMeta),
    warn: (metaOrMessage, messageOrMeta) => write("warn", metaOrMessage, messageOrMeta),
    debug: (metaOrMessage, messageOrMeta) => write("debug", metaOrMessage, messageOrMeta),
  };
}

export const logInfo = (message: string, meta?: Meta) => {
  createLogger("default").info(meta ? meta : message, meta ? message : undefined);
};

export const logError = (message: string, meta?: Meta) => {
  createLogger("default").error(meta ? meta : message, meta ? message : undefined);
};