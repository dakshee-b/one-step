import { appState } from '../state.js';
import { api, ApiError } from '../api.js';
import { navigateTo, initLucideIcons } from '../utils.js';

let showPassword = false;

export function renderLoginPage() {
  return `
    <div class="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col">
      <header class="bg-white shadow-sm">
        <div class="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div class="flex items-center gap-3">
            <button data-navigate="/" class="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <i data-lucide="arrow-left" class="w-5 h-5 text-gray-600"></i>
            </button>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <i data-lucide="pill" class="w-6 h-6 text-white"></i>
              </div>
              <span class="text-2xl text-blue-900">MedDrop Dispenser</span>
            </div>
          </div>
        </div>
      </header>

      <div class="flex-1 flex items-center justify-center px-4 py-16">
        <div class="w-full max-w-md">
          <div class="text-center mb-8">
            <div class="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <i data-lucide="pill" class="w-9 h-9 text-white"></i>
            </div>
            <h1 class="text-3xl text-gray-900 mb-1">Welcome back</h1>
            <p class="text-gray-500">Sign in to your MedDrop account</p>
          </div>

          <div class="bg-white rounded-2xl shadow-xl p-8">
            <form id="login-form" class="space-y-5">
              <div id="auth-error" class="hidden flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                <i data-lucide="alert-circle" class="w-4 h-4 flex-shrink-0"></i>
                <span id="auth-error-text"></span>
              </div>

              <div>
                <label class="block text-sm mb-2 text-gray-700">
                  <i data-lucide="user" class="w-4 h-4 inline mr-2"></i>
                  Username
                </label>
                <input
                  type="text"
                  id="username"
                  autocomplete="username"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                  placeholder="Enter your username"
                  required
                />
              </div>

              <div>
                <label class="block text-sm mb-2 text-gray-700">
                  <i data-lucide="lock" class="w-4 h-4 inline mr-2"></i>
                  Password
                </label>
                <div class="relative">
                  <input
                    type="password"
                    id="password"
                    autocomplete="current-password"
                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none pr-12 transition-colors"
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    id="toggle-password"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <i data-lucide="${showPassword ? 'eye-off' : 'eye'}" class="w-5 h-5"></i>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                class="w-full px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md"
              >
                Sign In
              </button>
            </form>

            <div class="flex items-center gap-3 my-6">
              <div class="flex-1 h-px bg-gray-200"></div>
              <span class="text-gray-400 text-sm">or</span>
              <div class="flex-1 h-px bg-gray-200"></div>
            </div>

            <p class="text-center text-sm text-gray-500">
              Don't have an account?
              <button
                data-navigate="/register"
                class="text-blue-600 hover:underline"
              >
                Create one for free
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function attachLoginPageListeners() {
  const toggleBtn = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('password');

  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener('click', () => {
      showPassword = !showPassword;
      passwordInput.type = showPassword ? 'text' : 'password';
      const icon = toggleBtn.querySelector('i');
      if (icon) {
        icon.setAttribute('data-lucide', showPassword ? 'eye-off' : 'eye');
        initLucideIcons();
      }
    });
  }

  const form = document.getElementById('login-form');
  const authError = document.getElementById('auth-error');
  const authErrorText = document.getElementById('auth-error-text');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      const submitBtn = form.querySelector('button[type="submit"]');

      authError.classList.add('hidden');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';

      try {
        const { user, token } = await api.login({ username, password });
        appState.setUser(user, token);
        navigateTo('/dashboard');
      } catch (err) {
        if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
          authErrorText.textContent = 'Invalid username or password. Please try again.';
        } else if (err instanceof ApiError && err.status === 0) {
          authErrorText.textContent = 'Cannot reach server. Is the API running?';
        } else {
          authErrorText.textContent = err.message || 'Sign-in failed. Try again.';
        }
        authError.classList.remove('hidden');
        initLucideIcons();
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    });
  }

  document.querySelectorAll('[data-navigate]').forEach(button => {
    button.addEventListener('click', (e) => {
      const path = e.currentTarget.getAttribute('data-navigate');
      navigateTo(path);
    });
  });

  initLucideIcons();
}
