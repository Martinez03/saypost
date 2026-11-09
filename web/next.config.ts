import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker builds set NEXT_OUTPUT=standalone (web/Dockerfile) to get a self-contained server.js.
  // Netlify and Vercel build without it and use their own Next.js runtime.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Tailwind 4 without a PostCSS config: CSS goes through the Tailwind Turbopack loader.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    // Avatars and media come from Zernio and the networks' CDNs; plain <img> tags are used for them.
    unoptimized: true,
  },
};

export default nextConfig;
