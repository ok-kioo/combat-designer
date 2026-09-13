import type { Conversation, ChatMessageContract } from "../entity/chat.js";

export interface ChatRepositoryPort {
  findConversations(userId: string, workspaceId: string): Promise<Conversation[]>;
  getConversation(conversationId: string, userId: string, workspaceId: string): Promise<Conversation | null>;
  createConversation(conversation: Conversation): Promise<Conversation>;
  updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<void>;
  getMessages(conversationId: string, userId: string, workspaceId: string): Promise<ChatMessageContract[]>;
  saveMessage(message: ChatMessageContract): Promise<void>;
}
