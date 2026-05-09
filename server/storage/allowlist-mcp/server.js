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

const MQTT_HOST = "192.168.1.200";
const MQTT_USER = "home";
const MQTT_PASS = "palisseril";

// 🧠 SERVER
const server = new Server(
  { name: "allowlist-mcp", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

// 📌 TOOLS
const TOOLS = [
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

  {
    name: "hometheater_power",
    description: "Turn hometheater ON or OFF",
    inputSchema: {
      type: "object",
      properties: {
        state: {
          type: "string",
          enum: ["ON", "OFF"]
        }
      },
      required: ["state"]
    }
  },

  {
    name: "hometheater_display",
    description: "Turn display on/off",
    inputSchema: {
      type: "object",
      properties: {
        state: {
          type: "string",
          enum: ["on", "off"]
        }
      },
      required: ["state"]
    }
  },

  {
    name: "hometheater_mute",
    description: "Mute or unmute",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["mute", "unmute"]
        }
      },
      required: ["mode"]
    }
  },

  {
    name: "hometheater_volume",
    description: "Set volume 0-100",
    inputSchema: {
      type: "object",
      properties: {
        level: { type: "string" }
      },
      required: ["level"]
    }
  },

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

    // 🔹 PING
    if (name === "ping") {
      cmd = `getent hosts ${args.host}`;
    }

    // 🔹 MQTT CONTROLS
    else if (name === "hometheater_power") {
      cmd = `mosquitto_pub -h ${MQTT_HOST} -t home/hometheater/set -m ${args.state} -u ${MQTT_USER} -P ${MQTT_PASS}`;
    }

    else if (name === "hometheater_display") {
      cmd = `mosquitto_pub -h ${MQTT_HOST} -t home/hometheater/display -m ${args.state} -u ${MQTT_USER} -P ${MQTT_PASS}`;
    }

    else if (name === "hometheater_mute") {
      cmd = `mosquitto_pub -h ${MQTT_HOST} -t home/hometheater/mute/set -m ${args.mode} -u ${MQTT_USER} -P ${MQTT_PASS}`;
    }

    else if (name === "hometheater_volume") {
      const v = parseInt(args.level, 10);
      if (isNaN(v) || v < 0 || v > 100) throw new Error("Invalid volume");
      cmd = `mosquitto_pub -h ${MQTT_HOST} -t home/hometheater/volume/set -m ${v} -u ${MQTT_USER} -P ${MQTT_PASS}`;
    }

    // 🔹 ENV DATA
    else if (name === "get_environment") {
      const hours = parseInt(args.hours, 10);
      const seconds = hours * 3600;

      let downsample = "1"; // default

      if (hours >= 48) downsample = "1200";     // 20 min
      if (hours >= 720) downsample = "3600";    // hourly

      cmd = `ssh ${PI_HOST} "sqlite3 -json ${ENV_DB} \\
      \\"SELECT ts, parameter, avg 
      FROM aggregated_10m 
      WHERE ts >= strftime('%s','now') - ${seconds}
      AND (ts % ${downsample} = 0)
      ORDER BY ts ASC;\\""`;
    }

    // 🔹 FIT DATA
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

    const result = spawnSync(cmd, { shell: true });

    return {
      content: [{
        type: "text",
        text:
          result.stdout?.toString() ||
          result.stderr?.toString() ||
          "OK"
      }]
    };

  } catch (e) {
    return {
      content: [{ type: "text", text: e.message }]
    };
  }
});

// 🚀 START
const transport = new StdioServerTransport();
await server.connect(transport);
