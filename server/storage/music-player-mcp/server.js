#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

import { spawnSync } from "child_process";

const PI_HOST = "alfaugus@192.168.1.200";

const server = new Server(
  { name: "music-player", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: "music_play",
    description: "Play music by genre",
    inputSchema: {
      type: "object",
      properties: {
        genre: { type: "string" }
      },
      required: ["genre"]
    }
  },
  {
    name: "music_pause",
    description: "Pause currently playing music",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "music_resume",
    description: "Resume currently playing music",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "music_skip",
    description: "Skip current track",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "music_stop",
    description: "Stop music playback",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  let cmd = "";

  try {
    if (name === "music_play") {
      const genre = args.genre
        .replace(/"/g, "")
        .replace(/'/g, "");
      cmd = `ssh ${PI_HOST} "~/projects/scripts/music_control.sh play '${genre}'"`;
    } else if (name === "music_pause") {
      cmd = `ssh ${PI_HOST} "~/projects/scripts/music_control.sh pause"`;
    } else if (name === "music_resume") {
      cmd = `ssh ${PI_HOST} "~/projects/scripts/music_control.sh resume"`;
    } else if (name === "music_skip") {
      cmd = `ssh ${PI_HOST} "~/projects/scripts/music_control.sh skip"`;
    } else if (name === "music_stop") {
      cmd = `ssh ${PI_HOST} "~/projects/scripts/music_control.sh stop"`;
    } else {
      throw new Error("Unknown tool");
    }

    const result = spawnSync(cmd, {
      shell: true,
      encoding: "utf8"
    });

    return {
      content: [{
        type: "text",
        text: result.stdout || result.stderr || "OK"
      }]
    };
  } catch (e) {
    return {
      content: [{
        type: "text",
        text: e.message
      }]
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
