#!/usr/bin/env node

// 🔥 HARD keep-alive (this is what fixes your issue)
setInterval(() => {}, 1 << 30);

process.stdin.setEncoding("utf8");

let buffer = "";

// Send helper
function send(id, result) {
  process.stdout.write(JSON.stringify({
    jsonrpc: "2.0",
    id,
    result
  }) + "\n");
}

function handleMessage(msg) {
  const { id, method, params } = msg;

  if (method === "initialize") {
    return send(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: {
        name: "local-secure-tools",
        version: "1.0.0"
      }
    });
  }

  if (method === "initialized") return;

  if (method === "tools/list") {
    return send(id, {
      tools: [
        {
          name: "test_tool",
          description: "Simple MCP test tool",
          input_schema: {
            type: "object",
            properties: {},
            required: []
          }
        }
      ]
    });
  }

  if (method === "tools/call") {
    const name = params?.name;

    if (name === "test_tool") {
      return send(id, {
        content: [
          { type: "text", text: "MCP WORKING 🎉" }
        ]
      });
    }

    return send(id, {
      content: [
        { type: "text", text: `Unknown tool: ${name}` }
      ]
    });
  }
}

// Read stdin
process.stdin.on("data", (chunk) => {
  buffer += chunk;

  const lines = buffer.split("\n");
  buffer = lines.pop();

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const msg = JSON.parse(line);
      handleMessage(msg);
    } catch {}
  }
});

// also keep stdin open
process.stdin.resume();
