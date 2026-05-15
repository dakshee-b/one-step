import { CONFIG } from '../config.js';
import { navigateTo, initLucideIcons } from '../utils.js';

export function renderLandingPage() {
  return `
    <div class="min-h-screen bg-white">
      <!-- Header -->
      <header class="bg-white shadow-sm sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <i data-lucide="pill" class="w-6 h-6 text-white"></i>
              </div>
              <span class="text-2xl text-blue-900">MedDrop Dispenser</span>
            </div>
            <nav class="hidden md:flex items-center gap-8">
              <a href="#features" class="text-gray-600 hover:text-blue-600 transition-colors">Features</a>
              <a href="#how-it-works" class="text-gray-600 hover:text-blue-600 transition-colors">How It Works</a>
            </nav>
            <button
              data-navigate="/login"
              class="px-5 py-2 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Log In
            </button>
          </div>
        </div>
      </header>

      <!-- ─── Layer 1: Hero ─────────────────────────────────────────────────────── -->
      <section class="max-w-7xl mx-auto px-4 py-20 sm:px-6 lg:px-8">
        <div class="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          <!-- Left — copy -->
          <div class="flex-1 text-left">
            <span class="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm mb-6">
              IoT-Powered Medication Management
            </span>
            <h2 class="text-5xl lg:text-6xl text-gray-900 mb-6 leading-tight">
              Never Miss a<br />
              <span class="text-blue-600">Dose Again</span>
            </h2>
            <p class="text-lg text-gray-600 mb-8 max-w-lg leading-relaxed">
              An intelligent IoT pill dispenser designed for patients with
              memory-related conditions. Automated medication management with
              real-time monitoring for caregivers and loved ones.
            </p>
            <button
              data-navigate="/register"
              class="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg flex items-center gap-2 w-fit"
            >
              Get Started <i data-lucide="chevron-right" class="w-4 h-4"></i>
            </button>
          </div>

          <!-- Right — image -->
          <div class="flex-1 w-full max-w-lg lg:max-w-none">
            <div class="relative">
              <div class="absolute inset-0 bg-gradient-to-br from-blue-100 to-blue-50 rounded-3xl transform rotate-3"></div>
              <img
                src="https://lh3.googleusercontent.com/u/0/d/1To04oPVWll_NcUPtnRKX4sIKLrpjzgZ9"                
                alt="Smart pill dispenser device"
                class="relative rounded-3xl shadow-2xl w-full object-cover aspect-[4/3]"
              />
              <!-- Floating pill schedule card -->
              <div class="absolute -bottom-5 -left-5 bg-white rounded-2xl shadow-xl p-4 flex items-center gap-3 border border-gray-100">
                <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <i data-lucide="pill" class="w-5 h-5 text-green-600"></i>
                </div>
                <div>
                  <p class="text-xs text-gray-500">Next dose</p>
                  <p class="text-gray-900 text-sm">Morning · 8:00 AM</p>
                </div>
                <div class="w-2 h-2 bg-green-500 rounded-full ml-1 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ─── Layer 2: Features — 2×2 grid ─────────────────────────────────────── -->
      <section id="features" class="bg-gray-50 py-20 mt-8">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center mb-14">
            <span class="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm mb-4">
              Why choose medDrop?
            </span>
            <h3 class="text-4xl text-gray-900 mb-4">
              Features Designed for Care
            </h3>
            <p class="text-gray-500 max-w-xl mx-auto">
              Every feature is built with patients and caregivers in mind — simplicity, safety, and peace of mind.
            </p>
          </div>

          <!-- 2×2 rectangle grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            ${CONFIG.FEATURES.map((f, i) => `
              <div class="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md transition-shadow group">
                <!-- Image -->
                <div class="relative h-52 overflow-hidden">
                  <img
                    src="${f.image}"
                    alt="${f.title}"
                    class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div class="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"></div>
                </div>
                <!-- Text -->
                <div class="p-6">
                  <div class="flex items-center gap-3 mb-3">
                    <div class="w-9 h-9 ${getFeatureIconBg(i)} rounded-lg flex items-center justify-center flex-shrink-0">
                      <i data-lucide="${getFeatureIcon(i)}" class="w-6 h-6 ${getFeatureIconColor(i)}"></i>
                    </div>
                    <h4 class="text-gray-900">${f.title}</h4>
                  </div>
                  <p class="text-gray-500 leading-relaxed text-sm">
                    ${f.description}
                  </p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <!-- ─── Layer 3: How It Works ─────────────────────────────────────────────── -->
      <section id="how-it-works" class="py-20">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex flex-col lg:flex-row gap-16 items-start">
            <!-- Left — title + CTA -->
            <div class="lg:w-80 lg:sticky lg:top-28 flex-shrink-0">
              <span class="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm mb-5">
                Setup guide
              </span>
              <h3 class="text-4xl text-gray-900 mb-6 leading-tight">
                Ready to use in<br />
                <span class="text-blue-600">4 easy steps</span>
              </h3>
              <button
                data-navigate="/register"
                class="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg flex items-center gap-2"
              >
                Sign Up <i data-lucide="chevron-right" class="w-4 h-4"></i>
              </button>
            </div>

            <!-- Right — numbered steps -->
            <div class="flex-1">
              <div class="relative">
                <!-- Vertical connector line -->
                <div class="absolute left-5 top-10 bottom-10 w-0.5 bg-blue-100 hidden sm:block"></div>

                <div class="space-y-0">
                  ${CONFIG.HOW_IT_WORKS.map((step, i) => `
                    <div class="flex gap-6 group">
                      <!-- Step number bubble -->
                      <div class="flex flex-col items-center flex-shrink-0">
                        <div class="relative z-10 w-11 h-11 rounded-full border-2 border-blue-200 bg-white flex items-center justify-center group-hover:border-blue-500 group-hover:bg-blue-50 transition-all">
                          <span class="text-blue-600 text-sm">${i + 1}</span>
                        </div>
                      </div>

                      <!-- Step content -->
                      <div class="pb-10 flex-1">
                        <div class="flex items-center gap-2 mb-2">
                          <div class="w-7 h-7 bg-blue-100 rounded-md flex items-center justify-center text-blue-600">
                            <i data-lucide="${step.icon.toLowerCase()}" class="w-5 h-5"></i>
                          </div>
                          <h4 class="text-lg text-gray-900">${step.title}</h4>
                        </div>
                        <p class="text-gray-500 leading-relaxed pl-9">
                          ${step.description}
                        </p>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ─── CTA Banner ────────────────────────────────────────────────────────── -->
      <section class="bg-blue-600 py-16">
        <div class="max-w-4xl mx-auto px-4 text-center sm:px-6 lg:px-8">
          <h3 class="text-4xl text-white mb-4">Ready to Get Started?</h3>
          <p class="text-blue-100 text-lg mb-8">
            Join families managing medication with confidence and care.
          </p>
          <button
            data-navigate="/register"
            class="px-10 py-4 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition-colors shadow-lg text-lg"
          >
            Create Your Account
          </button>
        </div>
      </section>

      <!-- Footer -->
      <footer class="bg-gray-900 text-white py-12">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div class="flex items-center justify-center gap-3 mb-4">
            <div class="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <i data-lucide="pill" class="w-6 h-6 text-white"></i>
            </div>
            <span class="text-2xl">MedDrop Dispenser</span>
          </div>
          <p class="text-gray-400">
            © 2026 MedDrop Dispenser. Helping patients manage medications safely.
          </p>
        </div>
      </footer>
    </div>
  `;
}

export function attachLandingPageListeners() {
  // Navigation button listeners
  document.querySelectorAll('[data-navigate]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const path = e.currentTarget.getAttribute('data-navigate');
      navigateTo(path);
    });
  });

  // Initialize Lucide icons
  initLucideIcons();
}

// Helper functions to get feature-specific styling
function getFeatureIcon(index) {
  const icons = [
    'pill',           // 1. Multi-Medication
    'clock', // 2. Scheduled Dispensing (Updated to avoid duplicate clock)
    'volume-2',       // 3. Audio & Visual Alerts (Emphasizes the machine buzzer)
    'bell',          // 4. Smart Notifications (Per your request)
    'activity',       // 5. Patient Dashboard 
    'shield-check'    // 6. RFID Security
  ];
  return icons[index] || 'clock';
}

function getFeatureIconBg(index) {
  const backgrounds = [
    'bg-purple-100', // Multi-Med
    'bg-blue-100',   // Scheduled
    'bg-amber-100',  // Alerts
    'bg-teal-100',   // Notifications
    'bg-rose-100',   // Dashboard
    'bg-indigo-100'  // RFID
  ];
  return backgrounds[index] || 'bg-blue-100';
}

function getFeatureIconColor(index) {
  const colors = [
    'text-purple-500', 
    'text-blue-600', 
    'text-amber-500', 
    'text-teal-600', 
    'text-rose-500', 
    'text-indigo-600'
  ];
  return colors[index] || 'text-blue-600';
}
