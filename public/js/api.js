// Thin fetch wrapper for the MedDrop REST API.
// Adds the Authorization header automatically, parses the standard error envelope,
// and exposes named methods per endpoint so call sites stay readable.

import { CONFIG } from './config.js';

function getToken() {
  return localStorage.getItem(CONFIG.TOKEN_KEY);
}

function setToken(token) {
  if (token) localStorage.setItem(CONFIG.TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(CONFIG.TOKEN_KEY);
}

class ApiError extends Error {
  constructor(code, message, status, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, { body, formData, query } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let payload;
  if (formData) {
    payload = formData; // browser sets multipart boundary
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let url = CONFIG.API_BASE + path;
  if (query) {
    const qs = new URLSearchParams(query).toString();
    if (qs) url += '?' + qs;
  }

  let res;
  try {
    res = await fetch(url, { method, headers, body: payload });
  } catch (e) {
    throw new ApiError('NETWORK_ERROR', 'Could not reach the server', 0, null);
  }

  if (res.status === 204) return null;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(
      err.code ?? 'HTTP_ERROR',
      err.message ?? `Request failed (${res.status})`,
      res.status,
      err.details ?? null
    );
  }

  return data;
}

export const api = {
  // ----- Auth -----
  authStatus: () => request('GET', '/auth/status'),
  register: (payload) => request('POST', '/auth/register', { body: payload }),
  login: (payload) => request('POST', '/auth/login', { body: payload }),
  logout: () => request('POST', '/auth/logout'),
  me: () => request('GET', '/auth/me'),

  // ----- Profile -----
  getProfile: () => request('GET', '/profile'),
  updateProfile: (payload) => request('PUT', '/profile', { body: payload }),
  uploadPhoto: (file) => {
    const fd = new FormData();
    fd.append('photo', file);
    return request('POST', '/profile/photo', { formData: fd });
  },
  deletePhoto: () => request('DELETE', '/profile/photo'),

  // ----- Medications -----
  getMedications: () => request('GET', '/medications'),
  updateMedication: (id, payload) => request('PUT', `/medications/${id}`, { body: payload }),

  // ----- Dashboard -----
  getOverview: () => request('GET', '/dashboard/overview'),
  getToday: () => request('GET', '/dashboard/today'),
  getWeeklyAdherence: (weekStart) =>
    request('GET', '/adherence/weekly', { query: weekStart ? { week_start: weekStart } : undefined }),
  getMonthlyAdherence: (year, month) =>
    request('GET', '/adherence/monthly', { query: { year, month } }),

  // ----- Notifications -----
  getNotifications: () => request('GET', '/notifications'),
  dismissNotification: (id) => request('DELETE', `/notifications/${id}`),
  clearAllNotifications: () => request('DELETE', '/notifications'),
  markNotificationRead: (id) => request('PATCH', `/notifications/${id}/read`),
};

export { ApiError, getToken, setToken, clearToken };
