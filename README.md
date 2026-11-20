# React + TypeScript + Vite

## Supabase environments

Local development is pinned to the local Supabase CLI stack. The Vite development
server refuses hosted Supabase URLs, so a local session cannot accidentally write
to the production project.

1. Install Docker Desktop and the Supabase CLI.
2. Run `supabase start`, then copy the local `API URL` and `anon key` shown by
   `supabase status`.
3. Keep the API URL at `http://127.0.0.1:54321`. Put the local key in the ignored
   `.env.development.local` as `VITE_SUPABASE_ANON_KEY=...`.
4. Run `supabase status` to open the local Inbucket email viewer, then run
   `npm run dev`. Local Auth uses `http://localhost:3000` as its Site URL.

The safe local `.env.development` overrides `.env.local` for `npm run dev`.
Vite requires the local anon key before starting. Do not copy the production
`.env.local` into another environment.

For Vercel, configure `VITE_SUPABASE_ENV`, `VITE_SUPABASE_URL`, and
`VITE_SUPABASE_ANON_KEY` independently for Preview (`staging`) and Production
(`production`). The build checks that the environment label matches its Vite
deployment environment (Vercel Preview maps to `staging`) and refuses to build
without that environment's URL and anon key. Use
separate Supabase projects and set each project's Auth Site URL,
redirect allow-list, and email templates to that environment's origin. Never
place a service-role key in a `VITE_` variable; this repository has no trusted
server or Edge Function that should use one.

`supabase/config.toml` defines the local Auth URL allow-list and enables email
confirmation. Local auth emails are captured by Inbucket, not sent to real users.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
