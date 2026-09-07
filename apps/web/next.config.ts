import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@scoop/db',
    '@scoop/news',
    '@scoop/shared',
    'geist',
    '@reown/appkit',
    '@reown/appkit-adapter-wagmi',
  ],
  outputFileTracingRoot: path.join(configDir, '../..'),
  // Wagmi/AppKit pulls Coinbase Base Account → optional @x402 peers we do not use.
  // Stub so production builds succeed without installing payment SDK extras.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@x402/evm': false,
      '@x402/evm/exact/client': false,
      '@x402/core/client': false,
      '@x402/svm': false,
      '@x402/svm/exact/client': false,
    };
    return config;
  },
};

export default nextConfig;
