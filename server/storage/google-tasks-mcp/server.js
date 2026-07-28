#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import { readFileSync, existsSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREDS_DIR = path.join(__dirname, "credentials");
const TOKEN_PATH = path.join(CREDS_DIR, "token.json");
const CREDENTIALS_PATH = path.join(CREDS_DIR, "credentials.json");

let tasksService = null;

async function getService() {
  if (tasksService) return tasksService;

  if (!existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      "credentials.json not found. Download OAuth 2.0 Client ID (Desktop app) from Google Cloud Console " +
      "and place it at google-tasks-mcp/credentials/credentials.json"
    );
  }

  const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
  const { client_id, client_secret } = credentials.installed || credentials.web;

  if (!existsSync(TOKEN_PATH)) {
    throw new Error(
      "No token cached. Run setup-auth.js on your host machine first to authorize."
    );
  }

  const tokens = JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
  const redirectUri = "http://localhost:3000";

  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
  oauth2Client.setCredentials(tokens);

  oauth2Client.on("tokens", (newTokens) => {
    const updated = { ...tokens, ...newTokens };
    writeFileSync(TOKEN_PATH, JSON.stringify(updated, null, 2));
  });

  tasksService = google.tasks({ version: "v1", auth: oauth2Client });
  return tasksService;
}

const server = new Server(
  { name: "google-tasks-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: "google_list_tasklists",
    description: "List all Google Task lists. Returns tasklist ID, title, and last updated time.",
    inputSchema: {
      type: "object",
      properties: {
        max_results: { type: "integer", description: "Max tasklists (default 100)" }
      },
      required: []
    }
  },
  {
    name: "google_list_tasks",
    description: "List tasks in a Google Task list. Returns ID, title, status, due date, and notes preview.",
    inputSchema: {
      type: "object",
      properties: {
        tasklist_id: { type: "string", description: "The tasklist ID from google_list_tasklists" },
        show_completed: { type: "boolean", description: "Include completed tasks (default false)" },
        show_hidden: { type: "boolean", description: "Include hidden tasks (default false)" },
        due_min: { type: "string", description: "RFC 3339 min due date, e.g. 2026-07-01T00:00:00Z" },
        due_max: { type: "string", description: "RFC 3339 max due date" },
        max_results: { type: "integer", description: "Max tasks (default 100)" }
      },
      required: ["tasklist_id"]
    }
  },
  {
    name: "google_get_task",
    description: "Get full details of a single task including notes/description.",
    inputSchema: {
      type: "object",
      properties: {
        tasklist_id: { type: "string" },
        task_id: { type: "string" }
      },
      required: ["tasklist_id", "task_id"]
    }
  },
  {
    name: "google_create_task",
    description: "Create a new task in a Google Task list.",
    inputSchema: {
      type: "object",
      properties: {
        tasklist_id: { type: "string", description: "Tasklist ID to create in" },
        title: { type: "string", description: "Task title" },
        notes: { type: "string", description: "Optional notes/description" },
        due: { type: "string", description: "Optional due date in RFC 3339 (e.g. 2026-07-25T17:00:00Z)" }
      },
      required: ["tasklist_id", "title"]
    }
  },
  {
    name: "google_update_task",
    description: "Update an existing task. Only provide fields to change.",
    inputSchema: {
      type: "object",
      properties: {
        tasklist_id: { type: "string" },
        task_id: { type: "string" },
        title: { type: "string" },
        notes: { type: "string" },
        due: { type: "string", description: "RFC 3339 date, or empty string to clear" },
        status: { type: "string", enum: ["needsAction", "completed"] }
      },
      required: ["tasklist_id", "task_id"]
    }
  },
  {
    name: "google_complete_task",
    description: "Mark a task as completed.",
    inputSchema: {
      type: "object",
      properties: {
        tasklist_id: { type: "string" },
        task_id: { type: "string" }
      },
      required: ["tasklist_id", "task_id"]
    }
  },
  {
    name: "google_delete_task",
    description: "Permanently delete a task.",
    inputSchema: {
      type: "object",
      properties: {
        tasklist_id: { type: "string" },
        task_id: { type: "string" }
      },
      required: ["tasklist_id", "task_id"]
    }
  },
  {
    name: "google_add_workout",
    description: "Add a workout to the 'Workout' exercise task. Appends to notes with timestamp. Defaults to 'Workout' task and auto-discovers the tasklist. If no matching task exists, creates one.",
    inputSchema: {
      type: "object",
      properties: {
        tasklist_id: { type: "string", description: "Optional tasklist ID (auto-discovered from first available list if omitted)" },
        title: { type: "string", description: "Title of the exercise task (default: 'Workout')" },
        workout: { type: "string", description: "Workout details to append to the task notes, e.g. '5 pushups, 3 pullups, 10 squats'" },
        due: { type: "string", description: "Optional due date in RFC 3339 for new tasks (e.g. 2026-07-25T17:00:00Z)" }
      },
      required: ["workout"]
    }
  }
];

