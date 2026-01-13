# Kriyan - Personal Second Brain

## Vision
Personal productivity app that stores, remembers, retrieves, and reminds. Integrates AI chat with memory, tasks, notes, reminders, calendar, and file indexing. **Single-user app** (no auth required).

## Tech Stack
| Component | Technology |
|-----------|------------|
| Web App | Next.js 14+ (App Router), TailwindCSS (custom components) |
| Android App | Expo with Expo Router |
| Backend | Convex (real-time DB, functions, vector search, cron jobs) |
| **AI Agent** | **`@convex-dev/agent`** - Threads, messages, tool calling, streaming, usage tracking |
| **RAG** | **`@convex-dev/rag`** - Chunking, embeddings, semantic search with filters |
| **Notes Sync** | **`@convex-dev/prosemirror-sync`** - Real-time sync + AI can edit notes server-side |
| **Undo/Redo** | **`convex-timeline`** - Undo/redo state management for notes editor |
| AI Models | OpenRouter + Vercel AI SDK (multi-model support) |
| Notes Editor | TipTap (block-based editor like Notion) |
| File Storage | **Google Drive** (all files), Convex storage (note images only) |
| Calendar | Google Calendar (one-way sync: Kriyan -> Google) |
| Voice Recording | `expo-audio` (mobile), Web Audio API (web) |
| Speech-to-Text | Whisper API via OpenRouter |
| Push Notifications | `expo-notifications` + Expo Push Service |
| Package Manager | Bun |

## Convex Components

### 1. `@convex-dev/agent` - REQUIRED
**Repository**: https://github.com/get-convex/agent
**Docs**: https://docs.convex.dev/agents

Core building block for AI chat:
- **Threads & Messages**: Persistent conversation history with automatic context
- **Tool Calling**: Built-in support for createTask, createNote, setReminder tools
- **Streaming**: WebSocket-based streaming - all clients stay in sync
- **RAG Integration**: Built-in hybrid vector/text search
- **Usage Tracking**: Per-model cost tracking
- **Rate Limiting**: Prevents API abuse

### 2. `@convex-dev/rag` - REQUIRED
**Repository**: https://github.com/get-convex/rag
**Docs**: https://convex.dev/components/rag

Semantic search across all content:
- **Add Content**: Automatic chunking and embedding
- **Semantic Search**: Vector-based search with configurable models
- **Namespaces**: Organize content (all-content, per-type)
- **Filtered Search**: Filter by tags, sourceType
- **Chunk Context**: Get surrounding chunks for better results

### 3. `@convex-dev/prosemirror-sync` - REQUIRED
**Repository**: https://github.com/get-convex/prosemirror-sync
**Docs**: https://convex.dev/components/prosemirror-sync

Real-time notes sync + AI editing:
- **Real-time Sync**: Multiple tabs/devices stay in sync
- **Server-side Transforms**: AI can edit documents from Convex actions
- **TipTap Support**: Works with `useTiptapSync` hook
- **Debounced Snapshots**: Efficient auto-save

### 4. `convex-timeline` - RECOMMENDED
**Repository**: https://github.com/MeshanKhosla/convex-timeline
**Docs**: https://convex.dev/components/timeline

Undo/redo for notes:
- **Undo/Redo**: Navigate through state history
- **Checkpoints**: Named snapshots that persist
- **Automatic Pruning**: Configurable limits

### Components NOT Needed for MVP
- **`@convex-dev/persistent-text-streaming`**: Agent already handles streaming
- **`convex-fs`**: Google Drive is our primary storage
- **`@gilhrpenner/convex-files-control`**: No access control needed for single-user

---

## Core Features

### 1. Tags System (Universal)
Tags apply to ALL entities: tasks, notes, files, voice notes
- Stored as string arrays on each document (denormalized for performance)
- Separate `tags` table for autocomplete and management
- Tag colors and icons (optional)
- Filter/search by tags across all content types

### 2. Tasks
- Create, edit, complete, delete tasks
- **Tags** for organization
- Due dates and time
- Subtasks support
- Sync to Google Calendar
- Semantic search via RAG

