import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  const exposedEntries = Object.entries(env);
  const secretName = /(?:SERVICE|SECRET|PRIVATE|PASSWORD|TOKEN|WEBHOOK|API_KEY)/i;
  const looksPrivate = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (/service[_-]?role|secret|private[_-]?key|bearer\s|vercel[_-]?oidc/i.test(value)) return true;
    if (/^(?:eyJ[a-zA-Z0-9_-]+\.){2}[a-zA-Z0-9_-]+$/.test(value)) {
      try {
        const payload = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString());
        return payload.role !== 'anon';
      } catch {
        return true;
      }
    }
    return /^(?:sk_live_|sk_test_|whsec_|sb_secret_)/i.test(normalized);
  };

  for (const [name, value] of exposedEntries) {
    if (secretName.test(name) || looksPrivate(value)) {
      throw new Error(`Refusing to expose private or secret-shaped value through ${name}.`);
    }
  }

  if (command === 'serve' && mode === 'development') {
    let developmentHost = '';
    try {
      developmentHost = new URL(env.VITE_SUPABASE_URL ?? '').hostname;
    } catch {
      throw new Error('Development requires the local Supabase URL from .env.development.');
    }
    if (!['localhost', '127.0.0.1', '::1'].includes(developmentHost)) {
      throw new Error('Development must use a local Supabase URL; hosted projects are blocked.');
    }
    if (!env.VITE_SUPABASE_ANON_KEY?.trim()) {
      throw new Error('Development requires the local Supabase anon key in .env.development.local.');
    }
  }

  if (command === 'build' && (mode === 'production' || mode === 'staging' || process.env.VERCEL_ENV)) {
    const vercelEnvironment = process.env.VERCEL_ENV;
    const deploymentEnvironment = vercelEnvironment === 'preview' ? 'staging'
      : vercelEnvironment === 'production' ? 'production'
        : mode;
    if ((vercelEnvironment === 'preview' && !['production', 'staging'].includes(mode)) ||
      (vercelEnvironment === 'production' && mode !== 'production') ||
      !['staging', 'production'].includes(deploymentEnvironment)) {
      throw new Error('Deployment mode does not match the Vercel environment.');
    }
    if (env.VITE_SUPABASE_ENV !== deploymentEnvironment) {
      throw new Error(`Set VITE_SUPABASE_ENV=${deploymentEnvironment} in the deployment environment.`);
    }
    if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
      throw new Error(`Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for ${deploymentEnvironment} builds.`);
    }
    let deploymentHost = '';
    try {
      deploymentHost = new URL(env.VITE_SUPABASE_URL).hostname;
    } catch {
      throw new Error(`VITE_SUPABASE_URL must be a valid HTTPS Supabase URL for ${deploymentEnvironment}.`);
    }
    if (!env.VITE_SUPABASE_URL.startsWith('https://') || !deploymentHost.endsWith('.supabase.co')) {
      throw new Error(`VITE_SUPABASE_URL must be a hosted HTTPS Supabase URL for ${deploymentEnvironment}.`);
    }
  }

  return {
    base: './',
    plugins: [command === 'serve' ? inspectAttr() : null, react()].filter(Boolean),
    server: {
      port: 3000,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('src/db/')) return 'db';
            if (id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router/') ||
              id.includes('node_modules/react-router-dom/')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/jotai/') || id.includes('node_modules/lucide-react/')) {
              return 'vendor-ui';
            }
            if (id.includes('node_modules/@radix-ui/')) return 'vendor-radix';
          },
        },
      },
    },
  };
});
