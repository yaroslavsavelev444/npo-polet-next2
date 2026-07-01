import type { NextConfig } from 'next'
import path from 'node:path'
import './src/env.ts'

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
    rules: {
      '*.md': {
        loaders: [],
        as: '*.empty',
      },
    },
  },
  serverExternalPackages: [
    'esbuild',
    'esbuild-register',
    'drizzle-kit',
    '@payloadcms/db-postgres',
    '@payloadcms/drizzle',
  ],
}

export default nextConfig