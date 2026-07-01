#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

import { spawnSync } from "child_process";

const MQTT_HOST = "192.168.1.200";
const MQTT_USER = "home";
const MQTT_PASS = "palisseril";

const server = new Server(
  { name: "home-automation", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const TOOLS = [
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
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  let cmd = "";

  try {
    if (name === "hometheater_power") {
      cmd = `mosquitto_pub -h ${MQTT_HOST} -t home/hometheater/set -m ${args.state} -u ${MQTT_USER} -P ${MQTT_PASS}`;
    } else if (name === "hometheater_display") {
      cmd = `mosquitto_pub -h ${MQTT_HOST} -t home/hometheater/display -m ${args.state} -u ${MQTT_USER} -P ${MQTT_PASS}`;
    } else if (name === "hometheater_mute") {
      cmd = `mosquitto_pub -h ${MQTT_HOST} -t home/hometheater/mute/set -m ${args.mode} -u ${MQTT_USER} -P ${MQTT_PASS}`;
    } else if (name === "hometheater_volume") {
      const v = parseInt(args.level, 10);
      if (isNaN(v) || v < 0 || v > 100) {
        throw new Error("Invalid volume");
      }
      cmd = `mosquitto_pub -h ${MQTT_HOST} -t home/hometheater/volume/set -m ${v} -u ${MQTT_USER} -P ${MQTT_PASS}`;
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
