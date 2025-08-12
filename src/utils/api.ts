import axios from 'axios';

// Configure API base URL. Set VITE_API_BASE in your env, e.g.:
const VITE_API_BASE="http://localhost:8787/api"
// const baseURL = import.meta.env?.VITE_API_BASE || '/api';
const baseURL = VITE_API_BASE || '/api';

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

export function setApiBaseUrl(url: string) {
  api.defaults.baseURL = url;
}

