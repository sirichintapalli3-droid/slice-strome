// The Flask app and Vite client are deployed together, so same-origin requests
// are the safe default. Set VITE_API_URL only when the API is hosted separately.
const configuredApiUrl = (import.meta.env.VITE_API_URL || '').trim();
const API_URL = configuredApiUrl
  .replace(/\/+$/, '')
  .replace(/^https?:\/\/your-flask-api\.vercel\.app$/i, '');

export default API_URL;
