#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

import { spawnSync } from "child_process";

// 🔒 CONFIG
const PI_HOST = "alfaugus@192.168.1.200";

const ENV_DB = "~/projects/environment_local/sensor_data.db";
const FIT_DB = "~/projects/health_app/fit.db";

// 🧠 SERVER
const server = new Server(
  { name: "allowlist-mcp", version: "4.0.0" },
  { capabilities: { tools: {} } }
);

// 📌 TOOLS
const TOOLS = [

  // =========================
  // BASIC
  // =========================

  {
    name: "ping",
    description: "Resolve a hostname",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string" }
      },
      required: ["host"]
    }
  },

  // =========================
  // ENVIRONMENT
  // =========================

  {
    name: "get_environment",
    description: "Get environment data for last N hours (24, 48, 720)",
    inputSchema: {
      type: "object",
      properties: {
        hours: { type: "string" }
      },
      required: ["hours"]
    }
  },

  // =========================
  // FITNESS
  // =========================

  {
    name: "get_fit_data",
    description: "Get fitness data for last N hours",
    inputSchema: {
      type: "object",
      properties: {
        hours: { type: "string" }
      },
      required: ["hours"]
    }
  }

];

// 📌 TOOL LIST
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// ⚡ EXECUTION
server.setRequestHandler(CallToolRequestSchema, async (req) => {

  const { name, arguments: args } = req.params;

  let cmd = "";

  try {

    // =========================
    // PING
    // =========================

    if (name === "ping") {

      cmd = `getent hosts ${args.host}`;
    }

    // =========================
    // ENVIRONMENT DATA
    // =========================

    else if (name === "get_environment") {

      const hours = parseInt(args.hours, 10);
      const seconds = hours * 3600;

      let downsample = "1";

      if (hours >= 48) {
        downsample = "1200";
      }

      if (hours >= 720) {
        downsample = "3600";
      }

      cmd = `ssh ${PI_HOST} "sqlite3 -json ${ENV_DB} \\
      \\"SELECT ts, parameter, avg
      FROM aggregated_10m
      WHERE ts >= strftime('%s','now') - ${seconds}
      AND (ts % ${downsample} = 0)
      ORDER BY ts ASC;\\""`;
    }

    // =========================
    // FITNESS DATA
    // =========================

    else if (name === "get_fit_data") {

      const hours = parseInt(args.hours, 10);
      const seconds = hours * 3600;

      cmd = `ssh ${PI_HOST} "sqlite3 -json ${FIT_DB} \\
      \\"SELECT start_time, end_time, 'steps' as type, steps as value, NULL as extra
         FROM steps
         WHERE start_time >= strftime('%s','now') - ${seconds}

       UNION ALL

       SELECT start_time, end_time, 'activity' as type, calories as value, distance_m as extra
         FROM activities
         WHERE start_time >= strftime('%s','now') - ${seconds}

       ORDER BY start_time ASC;\\""`;
    }

    else {

      throw new Error("Unknown tool");
    }

    const result = spawnSync(cmd, {
      shell: true,
      encoding: "utf8"
    });

    return {
      content: [{
        type: "text",
        text:
          result.stdout ||
          result.stderr ||
          "OK"
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

// 🚀 START
const transport = new StdioServerTransport();
await server.connect(transport);
