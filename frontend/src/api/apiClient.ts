import axios from 'axios';

// Allows switching between mock and real backend via env variable
const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API !== 'false';
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const isMockMode = () => USE_MOCK_API;

// Utility for simulating network delay in mock mode
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