### 3. Reminders
- Single reminder system (not multiple per task)
- **Recurrence patterns**: daily, weekly, monthly, yearly, custom
- Convex cron jobs for checking due reminders
- Push notifications via Expo Push Service
- Local scheduling with `expo-notifications` triggers

### 4. Notes (Block-Based with TipTap)
- **TipTap editor** with prosemirror-sync for real-time sync
- Block types: paragraph, heading, list, checklist, code, quote, image, divider
- Slash commands for block insertion
- **Tags** for organization
- Auto-vectorized for semantic search
- AI can edit notes via server-side transforms
- Images stored in Convex storage (small files)

### 5. Voice Notes
- Dedicated voice notes section
- Recording via `expo-audio` (mobile) and Web Audio API (web)
- Speech-to-text via Whisper API (OpenRouter)
- **Tags** for organization
- Transcription indexed in RAG
- Audio stored in Google Drive

### 6. AI Chat
- Multi-model support via OpenRouter
- `@convex-dev/agent` handles threads, messages, streaming
- `@convex-dev/rag` for semantic search context
- Usage metrics tracking (tokens, cost)
- Agent tools: createTask, createNote, setReminder, searchContent, editNote

### 7. Files & Content Ingestion
All files stored in **Google Drive** (except note images in Convex)

**Supported Content Types**:
| Type | Processing | Description Generation |
|------|-----------|----------------------|
| PDFs | `pdfjs-dist` (browser) | Extract text directly |
| Images | Store in Drive | GPT-4o vision API for description |
| Word docs | `mammoth.js` (browser) | Extract text directly |
| PowerPoint | Extract as images | GPT-4o vision for each slide |
| YouTube links | YouTube Transcript API | Get captions |
| Web links | `@mozilla/readability` | Extract article content |
| GitHub repos | GitHub API | README + file structure |

**Flow**: Upload → Store in Drive → Extract/Describe → Vectorize → Index in RAG

### 8. Google Integration
- OAuth for Google Drive + Calendar
- **Google Drive**: Primary file storage for everything
- **Google Calendar**: One-way sync (Kriyan → Google)
- Pull files from Drive for viewing

---

## Storage Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STORAGE STRATEGY                                    │
└─────────────────────────────────────────────────────────────────────────────┘

GOOGLE DRIVE (Primary - All Files)          CONVEX STORAGE (Note Images Only)
├── PDFs                                     └── Images embedded in notes
├── Images                                       (small files for fast loading)
├── Documents
├── Audio (voice recordings)
├── Presentations
└── Any uploaded file

                    ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONVEX DATABASE (Metadata + Extracted Text)              │
│  • files table: driveFileId, fileName, extractedText, tags                  │
│  • notes table: metadata (content in prosemirror-sync)                      │
│  • All other tables: tasks, reminders, tags, settings, etc.                 │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    @convex-dev/rag (Vector Store)                           │
│  • Chunked text with embeddings from all content                            │
│  • Filtered by sourceType (task, note, voiceNote, file) and tags           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Component Tables (Managed Automatically)
- `@convex-dev/agent`: threads, messages, usage metrics
- `@convex-dev/rag`: chunks, embeddings, entries
- `@convex-dev/prosemirror-sync`: snapshots, steps
- `convex-timeline`: nodes, checkpoints

### Application Tables

**settings** - Single row, no auth needed
- expoPushToken, openrouterApiKey, defaultModel, theme

**tags**
- name (unique), color, icon, usageCount
- Index: by_name

**tasks**
- title, description, status (pending/completed/archived)
- tags[], dueDate, dueTime, parentTaskId (subtasks)
- googleCalendarEventId, createdAt, updatedAt
- Indexes: by_status, by_dueDate, by_parent

**reminders**
- title, taskId?, noteId?, triggerAt
- isRecurring, recurrenceRule (frequency, interval, daysOfWeek, etc.)
- isAlarm, notified, snoozedUntil
- scheduledFunctionId, localNotificationId
- Indexes: by_triggerAt, by_notified

