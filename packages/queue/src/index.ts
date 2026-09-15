export type QueueConnectionConfig = {
  url: string;
  prefetchCount?: number;
};

export type QueueMessage = {
  id: string;
  type: string;
  payload: unknown;
  organizationId: string;
  jobId?: string;
  candidateId?: string;
  attemptCount: number;
  maxRetries: number;
  createdAt: Date;
};

export type QueueConsumer = {
  subscribe: (queue: string, handler: (msg: QueueMessage) => Promise<void>) => Promise<void>;
  publish: (queue: string, message: unknown) => Promise<string>;
};

const MAX_DELAY_MS = 30000;

function getBackoffDelay(attemptCount: number): number {
  const delay = Math.min(1000 * Math.pow(2, attemptCount), MAX_DELAY_MS);
  return delay + Math.random() * 1000;
}

export function createQueueConnection(
  url: string,
  config?: { prefetchCount?: number }
): {
  publish: (queue: string, message: unknown) => Promise<string>;
  subscribe: (queue: string, handler: (msg: QueueMessage) => Promise<void>) => Promise<void>;
  close: () => Promise<void>;
} {
  let connection: any = null;
  let channel: any = null;
  let connected = false;

  async function connect(): Promise<void> {
    if (connected && channel) return;
    const amqp = require("amqplib");
    connection = await amqp.connect(url);
    channel = await connection.createChannel();
    if (config?.prefetchCount) {
      await channel.prefetch(config.prefetchCount);
    }
    await channel.assertExchange("interviewed", "topic", { durable: true });
    connected = true;

    connection.on("error", () => {
      connected = false;
      channel = null;
      connection = null;
    });
    connection.on("close", () => {
      connected = false;
      channel = null;
      connection = null;
    });
  }

  return {
    publish: async (queue: string, message: unknown): Promise<string> => {
      await connect();
      if (!connected || !channel) {
        return crypto.randomUUID();
      }
      const id = crypto.randomUUID();
      const organizationId =
        message && typeof message === "object" && "organizationId" in message
          ? (message as any).organizationId
          : "";
      const msg: QueueMessage = {
        id,
        type: queue,
        payload: message,
        organizationId,
        attemptCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
      };
      channel.publish(
        "interviewed",
        queue,
        Buffer.from(JSON.stringify(msg)),
        {
          persistent: true,
          messageId: id,
          contentType: "application/json",
        }
      );
      return id;
    },
    subscribe: async (queue: string, handler: (msg: QueueMessage) => Promise<void>): Promise<void> => {
      await connect();
      if (!connected || !channel) return;

      const deadLetterQueue = `${queue}.dead-letter`;
      const deadLetterExchange = "interviewed.dlx";

      await channel.assertExchange(deadLetterExchange, "topic", { durable: true });
      await channel.assertQueue(deadLetterQueue, { durable: true });
      await channel.bindQueue(deadLetterQueue, deadLetterExchange, queue);
      await channel.assertQueue(queue, {
        durable: true,
        arguments: {
          "x-dead-letter-exchange": deadLetterExchange,
          "x-dead-letter-routing-key": queue,
        },
      });
      await channel.bindQueue(queue, "interviewed", queue);

      await channel.consume(queue, async (msg: any) => {
        if (!msg) return;
        try {
          const data: QueueMessage = JSON.parse(msg.content.toString());
          await handler(data);
          channel.ack(msg);
        } catch {
          const data: QueueMessage = JSON.parse(msg.content.toString());
          const attempts = (data.attemptCount || 0) + 1;
          if (attempts < (data.maxRetries || 3)) {
            const delay = getBackoffDelay(attempts);
            const updatedMsg = { ...data, attemptCount: attempts };
            setTimeout(() => {
              if (channel) {
                channel.publish(
                  "interviewed",
                  queue,
                  Buffer.from(JSON.stringify(updatedMsg)),
                  { persistent: true, contentType: "application/json" }
                );
              }
            }, delay);
            channel.ack(msg);
          } else {
            channel.nack(msg, false, false);
          }
        }
      });
    },
    close: async (): Promise<void> => {
      try {
        if (channel) {
          await channel.close();
        }
        if (connection) {
          await connection.close();
        }
      } catch {
        // ignore
      } finally {
        channel = null;
        connection = null;
        connected = false;
      }
    },
  };
}
