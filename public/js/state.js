// Lightweight app state. Backed by the REST API — no more localStorage as
// source of truth. Auth token is still kept in localStorage so the user
// stays signed in across reloads (handled by api.js).

import { api, getToken, setToken, clearToken, ApiError } from './api.js';

class AppState {
  constructor() {
    this.user = null;
    this.listeners = [];
  }

  // Async — fetches /auth/me when we have a token but no cached user.
  // Returns the user object or null if unauthenticated.
  async loadUser() {
    if (this.user) return this.user;
    if (!getToken()) return null;
    try {
      const { user } = await api.me();
      this.user = user;
      this.notify();
      return user;
    } catch (e) {
      // Stale or invalid token — wipe it.
      if (e instanceof ApiError && e.status === 401) {
        clearToken();
        this.user = null;
      }
      return null;
    }
  }

  setUser(user, token) {
    if (token) setToken(token);
    this.user = user;
    this.notify();
  }

  updateUser(patch) {
    this.user = { ...(this.user ?? {}), ...patch };
    this.notify();
  }

  async logout() {
    try {
      await api.logout();
    } catch (_) {
      // Even if the server call fails, clear local state.
    }
    clearToken();
    this.user = null;
    this.notify();
  }

  isAuthenticated() {
    return Boolean(getToken());
  }

  subscribe(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  notify() {
    this.listeners.forEach(l => l(this.user));
  }
}

export const appState = new AppState();