**notes** (metadata only - content in prosemirror-sync)
- title, tags[], createdAt, updatedAt
- Index: by_updatedAt

**voiceNotes**
- title, driveFileId (audio in Drive), durationMs
- transcription, transcriptionStatus
- tags[], createdAt
- Index: by_createdAt

**files** (Google Drive primary)
- fileName, mimeType, fileSize
- driveFileId (required), driveWebViewLink
- textContent (extracted), extractionStatus
- sourceType (upload/youtube/webpage/github), sourceUrl
- tags[], createdAt
- Indexes: by_createdAt, by_sourceType, by_extractionStatus

**noteImages** (Convex storage for note embeds)
- noteId, storageId, fileName, mimeType
- description (from GPT-4o vision)
- Index: by_noteId

**googleAuth**
- accessToken, refreshToken, expiresAt, scope

**calendarEvents**
- googleEventId, taskId?, reminderId?
- title, startTime, endTime, synced
- Indexes: by_googleEventId, by_task, by_reminder

---

## Implementation Phases (Parallel Workstreams)

The phases are organized so **multiple developers can work simultaneously** on different parts:
- **Backend Team**: Convex functions, schema, components
- **Web Team**: Next.js UI, TipTap editor
- **Mobile Team**: Expo app, notifications, voice recording

### Phase 1: Foundation (Week 1-2)

#### Backend Team
- Set up Convex project with `bunx convex dev`
- Install all components: agent, rag, prosemirror-sync, timeline
- Create complete schema (all tables)
- Implement settings CRUD
- Implement tags CRUD with autocomplete query
- Set up Google OAuth flow
- Store/refresh Google tokens

#### Web Team
- Set up Next.js with TailwindCSS
- Create base UI components: Button, Input, Modal, Card, Badge, Dropdown
- Create dashboard layout with sidebar navigation
- Create settings page UI

#### Mobile Team
- Set up Expo project with Expo Router
- Create base UI components (React Native versions)
- Create tab navigation structure
- Request notification permissions
- Register Expo push token

**Testing**: Each team tests their own work. Integration testing when backend APIs are ready.

---

### Phase 2: Tasks & Reminders (Week 2-3)

#### Backend Team
- Tasks CRUD (create, read, update, delete, complete)
- Subtasks support (parentTaskId)
- Reminders CRUD with recurrence logic
- Cron job for checking due reminders
- Push notification action (Expo Push Service)
- Index tasks in RAG on create/update
- Google Calendar sync (create/update/delete events)

#### Web Team
- Tasks list view with filters (status, tags, due date)
- Task create/edit modal
- Task detail view with subtasks
- Reminders list and create/edit UI
- Calendar view (optional)

#### Mobile Team
- Tasks list screen
- Task create/edit screen
- Reminders list screen
- Local notification scheduling
- Handle notification tap (deep linking)

**Testing**: Create tasks on web, verify on mobile. Create reminder, verify notification fires.

---

### Phase 3: Notes & Editor (Week 3-4)

#### Backend Team
- Set up prosemirror-sync API endpoints
- Notes metadata CRUD
- Timeline setup for undo/redo
- Index note content in RAG
- Note image upload to Convex storage
- Image description via GPT-4o vision API

#### Web Team
- TipTap editor setup with prosemirror-sync
- `useTiptapSync` hook integration
- Slash commands for block insertion
- Image upload in editor (to Convex storage)
- Notes list with preview
- Tag assignment UI
- Undo/redo toolbar buttons

#### Mobile Team
- Notes list screen
- Simple note editor (may use web view for TipTap or native editor)
- Tag assignment

**Testing**: Create note on web, verify sync on mobile. Upload image, verify description generated. Test undo/redo.

---

### Phase 4: Voice Notes & Transcription (Week 4-5)

#### Backend Team
- Voice note metadata CRUD
- Whisper transcription action (OpenRouter API)
- Upload audio to Google Drive
- Index transcription in RAG on completion
- Status updates (pending → processing → completed)

