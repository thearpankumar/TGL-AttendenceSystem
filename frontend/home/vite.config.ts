// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig as lovableConfig } from "@lovable.dev/vite-tanstack-config";
import { ConfigEnv, UserConfig } from "vite";

export default async (env: ConfigEnv): Promise<UserConfig> => {
  const config = await lovableConfig({
    tanstackStart: {
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      // nitro/vite builds from this
      server: { entry: "server" },
    },
    nitro: { preset: "node-server" },
  })(env);

  // Filter out the vite-tsconfig-paths plugin to resolve the warning under Vite 8+
  if (config.plugins) {
    config.plugins = config.plugins.filter((plugin) => {
      if (plugin && typeof plugin === "object" && "name" in plugin) {
        const p = plugin as { name: string };
        return p.name !== "vite-tsconfig-paths";
      }
      return true;
    });
  }

  // Enable Vite's native tsconfig paths resolution
  config.resolve = {
    ...config.resolve,
    tsconfigPaths: true,
  };

  return config;
};
