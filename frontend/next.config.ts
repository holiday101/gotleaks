import type { NextConfig } from "next";

// NEXT_BASE_PATH is unset for local dev (app served at /) and set to
// "/water" on the production server, where nginx keeps the same URL
// structure the Streamlit app used (membergolfonline.com/water/) instead of
// introducing a new subdomain -- see deploy/nginx.conf. basePath has to be
// known at build time, not just runtime, so this reads the env var here
// rather than in middleware/route code.
const basePath = process.env.NEXT_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  basePath,
};

export default nextConfig;
