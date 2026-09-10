import type { DirectorChatState, ChatMessage, ToolCallPreview } from "../types/index.js";

export interface DirectorChatProps {
  workspaceId: string;
  initialMessages?: ChatMessage[];
}

export class DirectorChatController {
  public readonly workspaceId: string;
  private state: DirectorChatState;

  constructor(props: DirectorChatProps) {
    this.workspaceId = props.workspaceId;
    this.state = {
      workspaceId: props.workspaceId,
      messages: props.initialMessages ?? [
        {
          id: "msg-welcome",
          role: "system",
          content: `Combat Director connected to workspace [${props.workspaceId}]. Ready for simulation, verification, and changeset proposals.`,
          timestamp: new Date().toISOString(),
        },
      ],
      isWaitingForLlm: false,
    };
  }

  public getState(): DirectorChatState {
    return { ...this.state };
  }

  public addUserMessage(content: string): ChatMessage {
    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    this.state.messages.push(message);
    return message;
  }

  public addAssistantResponse(content: string, toolCalls?: ToolCallPreview[]): ChatMessage {
    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: "assistant",
      content,
      toolCalls,
      timestamp: new Date().toISOString(),
    };
    this.state.messages.push(message);
    return message;
  }

  public renderModel() {
    return {
      column: "right" as const,
      workspaceId: this.workspaceId,
      messageCount: this.state.messages.length,
      messages: this.state.messages,
      isWaiting: this.state.isWaitingForLlm,
    };
  }
}
