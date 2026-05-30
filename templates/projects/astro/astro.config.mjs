import { defineConfig } from "astro/config";

// Static output by default — mirrors the Banafah client portal stack.
export default defineConfig({
  output: "static",
  // site: "https://example.com",  // set per project for correct canonical URLs
});
