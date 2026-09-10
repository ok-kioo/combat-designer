/**
 * Gemini Provider — Concrete implementation of LlmProvider
 * using the @google/genai SDK (Gemini API).
 *
 * Uses gemini-3.7-flash model with function calling support.
 */

import { GoogleGenAI, Type } from "@google/genai";
import type {
  LlmProvider,
  LlmChatRequest,
  LlmTurnResult,
  LlmToolDeclaration,
} from "../../../modules/llm/domain/port/llm-provider.js";

const MODEL = "gemini-3.7-flash";

function mapTypeString(typeStr: string): string {
  switch (typeStr) {
    case "string": return Type.STRING;
    case "number": return Type.NUMBER;
    case "integer": return Type.INTEGER;
    case "boolean": return Type.BOOLEAN;
    case "array": return Type.ARRAY;
    case "object": return Type.OBJECT;
    default: return Type.STRING;
  }
}

function convertToolDeclarations(tools: LlmToolDeclaration[]) {
  return tools.map((tool) => {
    const properties: Record<string, any> = {};
    for (const [key, prop] of Object.entries(tool.parameters.properties)) {
      const converted: any = {
        type: mapTypeString(prop.type),
        description: prop.description,
      };
      if (prop.items) {
        converted.items = { type: mapTypeString(prop.items.type) };
      }
      if (prop.enum) {
        converted.enum = prop.enum;
      }
      properties[key] = converted;
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: Type.OBJECT,
        properties,
        required: tool.parameters.required || [],
      },
    };
  });
}

export class GeminiProvider implements LlmProvider {
  private readonly ai: GoogleGenAI;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        "GEMINI_API_KEY is required. Set it via constructor argument or process.env.GEMINI_API_KEY."
      );
    }
    this.ai = new GoogleGenAI({ apiKey: key });
  }

  async chat(request: LlmChatRequest): Promise<LlmTurnResult> {
    const functionDeclarations = convertToolDeclarations(request.tools);

    // Build the contents array for multi-turn conversation
    const contents: Array<{ role: string; parts: any[] }> = [];

    // Add conversation history if provided
    if (request.history) {
      for (const msg of request.history) {
        const parts: any[] = [];
        for (const part of msg.parts) {
          if (part.text) {
            parts.push({ text: part.text });
          }
          if (part.functionCall) {
            parts.push({
              functionCall: {
                name: part.functionCall.name,
                args: part.functionCall.args,
              },
            });
          }
          if (part.functionResponse) {
            parts.push({
              functionResponse: {
                name: part.functionResponse.name,
                response: part.functionResponse.result,
              },
            });
          }
        }
        contents.push({ role: msg.role, parts });
      }
    }

    // Add the current user message or tool results
    if (request.tool_results && request.tool_results.length > 0) {
      // Send function responses back to the model
      const parts = request.tool_results.map((tr) => ({
        functionResponse: {
          name: tr.name,
          response: tr.result,
        },
      }));
      contents.push({ role: "user", parts });
    } else {
      // Regular user message
      contents.push({
        role: "user",
        parts: [{ text: request.user_message }],
      });
    }

    const response = await this.ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: request.system_prompt,
        tools: [{ functionDeclarations }],
      },
    });

    // Extract function calls if any
    const functionCalls = (response.functionCalls || []).map((fc: any) => ({
      name: fc.name,
      args: fc.args || {},
      id: fc.id,
    }));

    const text = response.text || null;
    const finished = functionCalls.length === 0;

    return { text, function_calls: functionCalls, finished };
  }
}
