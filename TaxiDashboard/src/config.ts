const config = {
  API_BASE_URL: (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000',
};

export default config;
