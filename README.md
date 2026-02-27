# SCLWA

SCLWA is organized as a split web platform:

- `client/`: React + Tailwind frontend
- `server/`: Hono API server

`src/` has been fully merged into `server/` and removed.

## Features

- Assessment (output + coding problems)
- Puzzle mode (fill blank, bug finder, code challenge)
- Tutoring chat (Gemini)
- Code review (Gemini)
- Settings (Gemini API key, progress reset)

## Run

```bash
npm install
npm run web:dev
```

- Frontend: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:5174`

## Build

```bash
npm run build
npm run web:build
```
