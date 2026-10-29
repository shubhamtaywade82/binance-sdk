import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/tools/index.ts', 'src/mcp/index.ts', 'src/mcp/api.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  minify: false,
  target: 'es2020',
  external: ['@modelcontextprotocol/sdk'],
});
