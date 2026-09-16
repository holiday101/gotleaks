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
  // next/link and the router prepend basePath automatically, but a raw
  // window.open(path) does not -- expose it so client code building URLs
  // by hand (e.g. the map's new-window meter links) can prefix it themselves.
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath ?? "",
  },
};

export default nextConfig;
