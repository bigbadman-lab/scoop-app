import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@scoop/db', '@scoop/news', 'geist'],
  outputFileTracingRoot: path.join(configDir, '../..'),
};

export default nextConfig;
