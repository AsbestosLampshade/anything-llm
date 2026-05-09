# Chat Memory Behavior: Automatic vs Chat Mode

## Overview
Both `automatic` and `chat` modes use rolling chat history memory, but they differ in **when** and **how** they employ tool calling capabilities.

---

## Flow Diagram

```
POST /v1/workspace/{slug}/chat
    ↓
streamChatWithWorkspace() [server/utils/chats/stream.js:17]
    ├─ Skip: Process slash commands (/reset, etc.)
    │
    ├─ KEY DECISION: Check Agent Flow (grepAgents)
    │   ├─ AUTOMATIC MODE:
    │   │  ├─ Check: workspace.supportsNativeToolCalling()
    │   │  └─ IF SUPPORTED → Enter Agent Flow (tool-calling enabled)
    │   │  └─ IF NOT SUPPORTED → Continue to normal chat (memory only)
    │   │
    │   └─ CHAT MODE:
    │      ├─ Check: Does message contain @agent commands?
    │      └─ IF YES (@agent present) → Enter Agent Flow (tool-calling enabled)
    │      └─ IF NO → Continue to normal chat (memory only)
    │
    ├─ IF Agent Flow Entered: Early Return (agents handle memory differently)
    │
    └─ IF Normal Chat Flow:
       ├─ Fetch recent chat history [stream.js:101-106]
       │  const { rawHistory, chatHistory } = await recentChatHistory({
       │    user, workspace, thread,
       │    messageLimit: workspace?.openAiHistory || 20,
       │  });
       │
       ├─ Determine context (embeddings, pinned docs)
       │
       ├─ Compress messages with history [stream.js:229-236]
       │  const messages = await LLMConnector.compressMessages({
       │    systemPrompt,
       │    userPrompt: updatedMessage,
       │    contextTexts,
       │    chatHistory,        ← MEMORY INCLUDED
       │    attachments,
       │  }, rawHistory);
       │
       └─ Send to LLM with memory
```

---

## Memory Behavior Details

### **AUTOMATIC MODE**

**When Tool Calling is Available:**
```
Message Received → Check Native Tool Support
  ↓
  IF provider supports native tools:
    → Agent Flow Handles Conversation
    → Agents have their own memory management
    → Tools are automatically invoked if needed
    → Chat history is used for context by agent
    
  IF provider does NOT support native tools:
    → Falls back to normal chat flow
    → Rolling memory (20 messages default)
    → No tool calling
```

**Key Code:** [server/utils/chats/agents.js:43-49]
```javascript
if (workspace?.chatMode === "automatic")
  nativeToolingEnabled = await Workspace.supportsNativeToolCalling(workspace);

const agentHandles = WorkspaceAgentInvocation.parseAgents(message);
if (agentHandles.length > 0 || nativeToolingEnabled) {
  // → Enter agent flow
}
```

**Memory in Automatic Mode:**
- ✅ Rolling chat history: **ENABLED** (20 messages or `workspace.openAiHistory`)
- ✅ Tool calling: **AUTO-ENABLED** (if provider supports it)
- 📍 Entry point: Automatic (no need for @agent)

---

### **CHAT MODE**

**When Tool Calling is Available:**
```
Message Received → Check for @agent Commands
  ↓
  IF @agent found in message:
    → Agent Flow Handles Conversation
    → Agents have their own memory management
    → Tools must be explicitly invoked via @agent
    → Chat history is used for context by agent
    
  IF @agent NOT found:
    → Normal chat flow
    → Rolling memory (20 messages default)
    → No tool calling (general LLM knowledge + documents only)
```

**Key Code:** [server/utils/chats/agents.js:43-49]
```javascript
const agentHandles = WorkspaceAgentInvocation.parseAgents(message);
if (agentHandles.length > 0 || nativeToolingEnabled) {
  // Only enters if @agent is explicitly used OR (automatic + tools available)
}
```

**Memory in Chat Mode:**
- ✅ Rolling chat history: **ENABLED** (20 messages or `workspace.openAiHistory`)
- ✅ Tool calling: **MANUAL** (requires @agent prefix, e.g., "@agent search the web")
- 📍 Entry point: Manual (requires @agent command)

---

## Memory Implementation Details

### Chat History Fetching (Both Modes)
[server/utils/chats/index.js]

```javascript
async function recentChatHistory({
  user = null,
  workspace,
  thread = null,
  messageLimit = 20,
  apiSessionId = null,
}) {
  // Fetches previous messages (limited by messageLimit)
  // Returns:
  // - rawHistory: Original message format
  // - chatHistory: Formatted for LLM (converted to role/content pairs)
}
```

### Message Compression (Both Modes)
[server/utils/helpers/chat/index.js:50-189]

Both modes use the same `messageArrayCompressor()` which:

1. **Preserves System Prompt** (highest priority)
2. **Preserves User Prompt** (next highest - can be up to 70% of window)
3. **Compresses History Aggressively** (lowest priority - max 15% of remaining window)

**Token Allocation Strategy:**
```
Total Token Window (e.g., 4K)
├─ Response Buffer: 600 tokens
├─ System Prompt: Full preservation
├─ User Prompt: Up to 70% of window
└─ Chat History: Up to 15% of remaining space (most recent first)
```

---

## Query Mode (For Reference)

**Query Mode:**
- ❌ Chat history: **DISABLED** (does not recall chat history)
- ✅ Only uses document context from vector search
- ✅ Will refuse if no relevant documents found
- 📍 Best for: Knowledge base queries without conversational memory

---

## Code References

| Component | File | Line |
|-----------|------|------|
| Chat Flow Orchestration | `server/utils/chats/stream.js` | 17-300 |
| Agent Detection | `server/utils/chats/agents.js` | 43-100 |
| History Fetching | `server/utils/chats/index.js` | (recentChatHistory) |
| Message Compression | `server/utils/helpers/chat/index.js` | 50-189 |
| OpenAPI Spec | `server/swagger/openapi.json` | `/v1/workspace/{slug}/chat` (POST) |

---

## Summary Table

| Feature | Automatic | Chat | Query |
|---------|-----------|------|-------|
| **Memory (Chat History)** | ✅ Yes (20 msgs default) | ✅ Yes (20 msgs default) | ❌ No |
| **Tool Calling** | 🔄 Auto (if supported) | 🔄 Manual (@agent) | ❌ No |
| **Requires @agent** | ❌ No | ✅ Yes (for tools) | ❌ N/A |
| **Document Search** | ✅ Yes | ✅ Yes | ✅ Yes |
| **LLM General Knowledge** | ✅ Yes | ✅ Yes | ❌ Only if docs found |

---

## Key Takeaway

**Memory Behavior is IDENTICAL** between automatic and chat modes:
- Both fetch recent message history (default 20)
- Both use rolling memory in context window
- Both compress history aggressively if space is needed

**The ONLY difference is HOW they handle tool calling:**
- **Automatic**: Tries to use native tools automatically
- **Chat**: Requires explicit @agent commands for tools
