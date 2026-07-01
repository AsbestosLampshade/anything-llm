#!/usr/bin/env python3
"""Vikunja MCP Server — stdio JSON-RPC 2.0 bridge for AnythingLLM agents. Stdlib only."""

import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

_CFG_BASE = Path("/app/vikunja-config") if Path("/app/vikunja-config").exists() else Path.home() / ".config/waybar/scripts/vikunja"
CONFIG_FILE = _CFG_BASE / "config.json"
TOKEN_FILE = _CFG_BASE / ".token"

VIKUNJA_BASE = os.environ.get("VIKUNJA_URL", "http://192.168.1.10:3456")
API = f"{VIKUNJA_BASE}/api/v1"

_CACHED_TOKEN = None

def load_config():
    if CONFIG_FILE.exists():
        return json.loads(CONFIG_FILE.read_text())
    return {}

def _request(method, path, token, data=None):
    url = f"{API}{path}"
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, (json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8") if e.fp else "{}"
        raise RuntimeError(f"HTTP {e.code}: {body}")

def auth_by_login(username, password):
    _, data = _request("POST", "/login", None, {"username": username, "password": password, "long_token": True})
    return data["token"]

def get_token():
    global _CACHED_TOKEN
    cfg = load_config()
    if cfg.get("api_token"):
        return cfg["api_token"]
    if cfg.get("username") and cfg.get("password"):
        _CACHED_TOKEN = auth_by_login(cfg["username"], cfg["password"])
        return _CACHED_TOKEN
    raise RuntimeError("No Vikunja auth configured")

def api_call(method, path, data=None):
    global _CACHED_TOKEN
    token = _CACHED_TOKEN or get_token()
    try:
        status, body = _request(method, path, token, data)
        return body
    except RuntimeError as e:
        if "401" in str(e):
            _CACHED_TOKEN = None
            token = get_token()
            status, body = _request(method, path, token, data)
            return body
        raise

def send(id, result):
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": id, "result": result}) + "\n")
    sys.stdout.flush()

def send_error(id, message):
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": id, "error": {"message": message}}) + "\n")
    sys.stdout.flush()

TOOLS = [
    {"name": "vikunja_list_tasks", "description": "List all pending (undone) tasks from Vikunja.", "inputSchema": {"type": "object", "properties": {}, "required": []}},
    {"name": "vikunja_get_task", "description": "Get full details of a single task by ID.", "inputSchema": {"type": "object", "properties": {"task_id": {"type": "integer"}}, "required": ["task_id"]}},
    {"name": "vikunja_create_task", "description": "Create a new task. Requires project_id and title.", "inputSchema": {"type": "object", "properties": {"project_id": {"type": "integer"}, "title": {"type": "string"}, "description": {"type": "string"}, "due_date": {"type": "string", "description": "YYYY-MM-DD"}, "priority": {"type": "integer"}, "labels": {"type": "array", "items": {"type": "string"}}}, "required": ["project_id", "title"]}},
    {"name": "vikunja_update_task", "description": "Update a task. Mark done, change title/description/due date.", "inputSchema": {"type": "object", "properties": {"task_id": {"type": "integer"}, "title": {"type": "string"}, "description": {"type": "string"}, "due_date": {"type": "string", "description": "YYYY-MM-DD"}, "done": {"type": "boolean"}, "priority": {"type": "integer"}}, "required": ["task_id"]}},
    {"name": "vikunja_list_projects", "description": "List all projects with their IDs.", "inputSchema": {"type": "object", "properties": {}, "required": []}},
    {"name": "vikunja_get_labels", "description": "List all available labels/tags with their IDs.", "inputSchema": {"type": "object", "properties": {}, "required": []}},
]

def handle_tool_call(name, args):
    try:
        if name == "vikunja_list_tasks":
            tasks = api_call("GET", "/tasks")
            undone = [t for t in tasks if not t.get("done")]
            result = []
            for t in undone:
                labels = [l["title"] for l in (t.get("labels") or [])]
                result.append({"id": t["id"], "title": t["title"], "due_date": (t.get("due_date") or "")[:10], "priority": t.get("priority", 0), "project_id": t.get("project_id"), "labels": labels})
            return json.dumps(result, indent=2)
        elif name == "vikunja_get_task":
            return json.dumps(api_call("GET", f"/tasks/{args['task_id']}"), indent=2, default=str)
        elif name == "vikunja_create_task":
            pid = args["project_id"]
            payload = {"title": args["title"]}
            for f in ["description", "due_date", "priority"]:
                if f in args:
                    payload[f] = f"{args[f]}T00:00:00Z" if f == "due_date" else args[f]
            if "labels" in args:
                all_labels = api_call("GET", "/labels")
                label_ids = []
                for rl in args["labels"]:
                    for l in all_labels:
                        if l["title"].lower() == rl.lower():
                            label_ids.append({"id": l["id"]}); break
                if label_ids:
                    payload["labels"] = label_ids
            task = api_call("PUT", f"/projects/{pid}/tasks", data=payload)
            return f"Created task #{task['id']}: {task['title']}"
        elif name == "vikunja_update_task":
            tid = args["task_id"]
            payload = {}
            for f in ["title", "description", "due_date", "done", "priority"]:
                if f in args:
                    payload[f] = f"{args[f]}T00:00:00Z" if f == "due_date" else args[f]
            api_call("POST", f"/tasks/{tid}", data=payload)
            return f"Updated task #{tid}"
        elif name == "vikunja_list_projects":
            projects = api_call("GET", "/projects")
            return json.dumps([{"id": p["id"], "title": p["title"]} for p in projects], indent=2)
        elif name == "vikunja_get_labels":
            labels = api_call("GET", "/labels")
            return json.dumps([{"id": l["id"], "title": l["title"]} for l in labels], indent=2)
        return f"Unknown tool: {name}"
    except Exception as e:
        return f"Error: {e}"

def main():
    import threading
    threading.Thread(target=lambda: time.sleep(2**31), daemon=True).start()
    buffer = ""
    for line in sys.stdin:
        buffer += line
        try:
            msg = json.loads(buffer); buffer = ""
        except json.JSONDecodeError:
            continue
        mid = msg.get("id"); method = msg.get("method", ""); params = msg.get("params", {})
        try:
            if method == "ping":
                send(mid, {})
            elif method == "initialize":
                send(mid, {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": {"name": "vikunja-mcp", "version": "1.0.0"}})
            elif method == "tools/list":
                send(mid, {"tools": TOOLS})
            elif method == "tools/call":
                result_text = handle_tool_call(params.get("name"), params.get("arguments", {}))
                send(mid, {"content": [{"type": "text", "text": result_text}]})
            elif method in ("notifications/initialized", "notifications/cancelled"):
                pass
        except Exception as e:
            send_error(mid, str(e))

if __name__ == "__main__":
    main()
