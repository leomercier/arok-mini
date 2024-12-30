// src/index.ts

import { config } from "dotenv";
import express from "express";
// Load environment variables
config();
import { CharacterLoader } from "./services/character.loader";
import { AgentService } from "./services/agent.service";

import debug from "debug";

const log = debug("arok:init");

// plugins

import { QueryPlugin } from "./plugins/plugin-query";
import {
  TwitterTweetsPlugin,
  TwitterRepliesPlugin,
  TwitterInteractions
} from "./plugins/plugin-twitter";

import { APIPlugin } from "./plugins/plugin-api";

import OpenAI from "openai";

async function startServer() {
  try {
    // Initialize Express app
    const app = express();
    const PORT = process.env.PORT || 8080;

    app.use(express.json());

    // Load character configuration
    const characterLoader = new CharacterLoader();
    const character = await characterLoader.loadCharacter("default");
    log(`Loaded character: ${character.name}`);

    const openaiConfig = {
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: "https://oai.helicone.ai/v1",
      defaultHeaders: {
        "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`
      },
      model: "gpt-4-turbo-preview"
    };

    const togetherAiConfig = {
      apiKey: process.env.TOGETHER_API_KEY,
      baseURL: `https://together.helicone.ai/v1/${process.env.HELICONE_API_KEY}`,
      model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo"
    };

    const llmInstance = new OpenAI(togetherAiConfig);

    const agent = new AgentService({
      characterConfig: character,
      llmInstance,
      llmInstanceModel: togetherAiConfig.model
    });

    // Register plugins
    // await agent.registerPlugin(new QueryPlugin());
    // await agent.registerPlugin(new TwitterRepliesPlugin());
    // await agent.registerPlugin(new TwitterTweetsPlugin());
    await agent.registerPlugin(new APIPlugin({ app }));
    // await agent.registerPlugin(new TwitterInteractions());

    console.log("Clients started successfully");
    // Basic health check endpoint
    app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Start the server
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
      console.log("Environment:", process.env.NODE_ENV || "development");
    });

    await agent.start();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown handling
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Starting graceful shutdown...");
  // Add cleanup logic here if needed
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received. Starting graceful shutdown...");
  // Add cleanup logic here if needed
  process.exit(0);
});

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Start the server
startServer().catch((error) => {
  console.error("Failed to start application:", error);
  process.exit(1);
});