#### Web Team
- Voice recording UI with Web Audio API
- Recording controls (start, stop, pause)
- Playback from Google Drive
- Transcription display
- Voice notes list

#### Mobile Team
- Voice recording with `expo-audio`
- `useAudioRecorder` hook integration
- Recording UI with waveform
- Playback with `useAudioPlayer`
- Upload to backend

**Testing**: Record on mobile, verify transcription, search for transcribed content.

---

### Phase 5: File Upload & Content Ingestion (Week 5-6)

#### Backend Team
- File upload to Google Drive
- Content extraction actions:
  - YouTube transcript fetching
  - Web article extraction (readability)
  - GitHub repo indexing
- Image description generation (GPT-4o vision)
- Index extracted content in RAG
- Extraction status tracking

#### Web Team
- File upload UI (drag & drop)
- Link input for YouTube/web/GitHub
- Files list with extraction status
- File preview (open in Drive viewer)
- Search UI across all content

#### Mobile Team
- File picker integration
- Link input
- Files list view

**Testing**: Upload PDF, verify text extracted and searchable. Add YouTube link, verify transcript indexed.

---

### Phase 6: AI Chat (Week 6-7)

#### Backend Team
- Agent setup with all tools:
  - createTask, updateTask, completeTask
  - createNote, editNote (server-side transform)
  - setReminder
  - searchContent (RAG)
  - getUpcomingTasks, getUpcomingReminders
- Streaming with saveStreamDeltas
- Usage tracking handler
- Thread management

#### Web Team
- Chat interface UI
- Message list with streaming display
- Chat input with send button
- Thread list/selector
- Usage metrics display (optional)

#### Mobile Team
- Chat screen
- Message display
- Input handling

**Testing**: Ask AI to create task, verify task created. Ask AI to search notes, verify RAG results. Ask AI to edit a note, verify content updated.

---

### Phase 7: Polish & Integration (Week 7-8)

#### Backend Team
- Error handling and edge cases
- Performance optimization
- Rate limiting setup
- Batch operations for existing content indexing

#### Web Team
- Responsive design
- Loading states and error handling
- Keyboard shortcuts
- PWA setup (optional)

#### Mobile Team
- Offline handling
- Deep linking from notifications
- App icon and splash screen
- Performance optimization

#### All Teams
- Unit tests for Convex functions
- Component tests for UI
- Integration tests for critical flows
- Bug fixes and polish

---

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| No auth (single user) | Personal app, simplifies architecture |
| Custom Tailwind components | Full control, no UI library dependencies |
| Google Drive = all file storage | No file size limits, accessible anywhere |
| Convex storage = note images only | Fast loading for embedded images |
| Tags on everything | Universal organization system |
| prosemirror-sync for notes | AI can edit notes, real-time sync |
| GPT-4o vision for images | Generate searchable descriptions |
| Client-side PDF/doc parsing | Convex has memory limits |
| Server-side image/link parsing | Vision API and fetch work in actions |
| One-way Calendar sync | Avoids conflict resolution complexity |
| Design for future memory | Can add user memory system later |

---

## Environment Variables

**Convex Dashboard** (bunx convex env set):
- `OPENROUTER_API_KEY` - For AI models and Whisper
- `GOOGLE_CLIENT_ID` - OAuth
- `GOOGLE_CLIENT_SECRET` - OAuth

**Web (.env.local)**:
- `NEXT_PUBLIC_CONVEX_URL` - Convex deployment URL

**Mobile (.env)**:
- `EXPO_PUBLIC_CONVEX_URL` - Convex deployment URL

---

## Project Structure

