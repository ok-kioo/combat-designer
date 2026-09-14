import type { Conversation, ChatMessageContract } from "../../../modules/llm/domain/entity/chat.js";
import type { ChatRepositoryPort } from "../../../modules/llm/domain/repository/chat-repository-port.js";
import type { PostgresDatabase } from "./database.js";

export class PostgresChatRepository implements ChatRepositoryPort {
  constructor(private readonly db: PostgresDatabase) {}

  public async findConversations(userId: string, workspaceId: string): Promise<Conversation[]> {
    const res = await this.db.query<Conversation>(
      `SELECT id, user_id, workspace_id, title, created_at, updated_at
       FROM conversations
       WHERE user_id = $1 AND workspace_id = $2
       ORDER BY updated_at DESC`,
      [userId, workspaceId]
    );
    return res.rows;
  }

  public async getConversation(conversationId: string, userId: string, workspaceId: string): Promise<Conversation | null> {
    const res = await this.db.query<Conversation>(
      `SELECT id, user_id, workspace_id, title, created_at, updated_at
       FROM conversations
       WHERE id = $1 AND user_id = $2 AND workspace_id = $3`,
      [conversationId, userId, workspaceId]
    );
    return res.rows[0] ?? null;
  }

  public async createConversation(conversation: Conversation): Promise<Conversation> {
    await this.db.query(
      `INSERT INTO conversations (id, user_id, workspace_id, title, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, updated_at = EXCLUDED.updated_at`,
      [
        conversation.id,
        conversation.user_id,
        conversation.workspace_id,
        conversation.title,
        conversation.created_at,
        conversation.updated_at,
      ]
    );
    return conversation;
  }

  public async updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (updates.title !== undefined) {
      values.push(updates.title);
      fields.push(`title = $${values.length}`);
    }
    if (updates.updated_at !== undefined) {
      values.push(updates.updated_at);
      fields.push(`updated_at = $${values.length}`);
    }
    if (!fields.length) return;
    values.push(conversationId);
    await this.db.query(`UPDATE conversations SET ${fields.join(", ")} WHERE id = $${values.length}`, values);
  }

  public async getMessages(
    conversationId: string,
    userId: string,
    workspaceId: string
  ): Promise<ChatMessageContract[]> {
    const conversation = await this.getConversation(conversationId, userId, workspaceId);
    if (!conversation) return [];
    const res = await this.db.query<ChatMessageContract>(
      `SELECT id, conversation_id, workspace_id, role, content, content_format, status, created_at, correlation_id
       FROM chat_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );
    return res.rows;
  }

  public async saveMessage(message: ChatMessageContract): Promise<void> {
    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO chat_messages (id, conversation_id, workspace_id, role, content, content_format, status, created_at, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           content = EXCLUDED.content,
           status = EXCLUDED.status,
           correlation_id = EXCLUDED.correlation_id`,
        [
          message.id,
          message.conversation_id,
          message.workspace_id,
          message.role,
          message.content,
          message.content_format || "markdown",
          message.status,
          message.created_at,
          message.correlation_id || null,
        ]
      );
      await client.query("UPDATE conversations SET updated_at = $1 WHERE id = $2", [
        message.created_at,
        message.conversation_id,
      ]);
    });
  }
}
