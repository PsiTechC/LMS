# XA-LMS Mobile Application

## Scope

`apps/mobile` is the React Native + Expo implementation of XA-LMS. Mobile work is owned by **Mobile App Builder**. Read this file with `CLAUDE.md`, `apps/CLAUDE.md`, and `apps/mobile/AGENTS.md` before changing mobile code.

The app is currently an Expo starter: entry point `index.ts`, root UI `App.tsx`, no Expo Router or React Navigation, no API client, no authentication/token-storage layer, no server-state library, no theme module, and no configured lint/test scripts. Do not introduce an architecture or dependency without a concrete feature need and explicit rationale.

## Current toolchain

- Expo `~56.0.12`, React Native `0.85.3`, React `19.2.3`, TypeScript strict mode.
- Run `npx tsc --noEmit` for type checking.
- Available start commands: `npm run start`, `npm run android`, `npm run ios`, and `npm run web`.
- Follow the versioned Expo 56 guidance required by `AGENTS.md` when Expo behaviour or APIs are relevant.

## Implementation rules

- Use React Native components, `StyleSheet`, and Expo-compatible packages only.
- Use safe-area-aware layouts, keyboard-safe forms, accessible labels, and touch-friendly targets.
- Use `FlatList` or `SectionList` for large data; include loading, empty, error, refresh, and pagination states where applicable.
- Treat the web app as the source for workflow parity: inspect the corresponding `apps/web` screen, web API client, and backend contract before implementation. Preserve roles, permissions, validation, status meanings, filters, search, and actions without copying desktop layout.
- Do not use browser localStorage, DOM APIs, CSS media queries, Tailwind/shadcn components, or web-only authentication assumptions. Choose secure Expo-compatible storage only when an authentication implementation is required.
- No authoritative mobile roadmap exists in this repository today. Inspect current planning documents before feature work and explicitly report a missing roadmap or contract gap rather than inventing one.
- Do not modify `apps/web` as part of ordinary mobile work. Flag shared-contract or backend gaps explicitly.