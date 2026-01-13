# Kriyan - Agent Instructions

## Project Structure
Monorepo with Bun workspaces: root (`/`), web (`/web` - Next.js), mobile (`/mobile` - Expo Android), convex (`/convex` - backend)

## Commands by Project
| Location | Install | Dev | Build | Lint |
|----------|---------|-----|-------|------|
| Root | `bun install` | `bunx convex dev` | - | - |
| Web | `cd web && bun install` | `cd web && bun --bun run dev` | `bun --bun run build` | `bun run lint` |
| Mobile | `cd mobile && bun install` | `bun run start` or `bun run android` | `bunx eas build -p android` | `bun run lint` |
| Convex | From root: `bunx convex dev` | `bunx convex deploy` | - | - |

## Run All Services
From root: `bun run dev` - runs Convex, Web, and Mobile concurrently with colored output

## Code Style
- **TypeScript**: Strict mode, explicit return types for exported functions
- **Imports**: Use `@/` alias for local imports, group: external → internal → relative
- **Formatting**: 2-space indent, single quotes, no semicolons (Prettier defaults)
- **Naming**: camelCase (vars/funcs), PascalCase (components/types), SCREAMING_SNAKE (constants)
- **Files**: kebab-case for files, match component name for React files
- **Errors**: Use try/catch in actions, return `{ success, error }` objects from mutations
- **Convex**: Queries for reads, Mutations for writes, Actions for external APIs/side effects

## Bun-Specific Notes
- Use `bun add` not `npm install` for packages
- Use `bunx` instead of `npx` for CLI tools
- Add native packages with postinstall to `trustedDependencies` in package.json
- Web: prefix Next.js scripts with `bun --bun` to use Bun runtime
- Mobile: Metro bundler runs on Node.js, but use `bun run` for scripts
