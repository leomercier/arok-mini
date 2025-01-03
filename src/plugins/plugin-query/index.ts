import {
  ExtendedPlugin,
  PluginContext,
  PluginMetadata,
  PluginAction,
  ActionExecutionContext
} from "../../services/plugins/types";
import { Message } from "../../types/message.types";
import debug from "debug";

const log = debug("arok:plugin:query");

interface QueryActionData {
  topic: string;
  context?: string;
}

interface QueryActionResult {
  data: string;
  timestamp: number;
}

class QueryAction implements PluginAction<QueryActionData, QueryActionResult> {
  private apiUrl: string;
  private apiToken: string;

  constructor(apiUrl: string, apiToken: string) {
    this.apiUrl = apiUrl;
    this.apiToken = apiToken;
  }

  async execute(
    data: QueryActionData,
    context?: ActionExecutionContext
  ): Promise<QueryActionResult> {
    try {
      const query = data.context ? `${data.topic} ${data.context}` : data.topic;
      log(`Executing query: ${query}`);

      const responseData = await this.fetchData(query);
      log("Query response:", responseData);

      return {
        data: responseData,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error("Error in QUERY action:", error);
      throw error;
    }
  }

  private async fetchData(prompt: string): Promise<string> {
    try {
      const requestData = {
        prompt,
        includeFindings: "true" // Changed to string "true" to match working CURL
      };

      log("Request body:", JSON.stringify(requestData));

      // Log the exact request being made
      log("Making request to:", this.apiUrl);
      log("With headers:", {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json"
      });
      log("With body:", JSON.stringify(requestData));

      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
          Accept: "application/json" // Explicitly request JSON response
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `API request failed: ${response.statusText}. Details: ${errorText}`
        );
      }

      // Get response headers
      const contentType = response.headers.get("content-type");
      log("Response content type:", contentType);

      // Read the response directly as text
      const result = await response.text();
      log("Raw response:", result);

      log("Processed response:", result);

      // Try to parse as JSON if it looks like JSON
      try {
        if (result.trim().startsWith("{") || result.trim().startsWith("[")) {
          const jsonResult = JSON.parse(result);
          return JSON.stringify(jsonResult);
        }
      } catch (e) {
        // If parsing fails, return as-is
        log("Response is not JSON, returning as text");
      }

      return result.trim() || "No data returned from query";
    } catch (error) {
      log("Error fetching data:", error);
      throw error;
    }
  }
}

export class QueryPlugin implements ExtendedPlugin {
  private readonly API_URL = process.env.PLUGIN_QUERY_API_URL as string;
  private readonly API_TOKEN = process.env.PLUGIN_API_TOKEN as string;
  private context?: PluginContext;

  metadata: PluginMetadata = {
    name: "QUERY_KNOWLEDGE",
    description:
      "Retrieves information about various topics, trends and should be used for most specific RAG queries",
    version: "1.0.0",
    actions: {
      QUERY: {
        description: "Get information about any specific topic",
        schema: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              description: "The topic to query about",
              required: true
            },
            context: {
              type: "string",
              description: "Additional context for the query",
              required: false
            }
          }
        },
        examples: [
          {
            input: "Tell me about Base chain activity",
            output: "Retrieving Base chain information..."
          }
        ]
      }
    }
  };

  actions: Record<string, PluginAction> = {
    QUERY: new QueryAction(this.API_URL, this.API_TOKEN)
  };

  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    log("Query plugin initialized");
  }

  async handleMessage?(message: Message): Promise<void> {
    // Optional message handling logic
  }
}
