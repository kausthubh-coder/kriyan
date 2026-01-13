# Kriyan - All-in-One Second Brain

## Vision
Personal productivity app that stores, remembers, retrieves, and reminds. Integrates AI chat with memory, tasks, notes, reminders, calendar, and file indexing.

## Tech Stack
| Component | Technology |
|-----------|------------|
| Web App | Next.js 14+ (App Router), TailwindCSS |
| Android App | Expo with Expo Router |
| Backend | Convex (real-time DB, functions, file storage, vector search) |
| AI Memory | Supermemory (`@supermemory/ai-sdk` for user preferences/facts) |
| AI Models | OpenRouter + Vercel AI SDK (multi-model support) |
| File Storage | Google Drive (indexed in Convex for search) |
| Calendar | Google Calendar (one-way sync: Kriyan → Google) |
| Voice Notes | Android: `@react-native-voice/voice`, Web: Web Speech API (no external API) |
| Package Manager | Bun |

## Core Features (Phase 1)

### 1. Tasks & Reminders
- Create, edit, complete tasks with priority levels
- Recurring tasks (daily, weekly, monthly, custom)
- Multiple reminders per task, alarms
- Sync tasks to Google Calendar
- Semantic search via vector embeddings

### 2. Notes
- Markdown editor with preview
- Voice notes with transcription (native APIs, no cost)
- Auto-vectorized for semantic search
- Tags and organization

### 3. AI Chat
- Multi-model support via OpenRouter
- RAG toggle (search through files/notes for context)
- Supermemory integration for user preferences/facts
- Track metrics: tokens/sec, cost per message
- Agent tools: createTask, createNote, setReminder, searchFiles, getCalendarEvents

### 4. Google Integration
- OAuth for Google Drive + Calendar
- Index Drive files (extract text, generate embeddings)
- One-way calendar sync (tasks → Google Calendar events)

## Database Schema (Convex)

```
tasks: title, description, status, priority, dueDate, recurring, googleCalendarEventId, embedding
notes: title, content, isVoiceNote, audioStorageId, transcription, tags, embedding
reminders: title, taskId?, noteId?, triggerAt, isAlarm, repeat, notified
files: driveFileId, fileName, mimeType, textContent, embedding
threads: title, model, createdAt
messages: threadId, role, content, toolCalls
chatMetrics: threadId, model, promptTokens, completionTokens, responseTimeMs, tokensPerSecond, cost
googleAuth: accessToken, refreshToken, expiresAt
calendarEvents: googleEventId?, taskId?, title, startTime, endTime
```

## Monorepo Structure

```
kriyan/
├── apps/
│   ├── web/                  # Next.js (exists at /web)
│   └── mobile/               # Expo Android (exists at /mobile)
├── packages/
│   ├── convex/               # Shared backend (move from /convex)
│   ├── ai/                   # AI utilities (OpenRouter, tools, embeddings)
│   └── shared/               # Shared types & utils
├── package.json              # Bun workspace root
└── turbo.json                # Turborepo config
```

## Deployment

```
GitHub Push
    ├── Vercel (web) - auto-deploy on main
    ├── Convex Cloud - `bunx convex deploy`
    └── EAS Build (mobile) - manual trigger for APK
```

## Implementation Phases

### Phase 1: Foundation
1. [ ] Set up monorepo structure with Bun workspaces
2. [ ] Configure Convex schema and basic CRUD
3. [ ] Tasks: create, list, complete, delete
4. [ ] Notes: create, edit, markdown support
5. [ ] Reminders: create, trigger notifications

### Phase 2: AI Integration
1. [ ] Set up OpenRouter provider with AI SDK
2. [ ] Chat interface with streaming
3. [ ] Add metrics tracking (tok/s, cost)
4. [ ] Integrate Supermemory for user memory
5. [ ] Implement RAG with Convex vector search

### Phase 3: Agent Tools
1. [ ] createTask tool
2. [ ] createNote tool
3. [ ] setReminder tool
4. [ ] searchFiles tool
5. [ ] getCalendarEvents tool

### Phase 4: Google Integration
1. [ ] OAuth flow for Google
2. [ ] Google Calendar sync (one-way)
3. [ ] Google Drive file listing
4. [ ] File content extraction and indexing

### Phase 5: Voice & Polish
1. [ ] Voice recording (expo-av)
2. [ ] Speech-to-text (native APIs)
3. [ ] Android app UI polish
4. [ ] Web app UI polish

## Future Extensions
- Chrome extension for quick capture
- Desktop app (Electron/Tauri)
- Email integration
- Smart home/automation triggers
- Visual search (CLIP embeddings for images)
