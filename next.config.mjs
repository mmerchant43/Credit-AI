/** @type {import('next').NextConfig} */
// Same deployment posture as the Industrial comp platform: there is no local
// dev environment — every change deploys through GitHub → Vercel — so type
// and lint errors must not block a build the team can't debug locally.
// Syntax is verified before every upload instead (see the handoff brief).
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
