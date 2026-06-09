// vitest.config.ts
import { defineConfig } from "file:///sessions/modest-sweet-bell/mnt/horus/node_modules/.pnpm/vitest@4.1.7_@types+node@20.19.41_@vitest+coverage-v8@4.1.7_vite@8.0.14_@types+node@20.19.41_esbuild@0.28.0_tsx@4.22.4_/node_modules/vitest/dist/config.js";
import { resolve } from "path";
var __vite_injected_original_dirname = "/sessions/modest-sweet-bell/mnt/horus/example";
var vitest_config_default = defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html", "lcov"],
      reportsDirectory: "./reports/coverage",
      include: ["services/**"],
      exclude: [
        "**/server.ts",
        "**/node_modules/**"
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    }
  },
  resolve: {
    alias: {
      "@wutangbanger/horus-contracts": resolve(__vite_injected_original_dirname, "../shared/contracts/src/index.ts"),
      "@wutangbanger/horus-test-utils": resolve(__vite_injected_original_dirname, "../shared/test-utils/src/index.ts"),
      "@wutangbanger/horus-insight-store": resolve(__vite_injected_original_dirname, "../shared/insight-store/src/index.ts")
    }
  }
});
export {
  vitest_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZXN0LmNvbmZpZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9zZXNzaW9ucy9tb2Rlc3Qtc3dlZXQtYmVsbC9tbnQvaG9ydXMvZXhhbXBsZVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL3Nlc3Npb25zL21vZGVzdC1zd2VldC1iZWxsL21udC9ob3J1cy9leGFtcGxlL3ZpdGVzdC5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL3Nlc3Npb25zL21vZGVzdC1zd2VldC1iZWxsL21udC9ob3J1cy9leGFtcGxlL3ZpdGVzdC5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlc3QvY29uZmlnJztcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tICdwYXRoJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgdGVzdDoge1xuICAgIGdsb2JhbHM6IHRydWUsXG4gICAgZW52aXJvbm1lbnQ6ICdub2RlJyxcbiAgICBleGNsdWRlOiBbJyoqL25vZGVfbW9kdWxlcy8qKicsICcqKi9kaXN0LyoqJywgJ3Rlc3RzL2UyZS8qKiddLFxuICAgIGNvdmVyYWdlOiB7XG4gICAgICBwcm92aWRlcjogJ3Y4JyxcbiAgICAgIHJlcG9ydGVyOiBbJ3RleHQnLCAnanNvbicsICdqc29uLXN1bW1hcnknLCAnaHRtbCcsICdsY292J10sXG4gICAgICByZXBvcnRzRGlyZWN0b3J5OiAnLi9yZXBvcnRzL2NvdmVyYWdlJyxcbiAgICAgIGluY2x1ZGU6IFsnc2VydmljZXMvKionXSxcbiAgICAgIGV4Y2x1ZGU6IFtcbiAgICAgICAgJyoqL3NlcnZlci50cycsXG4gICAgICAgICcqKi9ub2RlX21vZHVsZXMvKionLFxuICAgICAgXSxcbiAgICAgIHRocmVzaG9sZHM6IHtcbiAgICAgICAgbGluZXM6IDgwLFxuICAgICAgICBmdW5jdGlvbnM6IDgwLFxuICAgICAgICBicmFuY2hlczogNzUsXG4gICAgICAgIHN0YXRlbWVudHM6IDgwLFxuICAgICAgfSxcbiAgICB9LFxuICB9LFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICdAd3V0YW5nYmFuZ2VyL2hvcnVzLWNvbnRyYWN0cyc6IHJlc29sdmUoX19kaXJuYW1lLCAnLi4vc2hhcmVkL2NvbnRyYWN0cy9zcmMvaW5kZXgudHMnKSxcbiAgICAgICdAd3V0YW5nYmFuZ2VyL2hvcnVzLXRlc3QtdXRpbHMnOiByZXNvbHZlKF9fZGlybmFtZSwgJy4uL3NoYXJlZC90ZXN0LXV0aWxzL3NyYy9pbmRleC50cycpLFxuICAgICAgJ0B3dXRhbmdiYW5nZXIvaG9ydXMtaW5zaWdodC1zdG9yZSc6IHJlc29sdmUoX19kaXJuYW1lLCAnLi4vc2hhcmVkL2luc2lnaHQtc3RvcmUvc3JjL2luZGV4LnRzJyksXG4gICAgfSxcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUE2VCxTQUFTLG9CQUFvQjtBQUMxVixTQUFTLGVBQWU7QUFEeEIsSUFBTSxtQ0FBbUM7QUFHekMsSUFBTyx3QkFBUSxhQUFhO0FBQUEsRUFDMUIsTUFBTTtBQUFBLElBQ0osU0FBUztBQUFBLElBQ1QsYUFBYTtBQUFBLElBQ2IsU0FBUyxDQUFDLHNCQUFzQixjQUFjLGNBQWM7QUFBQSxJQUM1RCxVQUFVO0FBQUEsTUFDUixVQUFVO0FBQUEsTUFDVixVQUFVLENBQUMsUUFBUSxRQUFRLGdCQUFnQixRQUFRLE1BQU07QUFBQSxNQUN6RCxrQkFBa0I7QUFBQSxNQUNsQixTQUFTLENBQUMsYUFBYTtBQUFBLE1BQ3ZCLFNBQVM7QUFBQSxRQUNQO0FBQUEsUUFDQTtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFlBQVk7QUFBQSxRQUNWLE9BQU87QUFBQSxRQUNQLFdBQVc7QUFBQSxRQUNYLFVBQVU7QUFBQSxRQUNWLFlBQVk7QUFBQSxNQUNkO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLGlDQUFpQyxRQUFRLGtDQUFXLGtDQUFrQztBQUFBLE1BQ3RGLGtDQUFrQyxRQUFRLGtDQUFXLG1DQUFtQztBQUFBLE1BQ3hGLHFDQUFxQyxRQUFRLGtDQUFXLHNDQUFzQztBQUFBLElBQ2hHO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
