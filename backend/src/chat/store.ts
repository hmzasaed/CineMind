import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config.js";
import type {
  ChatMessageRecord,
  ConversationRecord,
  OperationalTrace,
  ResponseBlock,
} from "./types.js";

export interface CreateConversationInput {
  userId?: string | null;
  title?: string;
  provider: string;
  model: string;
}

export interface AddMessageInput {
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  blocks?: ResponseBlock[];
  trace?: OperationalTrace;
}

export interface ChatStore {
  createConversation(input: CreateConversationInput): Promise<ConversationRecord>;
  getConversation(id: string): Promise<ConversationRecord | null>;
  listConversations(userId?: string | null): Promise<ConversationRecord[]>;
  deleteConversation(id: string): Promise<boolean>;
  addMessage(input: AddMessageInput): Promise<ChatMessageRecord>;
  getMessages(conversationId: string): Promise<ChatMessageRecord[]>;
}

export class InMemoryChatStore implements ChatStore {
  private conversations = new Map<string, ConversationRecord>();
  private messages = new Map<string, ChatMessageRecord[]>();

  async createConversation(input: CreateConversationInput): Promise<ConversationRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const conv: ConversationRecord = {
      id,
      userId: input.userId ?? null,
      title: input.title ?? "New Conversation",
      provider: input.provider,
      model: input.model,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(id, conv);
    this.messages.set(id, []);
    return conv;
  }

  async getConversation(id: string): Promise<ConversationRecord | null> {
    return this.conversations.get(id) ?? null;
  }

  async listConversations(userId?: string | null): Promise<ConversationRecord[]> {
    const list: ConversationRecord[] = [];
    for (const conv of this.conversations.values()) {
      if (conv.status === "archived") continue;
      if (!userId || conv.userId === userId) {
        const msgs = this.messages.get(conv.id) ?? [];
        const lastMsg = msgs[msgs.length - 1];
        list.push({
          ...conv,
          lastMessage: lastMsg?.content?.slice(0, 100),
        });
      }
    }
    return list.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async deleteConversation(id: string): Promise<boolean> {
    const exists = this.conversations.has(id);
    this.conversations.delete(id);
    this.messages.delete(id);
    return exists;
  }

  async addMessage(input: AddMessageInput): Promise<ChatMessageRecord> {
    const msgId = randomUUID();
    const now = new Date().toISOString();
    const msg: ChatMessageRecord = {
      id: msgId,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      blocks: input.blocks,
      trace: input.trace,
      createdAt: now,
    };

    let list = this.messages.get(input.conversationId);
    if (!list) {
      list = [];
      this.messages.set(input.conversationId, list);
    }
    list.push(msg);

    // Update conversation updatedAt and title if it's the first user message
    const conv = this.conversations.get(input.conversationId);
    if (conv) {
      conv.updatedAt = now;
      if (
        conv.title === "New Conversation" &&
        input.role === "user" &&
        input.content.trim()
      ) {
        conv.title =
          input.content.slice(0, 40) + (input.content.length > 40 ? "..." : "");
      }
    }

    return msg;
  }

  async getMessages(conversationId: string): Promise<ChatMessageRecord[]> {
    return this.messages.get(conversationId) ?? [];
  }
}

export function createChatStore(_config: AppConfig): ChatStore {
  return new InMemoryChatStore();
}