```
kriyan/
├── web/                        # Next.js web app
│   ├── app/
│   │   ├── (dashboard)/       # Main app layout
│   │   │   ├── tasks/
│   │   │   ├── notes/
│   │   │   ├── voice/
│   │   │   ├── files/
│   │   │   ├── chat/
│   │   │   ├── search/
│   │   │   └── settings/
│   │   └── api/               # OAuth callbacks
│   ├── components/
│   │   ├── ui/                # Base components
│   │   ├── editor/            # TipTap components
│   │   ├── tasks/
│   │   ├── notes/
│   │   ├── chat/
│   │   └── layout/
│   └── lib/
│
├── mobile/                     # Expo Android app
│   ├── app/                   # Expo Router
│   ├── components/
│   │   ├── ui/
│   │   ├── voice/
│   │   └── notifications/
│   └── lib/
│
├── convex/                     # Convex backend
│   ├── convex.config.ts       # Component registration
│   ├── schema.ts              # Database schema
│   ├── crons.ts               # Scheduled jobs
│   ├── http.ts                # HTTP routes
│   │
│   ├── # Core CRUD
│   ├── tasks.ts
│   ├── notes.ts
│   ├── voiceNotes.ts
│   ├── reminders.ts
│   ├── files.ts
│   ├── tags.ts
│   ├── settings.ts
│   │
│   ├── # AI & Search
│   ├── agent.ts               # Agent setup + tools
│   ├── rag.ts                 # RAG indexing
│   ├── notesSync.ts           # prosemirror-sync API
│   │
│   ├── # Integrations
│   ├── google.ts              # OAuth + Drive + Calendar
│   ├── extraction.ts          # Content extraction
│   ├── transcription.ts       # Whisper API
│   └── notifications.ts       # Push notifications
│
└── tests/
    ├── convex/
    └── web/
```

---

## UI/UX Design System

### Design Philosophy
- **Dark theme** as default (deep blacks and grays)
- **Glass morphism** - Frosted glass effects with backdrop blur, subtle borders, transparency
- **Minimal & focused** - Content-first, reduce visual clutter
- **Context-aware interactions** - UI adapts based on user intent

### Color Palette
```
Background:       #0a0a0f (near black)
Surface:          #12121a (cards, panels)
Glass:            rgba(255, 255, 255, 0.05) with backdrop-blur-xl
Glass Border:     rgba(255, 255, 255, 0.1)
Glass Hover:      rgba(255, 255, 255, 0.08)
Primary:          #8b5cf6 (violet)
Primary Glow:     rgba(139, 92, 246, 0.3)
Accent:           #06b6d4 (cyan for links/nodes)
Success:          #22c55e
Warning:          #f59e0b
Error:            #ef4444
Text Primary:     #fafafa
Text Secondary:   #a1a1aa
Text Muted:       #52525b
```

### Typography
- **Font**: Inter or Geist (system font stack fallback)
- **Headings**: Semi-bold, tracking tight
- **Body**: Regular weight, good line height for readability
- **Monospace**: JetBrains Mono for code blocks

### Glass Morphism Components
```css
/* Base glass card */
.glass-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
}

/* Interactive glass button */
.glass-button {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  transition: all 0.2s ease;
}
.glass-button:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
}

/* Input fields */
.glass-input {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(8px);
}
```

---

## Web App Pages & Layout

### Navigation Structure
- **Sidebar** (collapsible) with icon + label navigation
- Pages: Dashboard (Home), Tasks, Chat, Files, Settings
- Active page indicator with glow effect

### Page 1: Dashboard (Main - Memory Graph)

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│  [Sidebar]  │           MEMORY GRAPH                        │
│             │    ┌─────────────────────────────────┐        │
│  🏠 Home    │    │                                 │        │
│  ✓ Tasks    │    │   Interactive node graph        │        │
│  💬 Chat    │    │   showing notes, files, tasks   │        │
│  📁 Files   │    │   with connections/links        │        │
│  ⚙ Settings │    │                                 │        │
│             │    └─────────────────────────────────┘        │
│             │                                               │
│             │    ┌─────────────────────────────────┐        │
│             │    │  [Model ▾] [RAG ◉] [🎤]         │        │
│             │    │  Type anything...          [↑]  │        │
│             │    └─────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

