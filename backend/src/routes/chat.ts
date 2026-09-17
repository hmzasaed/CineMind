import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ChatOrchestrator } from "../chat/orchestrator.js";
import type { ChatStore } from "../chat/store.js";

const chatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export interface ChatRouteDeps {
  orchestrator: ChatOrchestrator;
  chatStore: ChatStore;
}

export function registerChatRoutes(
  app: FastifyInstance,
  deps: ChatRouteDeps
): void {
  const { orchestrator, chatStore } = deps;

  async function handleChat(
    req: FastifyRequest<{ Body: z.infer<typeof chatRequestSchema> }>,
    reply: FastifyReply
  ) {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "Invalid request body",
        },
      });
    }

    const { message, provider, model } = parsed.data;
    const conversationIdParam = parsed.data.conversationId;
    const userId = req.auth?.userId ?? null;

    // Get or create conversation
    let conv = conversationIdParam ? await chatStore.getConversation(conversationIdParam) : null;
    if (!conv) {
      conv = await chatStore.createConversation({
        userId,
        provider: provider ?? "mock",
        model: model ?? "mock-model",
      });
    }
    const targetConversationId = conv.id;

    // 1. Persist incoming user message
    await chatStore.addMessage({
      conversationId: targetConversationId,
      role: "user",
      content: message,
    });

    // 2. Orchestrate reasoning, tool selection, evidence synthesis & blocks
    const result = await orchestrator.processMessage({
      message,
      conversationId: targetConversationId,
      userId,
      requestId: req.id,
    });

    // 3. Persist assistant response with structured blocks and trace
    const textContent =
      result.blocks.find((b) => b.type === "text")?.content ?? "";
    await chatStore.addMessage({
      conversationId: targetConversationId,
      role: "assistant",
      content: textContent,
      blocks: result.blocks,
      trace: result.trace,
    });

    return reply.status(200).send(result);
  }

  // Mount at both /api/chat and /chat for compatibility
  app.post("/api/chat", handleChat);
  app.post("/chat", handleChat);

  // Conversation history endpoints
  const handleListConversations = async (
    req: FastifyRequest,
    reply: FastifyReply
  ) => {
    const userId = req.auth?.userId ?? null;
    const list = await chatStore.listConversations(userId);
    return reply.send({ conversations: list });
  };

  app.get("/api/chat/conversations", handleListConversations);
  app.get("/chat/conversations", handleListConversations);

  const handleGetConversation = async (
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const conv = await chatStore.getConversation(req.params.id);
    if (!conv) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Conversation not found" },
      });
    }
    const messages = await chatStore.getMessages(req.params.id);
    return reply.send({ conversation: conv, messages });
  };

  app.get("/api/chat/conversations/:id", handleGetConversation);
  app.get("/chat/conversations/:id", handleGetConversation);

  const handleDeleteConversation = async (
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const deleted = await chatStore.deleteConversation(req.params.id);
    if (!deleted) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Conversation not found" },
      });
    }
    return reply.status(204).send();
  };

  app.delete("/api/chat/conversations/:id", handleDeleteConversation);
  app.delete("/chat/conversations/:id", handleDeleteConversation);
}
