const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/bradford", destination: "/candidates/bradford", permanent: true },
      { source: "/chow", destination: "/candidates/chow", permanent: true },
      { source: "/compare", destination: "/?q=Compare+candidates", permanent: false },
      { source: "/issues", destination: "/?q=Compare+candidates+on+issue+priorities", permanent: false },
    ];
  },
};
export default nextConfig;