**Memory Graph** (using d3-force or react-force-graph):
- Nodes represent: Notes, Tasks, Files, Voice Notes
- Node colors by type (different hues)
- Edges show semantic relationships (from RAG embeddings)
- Click node → opens detail panel
- Zoom & pan controls
- Search/filter to highlight specific nodes

**Smart Input Box** (bottom of page):
- Glass morphism design, always visible
- **Controls**:
  - Model selector dropdown (favorite models, search)
  - RAG toggle (on/off for context retrieval)
  - Voice button (hold to record)
  - Send button

**Context-Aware Behavior**:
| Input Type | Detection | UI Response |
|------------|-----------|-------------|
| Task/Reminder | "remind me", "add task", due date keywords | Expands into mini-modal, shows confirmation toast |
| Question/Chat | Question marks, "what", "how", "explain" | Navigates to Chat page with new thread |
| Search | "find", "search", "where is" | Shows search results in overlay |
| Note creation | "note:", "remember that" | Expands to quick note capture |

**Confirmation Toast** (for quick actions):
- Slides up from bottom
- Shows: "Task added: Calc homework" with undo button
- Auto-dismisses after 3 seconds

---

### Page 2: Tasks

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│ TASKS                                    [+ New Task]       │
├─────────────────────────────────────────────────────────────┤
│ [Today] [Upcoming] [Calendar] [All]           [🔍 Search]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ☐ Calc homework                      📅 Mon, Jan 13 │   │
│  │   #school #math                            🔔 9am   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ☐ Submit project proposal            📅 Wed, Jan 15 │   │
│  │   #work                                    🔔 2pm   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**View Toggles**:
- **Today**: Tasks due today, overdue tasks
- **Upcoming**: Next 7 days grouped by date
- **Calendar**: Month view with task dots
- **All**: All tasks with status filter

**Task Card** (glass card):
- Checkbox (animated on complete)
- Title
- Tags (colored badges)
- Due date + time
- Reminder indicator (bell icon)
- Click → expands to detail view

**Task Detail View** (slide-in panel or modal):
```
┌─────────────────────────────────────────┐
│ ← Back                     [⋮ Options]  │
├─────────────────────────────────────────┤
│ ☐ Calc homework                         │
│                                         │
│ 📅 Due: Monday, Jan 13 at 9:00 AM       │
│ 🔔 Reminder: Same day, 9:00 AM          │
│ 🏷️ #school #math                        │
├─────────────────────────────────────────┤
│ DESCRIPTION (TipTap Editor)             │
│ ┌─────────────────────────────────────┐ │
│ │ Chapter 5 problems:                 │ │
│ │ • Problems 1-20 (odd only)          │ │
│ │ • Show all work                     │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ CHECKLIST                               │
│ ☐ Problems 1-5                          │
│ ☐ Problems 7-11                         │
│ ☐ Problems 13-17                        │
│ ☐ Problems 19                           │
│ [+ Add item]                            │
└─────────────────────────────────────────┘
```

**Task vs Note Difference**:
| Feature | Note | Task |
|---------|------|------|
| Title | ✓ | ✓ |
| Rich text content | ✓ (main content) | ✓ (description) |
| Tags | ✓ | ✓ |
| Due date | ✗ | ✓ |
| Reminder | ✗ | ✓ |
| Checklist | ✗ | ✓ |
| Status (complete) | ✗ | ✓ |

---

### Page 3: Chat

**Layout** (inspired by T3.chat):
```
┌─────────────────────────────────────────────────────────────┐
│ CHATS                                        [+ New Chat]   │
├──────────────────┬──────────────────────────────────────────┤
│ Search threads   │                                          │
│ ─────────────    │         Select a chat or                 │
│ TODAY            │         start a new one                  │
│ • Calc help      │                                          │
│ • Project ideas  │                                          │
│                  │                                          │
│ YESTERDAY        │                                          │
│ • Meeting notes  │                                          │
│                  │                                          │
│ LAST WEEK        │                                          │
│ • Research...    │                                          │
│                  │                                          │
│                  ├──────────────────────────────────────────┤
│                  │ [Model ▾] [RAG ◉] [🎤]                   │
│                  │ Type your message...              [↑]    │
└──────────────────┴──────────────────────────────────────────┘
```