function formatTask(t) {
  return {
    id: t.id,
    title: t.title || "(no title)",
    status: t.status || "needsAction",
    due: t.due || null,
    notes: t.notes ? t.notes.substring(0, 200) + (t.notes.length > 200 ? "..." : "") : null,
    updated: t.updated
  };
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    const service = await getService();

    if (name === "google_list_tasklists") {
      const res = await service.tasklists.list({ maxResults: args?.max_results || 100 });
      const lists = (res.data.items || []).map(l => ({ id: l.id, title: l.title, updated: l.updated }));
      return { content: [{ type: "text", text: JSON.stringify(lists, null, 2) }] };
    }

    if (name === "google_list_tasks") {
      const params = { tasklist: args.tasklist_id, maxResults: args.max_results || 100 };
      if (!args.show_completed) params.showCompleted = false;
      if (args.show_hidden) params.showHidden = true;
      if (args.due_min) params.dueMin = args.due_min;
      if (args.due_max) params.dueMax = args.due_max;
      const res = await service.tasks.list(params);
      const tasks = (res.data.items || []).map(formatTask);
      return { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }] };
    }

    if (name === "google_get_task") {
      const res = await service.tasks.get({ tasklist: args.tasklist_id, task: args.task_id });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }

    if (name === "google_create_task") {
      const body = { title: args.title };
      if (args.notes) body.notes = args.notes;
      if (args.due) body.due = args.due;
      const res = await service.tasks.insert({ tasklist: args.tasklist_id, requestBody: body });
      return { content: [{ type: "text", text: `Created task ${res.data.id}: "${res.data.title}"` }] };
    }

    if (name === "google_update_task") {
      const existing = await service.tasks.get({ tasklist: args.tasklist_id, task: args.task_id });
      const body = { ...existing.data };
      if (args.title !== undefined) body.title = args.title;
      if (args.notes !== undefined) body.notes = args.notes;
      if (args.due !== undefined) body.due = args.due || undefined;
      if (args.status !== undefined) body.status = args.status;
      const res = await service.tasks.update({
        tasklist: args.tasklist_id, task: args.task_id, requestBody: body
      });
      return { content: [{ type: "text", text: `Updated task ${args.task_id}: "${res.data.title}"` }] };
    }

    if (name === "google_complete_task") {
      const existing = await service.tasks.get({ tasklist: args.tasklist_id, task: args.task_id });
      const body = { ...existing.data, status: "completed" };
      await service.tasks.update({
        tasklist: args.tasklist_id, task: args.task_id, requestBody: body
      });
      return { content: [{ type: "text", text: `Marked task ${args.task_id} as completed` }] };
    }

    if (name === "google_add_workout") {
      const title = args.title || "Workout";

      let tasklistId = args.tasklist_id;
      if (!tasklistId) {
        const lists = await service.tasklists.list({ maxResults: 1 });
        const first = (lists.data.items || [])[0];
        if (!first) throw new Error("No tasklists found in your Google Tasks account");
        tasklistId = first.id;
      }

      const existing = await service.tasks.list({
        tasklist: tasklistId,
        maxResults: 5,
        showCompleted: false
      });
      const match = (existing.data.items || []).find(
        t => t.title && t.title.toLowerCase() === title.toLowerCase()
      );

      if (match) {
        const existingNotes = match.notes || "";
        const timestamp = new Date().toLocaleString("en-US", {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
        });
        const workoutEntry = `\n${timestamp}: ${args.workout}`;
        const updatedNotes = existingNotes + workoutEntry;
        const res = await service.tasks.update({
          tasklist: tasklistId,
          task: match.id,
          requestBody: { ...match, notes: updatedNotes }
        });
        return {
          content: [{
            type: "text",
            text: `Added workout to "${res.data.title}". New notes:\n${res.data.notes}`
          }]
        };
      } else {
        const body = { title, notes: args.workout };
        if (args.due) body.due = args.due;
        const res = await service.tasks.insert({
          tasklist: tasklistId,
          requestBody: body
        });
        return {
          content: [{
            type: "text",
            text: `Created new task "${res.data.title}" with workout: ${args.workout}`
          }]
        };
      }
    }

    if (name === "google_delete_task") {
      await service.tasks.delete({ tasklist: args.tasklist_id, task: args.task_id });
      return { content: [{ type: "text", text: `Deleted task ${args.task_id}` }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${e.message}` }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
