import { initRouter } from './router.js';
import { appState } from './state.js';

async function initApp() {
  await appState.loadUser();
  initRouter();
  console.log('medDrop application initialized');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