**Thread List** (left sidebar):
- Search threads
- Grouped by: Today, Yesterday, Last 7 Days, Older
- Thread title (auto-generated or user-set)
- Active thread highlighted

**Chat View** (main area):
- Message bubbles (user right, AI left)
- Streaming response animation
- **Message Actions** (on hover):
  - Copy message
  - Edit message (user only)
  - Regenerate response
  - Branch from here (creates new thread)
  - Model info badge (shows which model responded)

**Model Selector** (dropdown modal):
```
┌─────────────────────────────────────────┐
│ Search models...                    [×] │
├─────────────────────────────────────────┤
│ ⭐ FAVORITES                            │
│ ┌─────────────────────────────────────┐ │
│ │ ✦ Claude 3.5 Sonnet ⭐              │ │
│ │ Fast, capable, default choice       │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ ✦ GPT-4o ⭐                         │ │
│ │ Multimodal, vision capable          │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ ALL MODELS                              │
│ │ ✦ Gemini 2.0 Flash                  │ │
│ │ │ Claude 3 Opus                     │ │
│ │ │ Mixtral 8x22B                     │ │
│ │ │ Llama 3.1 405B                    │ │
└─────────────────────────────────────────┘
```

**Model Features**:
- Star to favorite (persisted in settings)
- Set default model
- Search/filter models
- Model info (context length, capabilities)
- Group by provider (optional)

**Branching & Redo**:
- Click branch icon on any message → new thread from that point
- Edit user message → regenerates from that point
- View branch history (tree visualization - optional)

---

### Page 4: Files/Storage

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│ FILES                                      [+ Upload]       │
├─────────────────────────────────────────────────────────────┤
│ [🔍 Search files...]        [All ▾] [Recent ▾] [Grid/List]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │   📄    │  │   🖼️    │  │   📊    │  │   🎥    │        │
│  │         │  │         │  │         │  │         │        │
│  │ Doc.pdf │  │ Photo   │  │ Data    │  │ Lecture │        │
│  │ 2.3 MB  │  │ 1.1 MB  │  │ 0.5 MB  │  │ 45 MB   │        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Features**:
- Grid view (thumbnails) / List view toggle
- Search by filename, content (RAG search)
- Filter by type: All, Documents, Images, Audio, Video, Links
- Sort: Recent, Name, Size, Type
- File preview modal
- Tags display

**File Card**:
- File type icon/thumbnail
- Filename
- Size
- Tags
- Extraction status indicator
- Click → preview modal

**Preview Modal**:
- PDF: embedded viewer
- Images: full size with description
- Audio: waveform player
- Documents: text content
- Links: article preview
- Open in Google Drive button

---

### Page 5: Settings

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│ SETTINGS                                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ APPEARANCE                                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Theme                              [Dark ▾]             │ │
│ │ Accent Color                       [● Violet]           │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ AI MODELS                                                   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Default Model                [Claude 3.5 Sonnet ▾]      │ │
│ │ OpenRouter API Key           [••••••••••••] [Show]      │ │
│ │ Favorite Models              [Manage...]                │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ INTEGRATIONS                                                │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Google Account               [Connected] [Disconnect]   │ │
│ │ Google Calendar Sync         [◉ Enabled]                │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ NOTIFICATIONS                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Push Notifications           [◉ Enabled]                │ │
│ │ Sound                        [◉ Enabled]                │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Mobile App Pages (Expo)

### Design Adaptation
- Same dark glass morphism aesthetic
- Bottom tab navigation (5 tabs)
- Gesture-based interactions
- Native components where appropriate
- Safe area handling

### Tab Navigation
```
┌─────────────────────────────────────────┐
│                                         │
│              [Page Content]             │
│                                         │
├─────────────────────────────────────────┤
│  🏠    ✓    💬    📁    ⚙              │
│ Home  Tasks Chat  Files Settings        │
└─────────────────────────────────────────┘
```

