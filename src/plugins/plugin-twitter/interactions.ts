// src/plugins/plugin-twitter/interactions.ts
import {
  ExtendedPlugin,
  PluginContext,
  PluginMetadata,
  PluginAction
} from "../../services/plugins/types";

import { TwitterClient } from "./twitter.client";
import debug from "debug";
import { SearchMode } from "agent-twitter-client";

const log = debug("arok:plugin:twitter:interactions");

export class TwitterInteractions implements ExtendedPlugin {
  private client!: TwitterClient;
  private cache!: PluginContext["cacheService"];
  private context!: PluginContext;
  private processedTweets: Set<string> = new Set();
  private pollInterval?: NodeJS.Timeout;
  private readonly POLL_INTERVAL = 60000 * 10; // 10 minute

  metadata: PluginMetadata = {
    name: "twitter_interactions",
    description: "Handles Twitter interactions and mentions",
    version: "1.0.0",
    actions: {
      FETCH_MENTIONS: {
        description: "Fetches recent mentions from Twitter",
        schema: {
          type: "object",
          properties: {
            count: {
              type: "number",
              description: "Number of mentions to fetch",
              required: false
            }
          }
        },
        examples: [
          {
            input: "Fetch latest mentions",
            output: "Found and processed 5 new mentions"
          }
        ]
      }
    }
  };

  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    this.client = TwitterClient.getInstance(context);
    this.cache = this.context.cacheService;
    await this.initializeCache();
    log("Twitter interactions plugin initialized");
  }

  start(): Promise<void> {
    return this.startListening();
  }

  actions: Record<string, PluginAction> = {
    FETCH_MENTIONS: {
      execute: async (data: any) => {
        const count = await this.fetchMentions();
        return { count, timestamp: Date.now() };
      }
    }
  };

  async startListening(interval: number = this.POLL_INTERVAL) {
    log("Starting Twitter interactions polling...");
    await this.fetchMentions();

    this.pollInterval = setInterval(async () => {
      try {
        await this.fetchMentions();
      } catch (error) {
        console.error("Error polling Twitter mentions:", error);
      }
    }, interval);
  }

  async stopListening() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }

  private async initializeCache() {
    const lastMentionId = await this.cache.get("lastMentionId");
    const processedTweets = (await this.cache.get("processedTweets")) || [];

    if (processedTweets.length > 0) {
      this.processedTweets = new Set(processedTweets);
    }

    await this.cache.set(
      "twitter_state",
      {
        lastMentionId,
        lastPollTime: Date.now(),
        processedTweets: Array.from(this.processedTweets)
      },
      {
        type: "twitter_state",
        username: process.env.TWITTER_USERNAME
      }
    );
  }

  async fetchMentions(): Promise<number> {
    try {
      const scraper = this.client.getScraper();
      const lastMentionId = await this.cache.get("lastMentionId");
      const mentions = await scraper.searchTweets(
        `@${process.env.TWITTER_USERNAME!}`,
        20,
        SearchMode.Latest
      );

      let count = 0;
      let newLastMentionId = lastMentionId;

      for await (const mention of mentions) {
        if (!mention.id) {
          continue;
        }
        // Skip if we've already processed this tweet
        if (this.processedTweets.has(mention.id)) {
          continue;
        }

        // Update last mention ID if this is the newest we've seen
        if (!newLastMentionId || mention.id > newLastMentionId) {
          newLastMentionId = mention.id;
        }

        count++;
        const message = this.client.tweetToMessage(mention);
        await this.context.messageBus.publish(message);

        // Mark as processed
        this.processedTweets.add(mention.id);
      }

      // Update cache if we processed any new mentions
      if (count > 0) {
        await this.updateCache(newLastMentionId);
        log("Processed %d new mentions", count);
      }

      return count;
    } catch (error) {
      console.error("Error fetching Twitter mentions:", error);
      return 0;
    }
  }

  private async updateCache(lastMentionId: string) {
    try {
      // Keep a bounded set of processed tweets (e.g., last 1000)
      const processedArray = Array.from(this.processedTweets);
      if (processedArray.length > 1000) {
        processedArray.splice(0, processedArray.length - 1000);
        this.processedTweets = new Set(processedArray);
      }

      // Update cache
      await this.cache.set("lastMentionId", lastMentionId);
      await this.cache.set("processedTweets", processedArray);
      await this.cache.update("twitter_state", {
        lastMentionId,
        lastPollTime: Date.now(),
        processedTweets: processedArray
      });
    } catch (error) {
      console.error("Error updating cache:", error);
    }
  }
}
