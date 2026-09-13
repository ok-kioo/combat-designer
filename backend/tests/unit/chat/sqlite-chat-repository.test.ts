import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteChatRepository } from "../../../src/infrastructure/provider/chat/sqlite-chat-repository.js";

describe("SPEC 14 — SQLite Persistent Chat Repository", () => {
  let repo: SqliteChatRepository;

  beforeEach(() => {
    repo = new SqliteChatRepository(":memory:");
  });

  afterEach(() => {
    repo.close();
  });

  it("UX.CHAT.1 & UX.CHAT.2: persists conversations and messages", async () => {
    const conv = await repo.createConversation({
      id: "conv-1",
      user_id: "user-1",
      workspace_id: "ws-1",
      title: "Balanceamento de Heavy Kick",
      created_at: "2026-09-10T10:00:00.000Z",
      updated_at: "2026-09-10T10:00:00.000Z",
    });

    expect(conv.id).toBe("conv-1");

    await repo.saveMessage({
      id: "msg-1",
      conversation_id: "conv-1",
      workspace_id: "ws-1",
      role: "user",
      content: "Qual o startup do Heavy Kick?",
      content_format: "markdown",
      status: "completed",
      created_at: "2026-09-10T10:00:05.000Z",
    });

    await repo.saveMessage({
      id: "msg-2",
      conversation_id: "conv-1",
      workspace_id: "ws-1",
      role: "assistant",
      content: "O startup é de 14 frames.",
      content_format: "markdown",
      status: "completed",
      created_at: "2026-09-10T10:00:08.000Z",
    });

    const messages = await repo.getMessages("conv-1", "user-1", "ws-1");
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe("Qual o startup do Heavy Kick?");
    expect(messages[1].content).toBe("O startup é de 14 frames.");
  });

  it("UX.CHAT.3 & UX.CHAT.4: strictly enforces workspace and user isolation", async () => {
    await repo.createConversation({
      id: "conv-alice",
      user_id: "alice",
      workspace_id: "ws-secret",
      title: "Alice Secret",
      created_at: "2026-09-10T10:00:00.000Z",
      updated_at: "2026-09-10T10:00:00.000Z",
    });

    await repo.saveMessage({
      id: "msg-alice",
      conversation_id: "conv-alice",
      workspace_id: "ws-secret",
      role: "user",
      content: "Top secret strategy",
      content_format: "markdown",
      status: "completed",
      created_at: "2026-09-10T10:00:05.000Z",
    });

    // Bob cannot list Alice's conversations in the same workspace
    const bobConvs = await repo.findConversations("bob", "ws-secret");
    expect(bobConvs).toHaveLength(0);

    // Alice cannot see this conversation in a different workspace
    const diffWsConvs = await repo.findConversations("alice", "ws-other");
    expect(diffWsConvs).toHaveLength(0);

    // Bob cannot read messages from Alice's conversation
    const bobMessages = await repo.getMessages("conv-alice", "bob", "ws-secret");
    expect(bobMessages).toHaveLength(0);

    // Alice cannot read messages if specifying the wrong workspace
    const wrongWsMessages = await repo.getMessages("conv-alice", "alice", "ws-other");
    expect(wrongWsMessages).toHaveLength(0);
  });
});