### Mobile Page 1: Home (Memory Graph)
- Simplified graph visualization (pinch to zoom)
- Smart input box at bottom
- Floating action button for quick add
- Swipe down to search

### Mobile Page 2: Tasks
- List view (swipe to complete/delete)
- Pull to refresh
- FAB for new task
- Bottom sheet for task detail
- Date picker native component

### Mobile Page 3: Chat
- Thread list as main view
- Tap thread → full screen chat
- Swipe back to return
- Voice button prominent
- Keyboard handling

### Mobile Page 4: Files
- Grid view with thumbnails
- Share sheet integration
- Camera roll access
- Document picker
- Tap to preview (modal)

### Mobile Page 5: Settings
- Grouped settings list
- Native switches
- Haptic feedback
- Biometric lock option

### Mobile-Specific Features
- Voice recording with waveform
- Push notification handling
- Haptic feedback on actions
- Share sheet for quick capture
- Widget support (future)

---

## Shared UI Components

### Web Components (Tailwind + Custom)
```
components/ui/
├── button.tsx          # Glass button variants
├── input.tsx           # Glass input fields
├── card.tsx            # Glass card container
├── modal.tsx           # Overlay modals
├── dropdown.tsx        # Model selector, filters
├── toast.tsx           # Notification toasts
├── toggle.tsx          # RAG toggle, switches
├── badge.tsx           # Tags, status indicators
├── avatar.tsx          # User/AI avatars
├── skeleton.tsx        # Loading states
├── tooltip.tsx         # Hover hints
└── command.tsx         # Command palette (Cmd+K)
```

### Mobile Components (React Native)
```
components/ui/
├── Button.tsx          # Pressable with haptics
├── Input.tsx           # TextInput styled
├── Card.tsx            # Glass card (BlurView)
├── Modal.tsx           # Bottom sheet modal
├── Select.tsx          # Native picker wrapper
├── Toast.tsx           # Animated toast
├── Toggle.tsx          # Switch component
├── Badge.tsx           # Tag badges
└── Skeleton.tsx        # Loading shimmer
```

---

## Animation & Micro-interactions

### Transitions
- Page transitions: Fade + subtle slide (150ms)
- Modal: Scale up from center (200ms ease-out)
- Sidebar: Slide (200ms)
- Cards: Hover lift with shadow

### Feedback
- Button press: Scale down slightly
- Task complete: Checkbox animation, strikethrough
- Toast: Slide up, auto-dismiss
- Loading: Skeleton shimmer
- Streaming: Typing indicator, text fade-in

### Graph Animations
- Node hover: Glow effect, connected edges highlight
- Node click: Pulse, zoom to fit
- New node: Fade in with spring physics
- Connection: Line draw animation

---

## Future Extensions

- **User memory system** - Learn preferences/facts (Supermemory or custom)
- **Memory Graph visualization** - Using RAG data + d3-force (now core feature)
- Chrome extension for quick capture
- Desktop app (Electron/Tauri)
- Email integration
- Visual search (CLIP embeddings)
- Collaborative notes
- Multi-user support

---

## Resources

### Documentation
- Convex Docs: https://docs.convex.dev
- Convex Agents: https://docs.convex.dev/agents
- TipTap: https://tiptap.dev/docs
- Expo: https://docs.expo.dev
- expo-audio: https://docs.expo.dev/versions/latest/sdk/audio/
- expo-notifications: https://docs.expo.dev/versions/latest/sdk/notifications/

### Component Repos
- @convex-dev/agent: https://github.com/get-convex/agent
- @convex-dev/rag: https://github.com/get-convex/rag
- @convex-dev/prosemirror-sync: https://github.com/get-convex/prosemirror-sync
- convex-timeline: https://github.com/MeshanKhosla/convex-timeline

### APIs
- OpenRouter: https://openrouter.ai/docs
- Google Drive API: https://developers.google.com/drive/api/v3
- Google Calendar API: https://developers.google.com/calendar/api
- Expo Push: https://docs.expo.dev/push-notifications/overview/
