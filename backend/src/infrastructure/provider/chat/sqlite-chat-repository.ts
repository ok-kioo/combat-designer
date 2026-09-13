import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { Conversation, ChatMessageContract } from "../../../modules/llm/domain/entity/chat.js";
import type { ChatRepositoryPort } from "../../../modules/llm/domain/repository/chat-repository-port.js";

export class SqliteChatRepository implements ChatRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(dbPath: string = ":memory:") {
    if (dbPath !== ":memory:") {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_user_workspace
        ON conversations(user_id, workspace_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        content_format TEXT NOT NULL DEFAULT 'markdown',
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        correlation_id TEXT,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
        ON chat_messages(conversation_id, created_at ASC);
    `);
  }

  public async findConversations(userId: string, workspaceId: string): Promise<Conversation[]> {
    const stmt = this.db.prepare(
      `SELECT id, user_id, workspace_id, title, created_at, updated_at
       FROM conversations
       WHERE user_id = ? AND workspace_id = ?
       ORDER BY updated_at DESC`
    );
    const rows = stmt.all(userId, workspaceId) as unknown as Conversation[];
    return rows.map((r) => ({
      id: String(r.id),
      user_id: String(r.user_id),
      workspace_id: String(r.workspace_id),
      title: String(r.title),
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
    }));
  }

  public async getConversation(
    conversationId: string,
    userId: string,
    workspaceId: string
  ): Promise<Conversation | null> {
    const stmt = this.db.prepare(
      `SELECT id, user_id, workspace_id, title, created_at, updated_at
       FROM conversations
       WHERE id = ? AND user_id = ? AND workspace_id = ?`
    );
    const row = stmt.get(conversationId, userId, workspaceId) as unknown as Conversation | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      user_id: String(row.user_id),
      workspace_id: String(row.workspace_id),
      title: String(row.title),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }

  public async createConversation(conversation: Conversation): Promise<Conversation> {
    const stmt = this.db.prepare(
      `INSERT INTO conversations (id, user_id, workspace_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      conversation.id,
      conversation.user_id,
      conversation.workspace_id,
      conversation.title,
      conversation.created_at,
      conversation.updated_at
    );
    return conversation;
  }

  public async updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.title !== undefined) {
      fields.push("title = ?");
      values.push(updates.title);
    }
    if (updates.updated_at !== undefined) {
      fields.push("updated_at = ?");
      values.push(updates.updated_at);
    }

    if (fields.length === 0) return;

    values.push(conversationId);
    const sql = `UPDATE conversations SET ${fields.join(", ")} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values as any);
  }

  public async getMessages(
    conversationId: string,
    userId: string,
    workspaceId: string
  ): Promise<ChatMessageContract[]> {
    // Validate that conversation belongs to authenticated user and workspace
    const conv = await this.getConversation(conversationId, userId, workspaceId);
    if (!conv) {
      return [];
    }

    const stmt = this.db.prepare(
      `SELECT id, conversation_id, workspace_id, role, content, content_format, status, created_at, correlation_id
       FROM chat_messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC`
    );
    const rows = stmt.all(conversationId) as unknown as ChatMessageContract[];
    return rows.map((r) => ({
      id: String(r.id),
      conversation_id: String(r.conversation_id),
      workspace_id: String(r.workspace_id),
      role: r.role as "user" | "assistant" | "system",
      content: String(r.content),
      content_format: "markdown",
      status: r.status as "pending" | "streaming" | "completed" | "error" | "cancelled",
      created_at: String(r.created_at),
      correlation_id: r.correlation_id ? String(r.correlation_id) : undefined,
    }));
  }

  public async saveMessage(message: ChatMessageContract): Promise<void> {
    const stmt = this.db.prepare(
      `INSERT INTO chat_messages (id, conversation_id, workspace_id, role, content, content_format, status, created_at, correlation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      message.id,
      message.conversation_id,
      message.workspace_id,
      message.role,
      message.content,
      message.content_format || "markdown",
      message.status,
      message.created_at,
      message.correlation_id || null
    );

    // Bump conversation updated_at
    const bumpStmt = this.db.prepare(
      `UPDATE conversations SET updated_at = ? WHERE id = ?`
    );
    bumpStmt.run(message.created_at, message.conversation_id);
  }

  public close(): void {
    this.db.close();
  }
}
