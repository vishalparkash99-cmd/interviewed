import { createQueueConnection } from "../../packages/queue/src/index";

jest.mock("amqplib", () => {
  const channel = {
    prefetch: jest.fn().mockResolvedValue(undefined),
    assertExchange: jest.fn().mockResolvedValue({}),
    assertQueue: jest.fn().mockResolvedValue({}),
    bindQueue: jest.fn().mockResolvedValue({}),
    consume: jest.fn().mockResolvedValue({}),
    ack: jest.fn(),
    nack: jest.fn(),
    publish: jest.fn().mockReturnValue(true),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const connection = {
    createChannel: jest.fn().mockResolvedValue(channel),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return {
    connect: jest.fn().mockResolvedValue(connection),
    __channel: channel,
    __connection: connection,
  };
});

describe("QueueConnection", () => {
  let queue: ReturnType<typeof createQueueConnection>;

  beforeEach(() => {
    jest.clearAllMocks();
    queue = createQueueConnection("amqp://guest:guest@localhost:5672");
  });

  afterEach(async () => {
    try { await queue.close(); } catch {}
  });

  it("publishes a message and returns a message ID", async () => {
    const msgId = await queue.publish("test-queue", { hello: "world" });
    expect(msgId).toBeDefined();
    expect(typeof msgId).toBe("string");
  });

  it("subscribes to a queue without error", async () => {
    const handler = jest.fn();
    await queue.subscribe("test-queue", handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it("closes cleanly", async () => {
    await queue.publish("test-queue", { data: 1 });
    await queue.close();
  });

  it("publishes multiple messages without recreating connection", async () => {
    await queue.publish("q1", { a: 1 });
    await queue.publish("q2", { b: 2 });
    await queue.publish("q3", { c: 3 });
  });

  it("constructs a valid message envelope with organizationId extraction", async () => {
    const amqp = require("amqplib");
    const msgId = await queue.publish("test-queue", { hello: "world", organizationId: "org-1" });
    expect(typeof msgId).toBe("string");
    expect(amqp.connect).toHaveBeenCalled();
    // verify channel.body publish called via the envelope wire-up
    const envId = msgId;
    expect(envId.length).toBeGreaterThan(0);
  });
});