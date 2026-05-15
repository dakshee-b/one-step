import { renderLandingPage, attachLandingPageListeners } from './pages/landing.js';
import { renderLoginPage, attachLoginPageListeners } from './pages/login.js';
import { renderRegistrationPage, attachRegistrationPageListeners } from './pages/registration.js';
import { renderDashboardPage, attachDashboardPageListeners } from './pages/dashboard.js';
import { appState } from './state.js';
import { api } from './api.js';

const routes = {
  '/':          { render: renderLandingPage,      attach: attachLandingPageListeners,      requiresAuth: false },
  '/login':     { render: renderLoginPage,        attach: attachLoginPageListeners,        requiresAuth: false },
  '/register':  { render: renderRegistrationPage, attach: attachRegistrationPageListeners, requiresAuth: false },
  '/dashboard': { render: renderDashboardPage,    attach: attachDashboardPageListeners,    requiresAuth: true  },
};

export function initRouter() {
  async function handleRouteChange() {
    const path = window.location.hash.slice(1) || '/';
    const route = routes[path];

    if (!route) {
      window.location.hash = '/';
      return;
    }

    if (route.requiresAuth && !appState.isAuthenticated()) {
      window.location.hash = '/login';
      return;
    }

    // First-run detection: if user hits /login but no account exists yet,
    // bounce them to /register.
    if (path === '/login' && !appState.isAuthenticated()) {
      try {
        const { registered } = await api.authStatus();
        if (!registered) {
          window.location.hash = '/register';
          return;
        }
      } catch (_) {
        // If status check fails (server down), let them try login anyway.
      }
    }

    const app = document.getElementById('app');
    if (!app) return;

    // Async render path so pages can await initial data fetches.
    const html = await Promise.resolve(route.render());
    app.innerHTML = html;
    await Promise.resolve(route.attach());
  }

  window.addEventListener('hashchange', handleRouteChange);
  handleRouteChange();
}
