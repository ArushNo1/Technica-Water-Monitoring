/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { dev }) => {
    // WSL can't watch files on Windows drives (/mnt/c), so dev serves stale code. Poll there instead.
    if (dev && process.cwd().startsWith("/mnt/")) config.watchOptions = { poll: 1000, aggregateTimeout: 300 };
    return config;
  },
};
export default nextConfig;
