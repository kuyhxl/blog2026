import type { NextConfig } from "next";

// 정적 사이트로 빌드한다. 결과물은 out/
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
