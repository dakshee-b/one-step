import { appState } from '../state.js';
import { api, ApiError } from '../api.js';
import { navigateTo, initLucideIcons, isValidRFID, readFileAsDataURL } from '../utils.js';

let currentStep = 1;
let formData = {
  username: '', password: '', confirmPassword: '', age: '', medicalHistory: '',
  caregiverName: '', allergies: '', rfidUid: '', pill1Name: '', pill1Time: '08:00',
  pill1Dosage: '1', pill2Name: '', pill2Time: '14:00', pill2Dosage: '1',
  pill3Name: '', pill3Time: '20:00', pill3Dosage: '1',
  profilePhoto: '',   // base64 data URL for preview only
  profilePhotoFile: null,  // actual File for multipart upload after register
};
let submitError = '';
let showPassword = false;
let showConfirm = false;

const STEPS = [
  { number: 1, label: "Account Setup", icon: "lock" },
  { number: 2, label: "Personal Info", icon: "user" },
  { number: 3, label: "Medication Setup", icon: "pill" }
];

export function renderRegistrationPage() {
  return `
    <div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <header class="bg-white shadow-sm">
        <div class="max-w-3xl mx-auto px-4 py-5 sm:px-6 flex items-center gap-3">
          <button data-navigate="/" class="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <i data-lucide="arrow-left" class="w-5 h-5 text-gray-600"></i>
          </button>
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm">
              <i data-lucide="pill" class="w-6 h-6 text-white"></i>
            </div>
            <h1 class="text-xl text-blue-900">medDrop Registration</h1>
          </div>
        </div>
      </header>

      <div class="max-w-3xl mx-auto px-4 pt-8 pb-6 sm:px-6">
        <div class="flex items-start justify-center gap-0">
          ${STEPS.map((s, idx) => {
            const isDone = currentStep > s.number;
            const isActive = currentStep === s.number;
            return `
              <div class="flex items-start">
                <div class="flex flex-col items-center w-28">
                  <div class="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm ${
                    isDone ? 'bg-green-500 text-white' :
                    isActive ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
                    'bg-gray-200 text-gray-400'
                  }">
                    ${isDone ? '<i data-lucide="check" class="w-5 h-5"></i>' : `<i data-lucide="${s.icon}" class="w-5 h-5"></i>`}
                  </div>
                  <span class="text-xs text-center mt-2 leading-tight px-1 ${
                    isActive ? 'text-blue-600' : isDone ? 'text-green-600' : 'text-gray-400'
                  }">
                    ${s.label}
                  </span>
                </div>
                ${idx < STEPS.length - 1 ? `
                  <div class="mt-6 flex-1 h-0.5 w-12 sm:w-16 transition-colors duration-300 mx-1"
                    style="background: ${currentStep > s.number ? '#22c55e' : '#e5e7eb'}"></div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="max-w-3xl mx-auto px-4 pb-20 sm:px-6">
        <div class="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div class="px-8 py-4 border-b border-gray-100 ${
            currentStep === 1 ? 'bg-purple-50' : currentStep === 2 ? 'bg-amber-50' : 'bg-blue-50'
          }">
            ${renderStepHeader()}
          </div>

          <div class="p-8">
            <form id="registration-form">
              ${submitError ? `
                <div class="mb-5 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                  <i data-lucide="alert-circle" class="w-4 h-4 flex-shrink-0"></i>
                  <span>${submitError}</span>
                </div>
              ` : ''}
              ${currentStep === 1 ? renderStep1() : currentStep === 2 ? renderStep2() : renderStep3()}
            </form>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderStepHeader() {
  if (currentStep === 1) {
    return `
      <div class="flex items-center gap-3">
        <i data-lucide="shield-check" class="w-5 h-5 text-purple-600"></i>
        <div>
          <p class="text-purple-900">Step 1 of 3 — Account Setup</p>
          <p class="text-xs text-purple-500 mt-0.5">Create your login credentials</p>
        </div>
      </div>
    `;
  } else if (currentStep === 2) {
    return `
      <div class="flex items-center gap-3">
        <i data-lucide="user" class="w-5 h-5 text-amber-600"></i>
        <div>
          <p class="text-amber-900">Step 2 of 3 — Personal Info</p>
          <p class="text-xs text-amber-500 mt-0.5">Patient and caregiver information</p>
        </div>
      </div>
    `;
  } else {
    return `
      <div class="flex items-center gap-3">
        <i data-lucide="pill" class="w-5 h-5 text-blue-600"></i>
        <div>
          <p class="text-blue-900">Step 3 of 3 — Medication Setup</p>
          <p class="text-xs text-blue-500 mt-0.5">Configure your medications and schedule</p>
        </div>
      </div>
    `;
  }
}

function renderStep1() {
  return `
    <div class="space-y-6">
      <div>
        <h2 class="text-2xl text-gray-900">Account Setup</h2>
        <p class="text-sm text-gray-400 mt-1">Create your username and a secure password</p>
      </div>

      <div class="border-2 border-purple-200 rounded-xl p-5 space-y-5 bg-purple-50/40">
        <div>
          <label class="block text-sm mb-2 text-gray-700">
            <i data-lucide="user" class="w-4 h-4 inline mr-1.5 align-middle text-purple-500"></i>
            Username
          </label>
          <input
            type="text"
            id="username"
            value="${formData.username}"
            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-gray-900"
            placeholder="Enter username"
            required
          />
          <p class="text-red-500 text-xs mt-1 hidden" id="username-error"></p>
        </div>

        <div>
          <label class="block text-sm mb-2 text-gray-700">
            <i data-lucide="lock" class="w-4 h-4 inline mr-1.5 align-middle text-purple-500"></i>
            Password
          </label>
          <div class="relative">
            <input
              type="${showPassword ? 'text' : 'password'}"
              id="password"
              value="${formData.password}"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-gray-900 pr-12"
              placeholder="Create a password"
              required
            />
            <button type="button" id="toggle-password"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <i data-lucide="${showPassword ? 'eye-off' : 'eye'}" class="w-5 h-5"></i>
            </button>
          </div>
          <p class="text-red-500 text-xs mt-1 hidden" id="password-error"></p>
        </div>

        <div>
          <label class="block text-sm mb-2 text-gray-700">
            <i data-lucide="lock" class="w-4 h-4 inline mr-1.5 align-middle text-purple-500"></i>
            Confirm Password
          </label>
          <div class="relative">
            <input
              type="${showConfirm ? 'text' : 'password'}"
              id="confirmPassword"
              value="${formData.confirmPassword}"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-gray-900 pr-12"
              placeholder="Repeat your password"
              required
            />
            <button type="button" id="toggle-confirm"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <i data-lucide="${showConfirm ? 'eye-off' : 'eye'}" class="w-5 h-5"></i>
            </button>
          </div>
          <p class="text-red-500 text-xs mt-1 hidden" id="confirmPassword-error"></p>
        </div>
      </div>

      <button type="button" id="next-step"
        class="w-full py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:scale-[0.99] transition-all">
        Continue to Personal Info →
      </button>

      <p class="text-center text-sm text-gray-400">
        Already have an account?
        <button type="button" data-navigate="/login" class="text-blue-600 hover:underline">Log in</button>
      </p>
    </div>
  `;
}

function renderStep2() {
  return `
    <div class="space-y-6">
      <div>
        <h2 class="text-2xl text-gray-900">Patient & Caregiver Information</h2>
        <p class="text-sm text-gray-400 mt-1">Tell us about the patient and their caregiver</p>
      </div>

      <div class="flex flex-col items-center py-3">
        <button
          type="button"
          id="photo-upload-btn"
          class="relative w-24 h-24 rounded-full bg-amber-50 border-2 border-dashed border-amber-300 hover:border-amber-500 transition-colors flex items-center justify-center overflow-hidden group"
        >
          ${formData.profilePhoto ? `
            <img src="${formData.profilePhoto}" alt="Preview" class="w-full h-full object-cover" />
            <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <i data-lucide="camera" class="w-6 h-6 text-white"></i>
            </div>
          ` : `
            <i data-lucide="camera" class="w-8 h-8 text-amber-400 group-hover:text-amber-600 transition-colors"></i>
          `}
        </button>
        <input id="photo-upload" type="file" accept="image/*" class="hidden" />
        <p class="text-xs text-gray-500 mt-2">
          Click to upload profile photo <span class="text-gray-400">(optional)</span>
        </p>
      </div>

      <div class="border-2 border-amber-200 rounded-xl p-5 space-y-5 bg-amber-50/40">
        <div>
          <label class="block text-sm mb-2 text-gray-700">
            <i data-lucide="calendar" class="w-4 h-4 inline mr-1.5 align-middle text-amber-500"></i>
            Age
          </label>
          <input
            type="number"
            id="age"
            value="${formData.age}"
            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-gray-900"
            placeholder="Enter age"
            required
            min="1"
            max="120"
          />
          <p class="text-red-500 text-xs mt-1 hidden" id="age-error"></p>
        </div>

        <div>
          <label class="block text-sm mb-2 text-gray-700">
            <i data-lucide="heart" class="w-4 h-4 inline mr-1.5 align-middle text-amber-500"></i>
            Medical History
          </label>
          <textarea
            id="medicalHistory"
            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-gray-900 resize-none"
            rows="3"
            placeholder="Brief medical history or conditions"
            required
          >${formData.medicalHistory}</textarea>
          <p class="text-red-500 text-xs mt-1 hidden" id="medicalHistory-error"></p>
        </div>

        <div>
          <label class="block text-sm mb-2 text-gray-700">
            <i data-lucide="user" class="w-4 h-4 inline mr-1.5 align-middle text-amber-500"></i>
            Caregiver Name
          </label>
          <input
            type="text"
            id="caregiverName"
            value="${formData.caregiverName}"
            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-gray-900"
            placeholder="Enter caregiver's full name"
            required
          />
          <p class="text-red-500 text-xs mt-1 hidden" id="caregiverName-error"></p>
        </div>

        <div>
          <label class="block text-sm mb-2 text-gray-700">
            Allergies
            <span class="text-gray-400 text-xs ml-1">(optional)</span>
          </label>
          <textarea
            id="allergies"
            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-gray-900 resize-none"
            rows="2"
            placeholder="List any known allergies"
          >${formData.allergies}</textarea>
        </div>

        <div>
          <label class="block text-sm mb-2 text-gray-700">
            <i data-lucide="credit-card" class="w-4 h-4 inline mr-1.5 align-middle text-amber-500"></i>
            RFID Tag ID
          </label>
          <input
            type="text"
            id="rfidUid"
            value="${formData.rfidUid}"
            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-gray-900"
            placeholder="e.g., A1B2-C3D4 or 1A2B3C4D"
            required
          />
          <p class="text-red-500 text-xs mt-1 hidden" id="rfidUid-error"></p>
          <p class="text-xs text-gray-400 mt-1">
            Enter the unique ID printed on your RFID card
          </p>
        </div>
      </div>

      <div class="flex gap-3">
        <button type="button" id="back-step"
          class="flex-1 py-4 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors">
          ← Back
        </button>
        <button type="button" id="next-step"
          class="flex-1 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">
          Continue to Medication Setup →
        </button>
      </div>
    </div>
  `;
}

function renderStep3() {
  const medBlocks = [
    { title: "Medication 1", bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-600", pillBg: "#3b82f6", prefix: "pill1" },
    { title: "Medication 2", bg: "bg-green-50", border: "border-green-200", icon: "text-green-600", pillBg: "#22c55e", prefix: "pill2" },
    { title: "Medication 3", bg: "bg-purple-50", border: "border-purple-200", icon: "text-purple-600", pillBg: "#a855f7", prefix: "pill3" }
  ];

  return `
    <div class="space-y-8">
      <div>
        <h2 class="text-2xl text-gray-900">Medication Configuration</h2>
        <p class="text-sm text-gray-400 mt-1">
          Configure up to 3 medications with scheduled times and dosage
        </p>
      </div>

      ${medBlocks.map(med => `
        <div class="${med.bg} border-2 ${med.border} rounded-xl p-5">
          <h3 class="mb-4 flex items-center gap-2 ${med.icon}">
            <span class="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs"
              style="background: ${med.pillBg}">
              <i data-lucide="pill" class="w-3.5 h-3.5"></i>
            </span>
            ${med.title}
          </h3>
          <div class="space-y-4">
            <div>
              <label class="block text-sm mb-2 text-gray-700">Medication Name</label>
              <input
                type="text"
                id="${med.prefix}Name"
                value="${formData[`${med.prefix}Name`]}"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-gray-900"
                placeholder="e.g., Aspirin"
                required
              />
              <p class="text-red-500 text-xs mt-1 hidden" id="${med.prefix}Name-error"></p>
            </div>

            <div>
              <label class="block text-sm mb-2 text-gray-700">
                <i data-lucide="clock" class="w-4 h-4 inline mr-1.5 align-middle"></i>
                Time
              </label>
              <input
                type="time"
                id="${med.prefix}Time"
                value="${formData[`${med.prefix}Time`]}"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-gray-900"
                required
              />
              <p class="text-red-500 text-xs mt-1 hidden" id="${med.prefix}Time-error"></p>
            </div>

            <div>
              <label class="block text-sm mb-2 text-gray-700">Pills per dose (dosage)</label>
              <input
                type="number"
                id="${med.prefix}Dosage"
                value="${formData[`${med.prefix}Dosage`]}"
                min="1"
                max="10"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-gray-900"
                placeholder="e.g., 2"
                required
              />
              <p class="text-red-500 text-xs mt-1 hidden" id="${med.prefix}Dosage-error"></p>
            </div>
          </div>
        </div>
      `).join('')}

      <div class="flex gap-3 pt-2">
        <button type="button" id="back-step"
          class="flex-1 py-4 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors">
          ← Back
        </button>
        <button type="submit"
          class="flex-1 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
          <i data-lucide="check" class="w-5 h-5"></i>
          Complete Registration
        </button>
      </div>
    </div>
  `;
}

export function attachRegistrationPageListeners() {
  function saveFormData() {
    const fields = ['username', 'password', 'confirmPassword', 'age', 'medicalHistory',
      'caregiverName', 'allergies', 'rfidUid', 'pill1Name', 'pill1Time', 'pill1Dosage',
      'pill2Name', 'pill2Time', 'pill2Dosage', 'pill3Name', 'pill3Time', 'pill3Dosage'];

    fields.forEach(field => {
      const el = document.getElementById(field);
      if (el) formData[field] = el.value;
    });
  }

  function validateStep1() {
    saveFormData();
    let valid = true;

    if (!formData.username) {
      showError('username', 'Username is required');
      valid = false;
    }

    if (!formData.password) {
      showError('password', 'Password is required');
      valid = false;
    } else if (formData.password.length < 6) {
      showError('password', 'At least 6 characters required');
      valid = false;
    }

    if (!formData.confirmPassword) {
      showError('confirmPassword', 'Please confirm your password');
      valid = false;
    } else if (formData.password !== formData.confirmPassword) {
      showError('confirmPassword', 'Passwords do not match');
      valid = false;
    }

    return valid;
  }

  function validateStep2() {
    saveFormData();
    let valid = true;

    if (!formData.age || formData.age < 1 || formData.age > 120) {
      showError('age', 'Enter a valid age');
      valid = false;
    }

    if (!formData.medicalHistory) {
      showError('medicalHistory', 'Medical history is required');
      valid = false;
    }

    if (!formData.caregiverName) {
      showError('caregiverName', 'Caregiver name is required');
      valid = false;
    }

    if (!formData.rfidUid) {
      showError('rfidUid', 'RFID Tag ID is required');
      valid = false;
    } else if (!isValidRFID(formData.rfidUid)) {
      showError('rfidUid', 'Invalid RFID format (use hex characters and dashes)');
      valid = false;
    }

    return valid;
  }

  function showError(field, message) {
    const errorEl = document.getElementById(`${field}-error`);
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    }
  }

  function clearErrors() {
    document.querySelectorAll('[id$="-error"]').forEach(el => {
      el.classList.add('hidden');
      el.textContent = '';
    });
  }

  const photoUploadBtn = document.getElementById('photo-upload-btn');
  const photoUploadInput = document.getElementById('photo-upload');

  if (photoUploadBtn && photoUploadInput) {
    photoUploadBtn.addEventListener('click', () => {
      photoUploadInput.click();
    });

    photoUploadInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const dataURL = await readFileAsDataURL(file);
        formData.profilePhoto = dataURL;     // preview
        formData.profilePhotoFile = file;    // for multipart upload after register
        renderPage();
      }
    });
  }

  const togglePassword = document.getElementById('toggle-password');
  const toggleConfirm = document.getElementById('toggle-confirm');

  if (togglePassword) {
    togglePassword.addEventListener('click', () => {
      showPassword = !showPassword;
      renderPage();
    });
  }

  if (toggleConfirm) {
    toggleConfirm.addEventListener('click', () => {
      showConfirm = !showConfirm;
      renderPage();
    });
  }

  const nextStepBtn = document.getElementById('next-step');
  if (nextStepBtn) {
    nextStepBtn.addEventListener('click', () => {
      clearErrors();
      submitError = '';
      if (currentStep === 1 && validateStep1()) {
        currentStep = 2;
        renderPage();
      } else if (currentStep === 2 && validateStep2()) {
        currentStep = 3;
        renderPage();
      }
    });
  }

  const backStepBtn = document.getElementById('back-step');
  if (backStepBtn) {
    backStepBtn.addEventListener('click', () => {
      saveFormData();
      currentStep--;
      renderPage();
    });
  }

  const form = document.getElementById('registration-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      saveFormData();

      let valid = true;
      ['pill1Name', 'pill1Time', 'pill1Dosage', 'pill2Name', 'pill2Time', 'pill2Dosage',
       'pill3Name', 'pill3Time', 'pill3Dosage'].forEach(field => {
        if (!formData[field]) {
          showError(field, `${field} is required`);
          valid = false;
        }
      });
      if (!valid) return;

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i data-lucide="loader" class="w-5 h-5 animate-spin"></i> Creating account...';
      initLucideIcons();

      const payload = {
        username: formData.username,
        password: formData.password,
        age: parseInt(formData.age, 10),
        medicalHistory: formData.medicalHistory,
        caregiverName: formData.caregiverName,
        allergies: formData.allergies || null,
        rfidUid: formData.rfidUid,
        medications: [
          { slot: 1, name: formData.pill1Name, time: formData.pill1Time, dosage: parseInt(formData.pill1Dosage, 10) },
          { slot: 2, name: formData.pill2Name, time: formData.pill2Time, dosage: parseInt(formData.pill2Dosage, 10) },
          { slot: 3, name: formData.pill3Name, time: formData.pill3Time, dosage: parseInt(formData.pill3Dosage, 10) },
        ],
      };

      try {
        const { user, token } = await api.register(payload);
        appState.setUser(user, token);

        // Upload photo after register (Option B — multipart, not base64).
        if (formData.profilePhotoFile) {
          try {
            const { profilePhotoUrl } = await api.uploadPhoto(formData.profilePhotoFile);
            appState.updateUser({ profilePhotoUrl });
          } catch (_) {
            // Photo upload failure is non-blocking — user can retry from profile.
          }
        }

        navigateTo('/dashboard');
      } catch (err) {
        if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.details) {
          Object.entries(err.details).forEach(([field, message]) => {
            const localField = field
              .replace(/^medications\[0\]\./, 'pill1')
              .replace(/^medications\[1\]\./, 'pill2')
              .replace(/^medications\[2\]\./, 'pill3')
              .replace(/^pill(\d)\.name$/,   'pill$1Name')
              .replace(/^pill(\d)\.time$/,   'pill$1Time')
              .replace(/^pill(\d)\.dosage$/, 'pill$1Dosage');
            showError(localField, message);
          });
          submitError = err.message;
        } else if (err instanceof ApiError && err.code === 'ALREADY_REGISTERED') {
          submitError = 'This device is already registered. Please sign in instead.';
        } else {
          submitError = err.message || 'Registration failed. Please try again.';
        }
        renderPage();
      } finally {
        submitBtn.disabled = false;
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

function renderPage() {
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = renderRegistrationPage();
    attachRegistrationPageListeners();
  }
}
