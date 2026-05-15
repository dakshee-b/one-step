import { CONFIG } from '../config.js';
import { appState } from '../state.js';
import { api, ApiError } from '../api.js';
import { navigateTo, initLucideIcons, formatTime, maskRfidUid } from '../utils.js';

// ---------- UI state (toggles + edit drafts) ----------
let activeTab = 'overview';
let chartView = 'weekly';
let editingMedicationId = null;
let editForm = { name: '', time: '08:00', dosage: 1 };
let showNotifications = false;
let isDocumentListenerAdded = false;
let isEditingProfile = false;
let profileDraft = { username: '', age: '', medicalHistory: '', caregiverName: '', allergies: '' };

// Monthly calendar navigation state. 1-indexed month to match the API.
const _now = new Date();
let monthlyYear = _now.getFullYear();
let monthlyMonth = _now.getMonth() + 1;

// ---------- Data cache (filled by refreshAll on first render) ----------
let dashboardData = {
  loading: true,
  overview: null,
  today: [],
  notifications: [],
  unreadCount: 0,
  weekly: null,
  monthly: null,
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------- Data loaders ----------
async function refreshAll() {
  try {
    const [overview, today, notifs, weekly] = await Promise.all([
      api.getOverview(),
      api.getToday(),
      api.getNotifications(),
      api.getWeeklyAdherence(),
    ]);
    dashboardData.overview = overview;
    dashboardData.today = today.medications;
    dashboardData.notifications = notifs.notifications;
    dashboardData.unreadCount = notifs.unreadCount;
    dashboardData.weekly = weekly;
    dashboardData.loading = false;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      await appState.logout();
      navigateTo('/login');
      return;
    }
    console.error('Failed to load dashboard data', err);
    dashboardData.loading = false;
  }
}

async function refreshTodayAndOverview() {
  const [overview, today] = await Promise.all([api.getOverview(), api.getToday()]);
  dashboardData.overview = overview;
  dashboardData.today = today.medications;
}

async function refreshNotifications() {
  const notifs = await api.getNotifications();
  dashboardData.notifications = notifs.notifications;
  dashboardData.unreadCount = notifs.unreadCount;
}

async function loadMonthly() {
  dashboardData.monthly = await api.getMonthlyAdherence(monthlyYear, monthlyMonth);
}

// ---------- Rendering ----------
export function renderDashboardPage() {
  const user = appState.user;
  if (!user) {
    navigateTo('/login');
    return '<div class="min-h-screen bg-gray-50"></div>';
  }

  if (dashboardData.loading) {
    return renderLoadingSkeleton(user);
  }

  const today = dashboardData.today;
  const overview = dashboardData.overview ?? { totalPillsAvailable: 0, capacity: CONFIG.SYSTEM_CAPACITY, remainingToday: 0, missedThisWeek: 0 };
  const weekly = dashboardData.weekly ?? { days: [], totalTaken: 0, totalMissed: 0, adherenceRate: 0 };
  const medNames = today.map(m => m.name);

  return `
    <div class="min-h-screen bg-gray-50">
      ${renderHeader(user)}

      <div class="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-1 flex gap-1 w-fit">
          <button id="tab-overview" class="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm transition-colors ${
            activeTab === 'overview' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
          }">
            <i data-lucide="activity" class="w-4 h-4"></i>Overview
          </button>
          <button id="tab-profile" class="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm transition-colors ${
            activeTab === 'profile' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
          }">
            <i data-lucide="user" class="w-4 h-4"></i>Profile
          </button>
        </div>

        ${activeTab === 'overview'
          ? renderOverviewTab(today, overview, weekly, medNames)
          : renderProfileTab(user)}
      </div>
    </div>
  `;
}

function renderLoadingSkeleton(user) {
  return `
    <div class="min-h-screen bg-gray-50">
      ${renderHeader(user)}
      <div class="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8 flex flex-col items-center justify-center gap-3 text-gray-400">
        <i data-lucide="loader" class="w-8 h-8 animate-spin"></i>
        <p class="text-sm">Loading dashboard...</p>
      </div>
    </div>
  `;
}

function renderHeader(user) {
  const notifs = dashboardData.notifications;
  return `
    <header class="bg-white shadow-sm sticky top-0 z-30">
      <div class="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm">
            <i data-lucide="pill" class="w-6 h-6 text-white"></i>
          </div>
          <div>
            <p class="text-lg text-blue-900">medDrop Dashboard</p>
            <p class="text-xs text-gray-500">Welcome back, <span class="text-blue-600">${user.username}</span></p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <div class="relative" id="notifications-container">
            <button id="notifications-toggle" class="relative p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <i data-lucide="bell" class="w-6 h-6 text-gray-500"></i>
              ${notifs.length > 0 ? `
                <span class="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                  ${notifs.length}
                </span>
              ` : ''}
            </button>
            ${showNotifications ? renderNotificationsDropdown(notifs) : ''}
          </div>

          ${user.profilePhotoUrl ? `
            <img src="${user.profilePhotoUrl}" alt="" class="w-8 h-8 rounded-full object-cover border-2 border-blue-100 ml-1" />
          ` : `
            <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center ml-1">
              <i data-lucide="user" class="w-4 h-4 text-blue-600"></i>
            </div>
          `}

          <button id="logout-btn" class="flex items-center gap-2 px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm ml-1">
            <i data-lucide="log-out" class="w-4 h-4"></i>
            Logout
          </button>
        </div>
      </div>
    </header>
  `;
}

function renderNotificationsDropdown(notifs) {
  return `
    <div class="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-1rem)] bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white">
        <div>
          <p class="text-gray-900 text-sm">Notifications</p>
          <p class="text-xs text-gray-400">${notifs.length} unread alert${notifs.length !== 1 ? 's' : ''}</p>
        </div>
        <div class="flex items-center gap-3">
          ${notifs.length > 0 ? `<button id="clear-all-notifications" class="text-xs text-blue-600 hover:underline">Clear all</button>` : ''}
          <button id="close-notifications" class="p-1 hover:bg-gray-100 rounded-lg">
            <i data-lucide="x" class="w-4 h-4 text-gray-400"></i>
          </button>
        </div>
      </div>

      <div class="overflow-y-auto max-h-[440px] notif-scroll">
        ${notifs.length === 0 ? `
          <div class="flex flex-col items-center justify-center py-14 text-gray-300">
            <i data-lucide="bell" class="w-10 h-10 mb-2 opacity-30"></i>
            <p class="text-gray-400 text-sm">You're all caught up!</p>
          </div>
        ` : `
          <div class="p-3 space-y-2">
            ${notifs.map(n => renderNotificationItem(n)).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}

function renderNotificationItem(n) {
  const cfg = {
    success: { border: 'border-l-green-500', bg: 'bg-green-50', icon: 'check-circle', color: 'text-green-600' },
    info:    { border: 'border-l-blue-400',  bg: 'bg-blue-50',  icon: 'bell',         color: 'text-blue-600' },
    warning: { border: 'border-l-amber-400', bg: 'bg-amber-50', icon: 'alert-circle', color: 'text-amber-600' },
    danger:  { border: 'border-l-red-500',   bg: 'bg-red-50',   icon: 'x-circle',     color: 'text-red-600' },
  };
  const c = cfg[n.type] ?? cfg.info;
  return `
    <div class="flex items-start gap-3 p-3 rounded-xl border-l-4 ${c.border} ${c.bg}">
      <div class="flex-shrink-0 mt-0.5">
        <i data-lucide="${c.icon}" class="w-4 h-4 ${c.color}"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-gray-900 text-sm">${n.title}</p>
        <p class="text-gray-500 text-xs mt-0.5">${n.desc}</p>
        <p class="text-gray-400 text-xs mt-1">${n.time}</p>
      </div>
      <button data-dismiss-notification="${n.id}" class="flex-shrink-0 p-1 hover:bg-black/10 rounded-lg transition-colors">
        <i data-lucide="x" class="w-3.5 h-3.5 text-gray-400"></i>
      </button>
    </div>
  `;
}

function renderOverviewTab(today, overview, weekly, medNames) {
  return `
    <div class="space-y-6">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        ${renderStatCard('package',  'Total Pills Available in System', String(overview.totalPillsAvailable), `out of ${overview.capacity} total capacity`, 'bg-blue-50',  'text-blue-700')}
        ${renderStatCard('clock',    'Medication Remaining Today',      String(overview.remainingToday),      'doses left for today',                       'bg-amber-50', 'text-amber-600')}
        ${renderStatCard('x-circle', 'Missed This Week',                String(overview.missedThisWeek),      'doses missed this week',                     'bg-red-50',   'text-red-600')}
      </div>

      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div class="mb-5">
          <h2 class="text-xl text-gray-900 flex items-center gap-2">
            <i data-lucide="pill" class="w-5 h-5 text-blue-600"></i> My Medications
          </h2>
          <p class="text-sm text-gray-400 mt-0.5">
            Click <i data-lucide="pencil" class="w-3 h-3 inline align-middle"></i> to edit name, time, or dosage
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          ${today.map((med, idx) => renderMedicationCard(med, idx)).join('')}
        </div>
      </div>

      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div class="flex items-center justify-between mb-5">
          <div>
            <h2 class="text-xl text-gray-900">Adherence Tracker</h2>
            <p class="text-sm text-gray-400">Medication compliance overview</p>
          </div>
          <div class="flex bg-gray-100 rounded-lg p-1 gap-1">
            <button id="chart-view-weekly"  class="px-4 py-1.5 rounded-md text-sm transition-colors capitalize ${chartView === 'weekly'  ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}">weekly</button>
            <button id="chart-view-monthly" class="px-4 py-1.5 rounded-md text-sm transition-colors capitalize ${chartView === 'monthly' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}">monthly</button>
          </div>
        </div>

        ${chartView === 'weekly'
          ? renderWeeklyChart(medNames, weekly)
          : renderMonthlyCalendar(medNames)}
      </div>
    </div>
  `;
}

function renderStatCard(icon, label, value, sub, bg, vc) {
  return `
    <div class="${bg} rounded-2xl p-5">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
          <i data-lucide="${icon}" class="w-6 h-6 ${vc.replace('-700', '-600')}"></i>
        </div>
        <span class="text-sm text-gray-500 leading-tight">${label}</span>
      </div>
      <p class="text-4xl mb-1 ${vc}">${value}</p>
      <p class="text-xs text-gray-400">${sub}</p>
    </div>
  `;
}

function renderMedicationCard(med, idx) {
  const c = CONFIG.MED_COLORS[idx] ?? CONFIG.MED_COLORS[0];
  const isEditing = editingMedicationId === med.medicationId;
  const statusConfig = {
    dispensed: { bg: 'bg-green-100', tx: 'text-green-700', icon: 'check-circle', label: 'Completed' },
    completed: { bg: 'bg-green-100', tx: 'text-green-700', icon: 'check-circle', label: 'Completed' },
    pending:   { bg: 'bg-amber-100', tx: 'text-amber-700', icon: 'clock',        label: 'Pending'   },
    upcoming:  { bg: 'bg-gray-100',  tx: 'text-gray-600',  icon: 'alert-circle', label: 'Upcoming'  },
    missed:    { bg: 'bg-red-100',   tx: 'text-red-700',   icon: 'x-circle',     label: 'Missed'    },
  };
  const statusC = statusConfig[med.status] ?? statusConfig.upcoming;
  const remaining = med.remainingPills;
  const capacity = CONFIG.MAX_CAPACITY;

  return `
    <div class="rounded-xl border-2 ${c.border} ${c.bg} p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0 ${c.dot}"></span>
          ${isEditing ? `
            <input id="edit-name-${med.medicationId}" value="${editForm.name}" class="flex-1 min-w-0 bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
          ` : `
            <span class="text-gray-900 text-sm truncate">${med.name}</span>
          `}
        </div>
        ${!isEditing ? `
          <button data-edit-med="${med.medicationId}" class="p-1.5 hover:bg-white/80 rounded-lg flex-shrink-0 ${c.icon}">
            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
          </button>
        ` : `
          <div class="flex gap-1 flex-shrink-0">
            <button data-save-med="${med.medicationId}" class="p-1.5 bg-green-100 hover:bg-green-200 rounded-lg">
              <i data-lucide="check" class="w-3.5 h-3.5 text-green-700"></i>
            </button>
            <button data-cancel-edit class="p-1.5 bg-red-100 hover:bg-red-200 rounded-lg">
              <i data-lucide="x" class="w-3.5 h-3.5 text-red-700"></i>
            </button>
          </div>
        `}
      </div>

      <div class="flex items-center gap-2 text-sm">
        <i data-lucide="pill" class="w-3.5 h-3.5 flex-shrink-0 ${c.icon}"></i>
        ${isEditing ? `
          <div class="flex items-center gap-1.5">
            <input type="number" id="edit-dosage-${med.medicationId}" min="1" max="10" value="${editForm.dosage}" class="w-14 bg-white border border-gray-300 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
            <span class="text-gray-400 text-xs">pill(s)/day</span>
          </div>
        ` : `
          <span class="text-gray-700 text-sm">${med.dosage} pill${med.dosage > 1 ? 's' : ''}/day</span>
        `}
      </div>

      <div class="flex items-center gap-2 text-sm">
        <i data-lucide="clock" class="w-3.5 h-3.5 flex-shrink-0 ${c.icon}"></i>
        ${isEditing ? `
          <input type="time" id="edit-time-${med.medicationId}" value="${editForm.time}" class="bg-white border border-gray-300 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
        ` : `
          <span class="text-gray-700 text-sm">${formatTime(med.time)}</span>
        `}
      </div>

      <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs w-fit ${statusC.bg} ${statusC.tx}">
        <i data-lucide="${statusC.icon}" class="w-3.5 h-3.5"></i>${statusC.label}
      </div>

      <div class="pt-2 border-t border-white/70">
        <div class="flex justify-between text-xs mb-1.5">
          <span class="text-gray-500">Remaining Pills in Dispenser</span>
          <span class="${remaining <= 2 ? 'text-red-600' : 'text-gray-500'}">
            ${remaining}/${capacity}
          </span>
        </div>
        <div class="h-2 bg-white/80 rounded-full overflow-hidden border border-gray-200">
          <div class="h-full rounded-full transition-all ${
            remaining <= 2 ? 'bg-red-500' : remaining <= 4 ? 'bg-amber-400' : c.dot
          }" style="width: ${(remaining / capacity) * 100}%"></div>
        </div>
        ${remaining <= 2 ? `
          <p class="text-xs text-red-600 mt-1 flex items-center gap-1">
            <i data-lucide="alert-circle" class="w-3 h-3"></i> Refill soon
          </p>
        ` : ''}
      </div>
    </div>
  `;
}

function renderWeeklyChart(medNames, weekly) {
  const CHART_H = 192;
  const MAX_UNITS = 3;
  const days = weekly.days ?? [];

  let barsHTML = '';
  days.forEach((d) => {
    const totalUnits = d.p1 + d.p2 + d.p3 + d.missed + d.upcoming;
    const barH = (totalUnits / MAX_UNITS) * CHART_H;

    const segments = [
      { val: d.p1, color: CONFIG.MED_COLORS[0].hex },
      { val: d.p2, color: CONFIG.MED_COLORS[1].hex },
      { val: d.p3, color: CONFIG.MED_COLORS[2].hex },
      { val: d.missed, color: '#f87171' },
      { val: d.upcoming, color: '#bfdbfe' },
    ].filter(s => s.val > 0);

    let segmentsHTML = '';
    segments.forEach(s => {
      const segH = (s.val / MAX_UNITS) * CHART_H;
      segmentsHTML += `<div style="height: ${segH}px; background: ${s.color}; flex-shrink: 0;"></div>`;
    });

    barsHTML += `<div class="w-14 flex flex-col-reverse rounded-t overflow-hidden flex-shrink-0" style="height: ${barH}px">${segmentsHTML}</div>`;
  });

  return `
    <div>
      <div class="flex flex-wrap gap-4 mb-5 text-sm text-gray-500">
        ${medNames.map((name, i) => `
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-sm inline-block" style="background: ${CONFIG.MED_COLORS[i].hex}"></span>
            ${name}
          </div>
        `).join('')}
        <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm inline-block bg-red-400"></span>Missed</div>
        <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm inline-block bg-blue-100"></span>Scheduled</div>
      </div>

      <div class="flex gap-2">
        <div class="flex flex-col justify-between items-end pr-1 shrink-0" style="height: ${CHART_H}px">
          ${[3, 2, 1, 0].map(v => `<span class="text-xs text-gray-300 leading-none">${v}</span>`).join('')}
        </div>

        <div class="flex-1 flex flex-col gap-0">
          <div class="relative flex-1" style="height: ${CHART_H}px">
            ${[1, 2, 3].map(tick => `
              <div class="absolute left-0 right-0 border-t border-gray-100 pointer-events-none" style="bottom: ${(tick / MAX_UNITS) * 100}%"></div>
            `).join('')}

            <div class="flex items-end h-full gap-4 px-2 justify-center">
              ${barsHTML}
            </div>
          </div>

          <div class="flex gap-4 px-2 mt-2 justify-center">
            ${days.map(d => `<div class="w-14 text-center text-xs text-gray-400 flex-shrink-0">${d.day}</div>`).join('')}
          </div>
        </div>
      </div>

      <div class="mt-5 grid grid-cols-3 gap-3 pt-4 border-t border-gray-100">
        <div class="text-center">
          <p class="text-3xl text-green-600">${weekly.totalTaken}</p>
          <p class="text-xs text-gray-400 mt-0.5">Doses taken</p>
        </div>
        <div class="text-center border-x border-gray-100">
          <p class="text-3xl text-red-500">${weekly.totalMissed}</p>
          <p class="text-xs text-gray-400 mt-0.5">Doses missed</p>
        </div>
        <div class="text-center">
          <p class="text-3xl text-blue-600">${weekly.adherenceRate}%</p>
          <p class="text-xs text-gray-400 mt-0.5">Adherence rate</p>
        </div>
      </div>
    </div>
  `;
}

function renderMonthlyCalendar(medNames) {
  const year = monthlyYear;
  const month = monthlyMonth - 1;                    // 0-indexed for Date()

  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month;
  const isPastMonth    = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth());
  const todayDay       = isCurrentMonth ? now.getDate() : null;

  const monthName = new Date(year, month, 1).toLocaleString('en-US', { month: 'long' });

  // ISO weekday of the 1st (1=Mon..7=Sun), converted to leading-blank count.
  const firstOfMonth = new Date(year, month, 1);
  const isoDay = ((firstOfMonth.getDay() + 6) % 7);  // 0=Mon..6=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthData = dashboardData.monthly?.days ?? {};

  const cells = [
    ...Array(isoDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // A day is "in the past" (and therefore eligible for coloring) if the whole
  // displayed month is past, or it's the current month and the day is ≤ today.
  const isDayInPast = (day) => {
    if (!day) return false;
    if (isPastMonth) return true;
    if (isCurrentMonth && day <= todayDay) return true;
    return false;
  };

  const getCellBg = (day) => {
    if (!isDayInPast(day)) return '';
    const d = monthData[day];
    if (!d) return '';
    const taken = d.filter(Boolean).length;
    if (taken === 3) return 'bg-green-100';
    if (taken === 0) return 'bg-red-100';
    return 'bg-amber-100';
  };

  const getDots = (day) => {
    if (!isDayInPast(day)) return [null, null, null];
    return monthData[day] ?? [false, false, false];
  };

  const DOT_COLORS = [CONFIG.MED_COLORS[0].hex, CONFIG.MED_COLORS[1].hex, CONFIG.MED_COLORS[2].hex];

  return `
    <div>
      <div class="flex items-center justify-center gap-3 mb-4">
        <button id="monthly-prev" class="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700" aria-label="Previous month">
          <i data-lucide="chevron-left" class="w-4 h-4"></i>
        </button>
        <p class="text-gray-700 min-w-[210px] text-center">Monthly Overview — ${monthName} ${year}</p>
        <button id="monthly-next" class="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700" aria-label="Next month">
          <i data-lucide="chevron-right" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="grid grid-cols-7 mb-1">
        ${WEEKDAYS.map(d => `
          <div class="text-center text-xs text-gray-400 py-1">${d}</div>
        `).join('')}
      </div>

      <div class="grid grid-cols-7 gap-1">
        ${cells.map((day) => {
          if (!day) return '<div class="min-h-[64px]"></div>';

          const bg = getCellBg(day);
          const dots = getDots(day);
          const isToday = isCurrentMonth && day === todayDay;
          const isPast = isDayInPast(day);

          return `
            <div class="min-h-[64px] rounded-xl p-2 flex flex-col justify-between border transition-colors ${
              bg || 'bg-white'
            } ${isToday ? 'ring-2 ring-blue-500 ring-offset-1 border-transparent' : 'border-gray-100'}">
              <span class="text-sm ${isPast ? (isToday ? 'text-blue-700' : 'text-gray-700') : 'text-gray-300'}">
                ${day}
              </span>
              <div class="flex gap-1 justify-center mt-1">
                ${dots.map((taken, i) => `
                  <span class="w-2.5 h-2.5 rounded-full inline-block" style="background: ${taken === null ? '#e5e7eb' : taken ? DOT_COLORS[i] : '#d1d5db'}"></span>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="mt-5 pt-4 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-3">
        <div class="flex flex-wrap gap-3">
          ${medNames.map((name, i) => `
            <div class="flex items-center gap-1.5 text-sm text-gray-500">
              <span class="w-2.5 h-2.5 rounded-full inline-block" style="background: ${DOT_COLORS[i]}"></span>
              ${name}
            </div>
          `).join('')}
        </div>
        <div class="flex flex-wrap gap-3 text-sm text-gray-500">
          <div class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full inline-block bg-gray-300"></span>Missed pill</div>
          <div class="flex items-center gap-1.5"><span class="w-4 h-4 rounded-md inline-block bg-green-100 border border-green-200"></span>Full day</div>
          <div class="flex items-center gap-1.5"><span class="w-4 h-4 rounded-md inline-block bg-amber-100 border border-amber-200"></span>Partial day</div>
          <div class="flex items-center gap-1.5"><span class="w-4 h-4 rounded-md inline-block bg-red-100 border border-red-200"></span>All missed</div>
        </div>
      </div>
    </div>
  `;
}

function renderProfileTab(user) {
  if (isEditingProfile) {
    return `
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div class="flex flex-col items-center pb-6 mb-6 border-b border-gray-100">
          <div class="w-28 h-28 rounded-full overflow-hidden bg-blue-50 border-4 border-blue-100 mb-4 flex items-center justify-center shadow-sm">
            ${user.profilePhotoUrl
              ? `<img src="${user.profilePhotoUrl}" alt="${user.username}" class="w-full h-full object-cover" />`
              : `<i data-lucide="user" class="w-12 h-12 text-blue-300"></i>`}
          </div>
          <h3 class="text-2xl text-gray-900">${user.username}</h3>
        </div>

        <h2 class="text-xl text-gray-900 mb-5">Edit Patient Details</h2>

        <form id="profile-edit-form" class="space-y-5">
          <div id="profile-error" class="hidden bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm"></div>

          <div>
            <label class="text-xs text-gray-400 flex items-center gap-1.5 mb-1">
              <i data-lucide="user" class="w-4 h-4"></i> Username
            </label>
            <input id="profile-username" value="${profileDraft.username}" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900" />
          </div>

          <div>
            <label class="text-xs text-gray-400 flex items-center gap-1.5 mb-1">
              <i data-lucide="calendar" class="w-4 h-4"></i> Age
            </label>
            <input type="number" id="profile-age" value="${profileDraft.age}" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900" />
          </div>

          <div>
            <label class="text-xs text-gray-400 mb-1 block">Medical History</label>
            <textarea rows="3" id="profile-medicalHistory" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none text-gray-900">${profileDraft.medicalHistory}</textarea>
          </div>

          <div>
            <label class="text-xs text-gray-400 flex items-center gap-1.5 mb-1">
              <i data-lucide="user" class="w-4 h-4"></i> Caregiver
            </label>
            <input id="profile-caregiverName" value="${profileDraft.caregiverName}" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900" />
          </div>

          <div>
            <label class="text-xs text-gray-400 mb-1 block">Allergies</label>
            <input id="profile-allergies" value="${profileDraft.allergies}" placeholder="None reported" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900" />
          </div>

          <div>
            <label class="text-xs text-gray-400 flex items-center gap-1.5 mb-1">
              <i data-lucide="credit-card" class="w-4 h-4"></i> RFID Tag ID
            </label>
            <input value="${user.rfidUid ?? ''}" disabled class="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-500" />
            <p class="text-xs text-gray-400 mt-1">RFID cannot be changed at this time.</p>
          </div>

          <div class="flex gap-3 pt-2">
            <button type="button" id="cancel-profile-edit" class="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm">
              Cancel
            </button>
            <button type="submit" class="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center justify-center gap-2">
              <i data-lucide="check" class="w-4 h-4"></i> Save Changes
            </button>
          </div>
        </form>
      </div>
    `;
  }

  return `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div class="flex flex-col items-center pb-6 mb-6 border-b border-gray-100">
        <div class="w-28 h-28 rounded-full overflow-hidden bg-blue-50 border-4 border-blue-100 mb-4 flex items-center justify-center shadow-sm">
          ${user.profilePhotoUrl
            ? `<img src="${user.profilePhotoUrl}" alt="${user.username}" class="w-full h-full object-cover" />`
            : `<i data-lucide="user" class="w-12 h-12 text-blue-300"></i>`}
        </div>
        <h3 class="text-2xl text-gray-900">${user.username}</h3>
      </div>

      <div class="flex items-center justify-between mb-5">
        <h2 class="text-xl text-gray-900">Patient Details</h2>
        <button id="edit-profile-btn" class="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors text-sm">
          <i data-lucide="pencil" class="w-3.5 h-3.5"></i> Edit Profile
        </button>
      </div>

      <div class="space-y-4">
        ${renderProfileField('Username',        user.username,                       'user')}
        ${renderProfileField('Age',             `${user.age} years`,                 'calendar')}
        ${renderProfileField('Medical History', user.medicalHistory,                 null)}
        ${renderProfileField('Caregiver',       user.caregiverName,                  'user')}
        ${renderProfileField('Allergies',       user.allergies || 'None reported',   null)}
        ${renderProfileField('RFID Tag ID',     maskRfidUid(user.rfidUid),           'credit-card')}
      </div>
    </div>
  `;
}

function renderProfileField(label, value, icon) {
  return `
    <div class="border-b border-gray-100 pb-4">
      <label class="text-xs text-gray-400 flex items-center gap-1.5 mb-1">
        ${icon ? `<i data-lucide="${icon}" class="w-4 h-4"></i>` : ''}
        ${label}
      </label>
      <p class="text-gray-900">${value}</p>
    </div>
  `;
}

// ---------- Listeners ----------
export async function attachDashboardPageListeners() {
  // First mount — fetch real data and re-render once it lands.
  if (dashboardData.loading) {
    await refreshAll();
    renderPage();
    return;
  }

  attachAllListeners();
  initLucideIcons();
}

function attachAllListeners() {
  document.getElementById('tab-overview')?.addEventListener('click', () => {
    activeTab = 'overview';
    renderPage();
  });
  document.getElementById('tab-profile')?.addEventListener('click', () => {
    activeTab = 'profile';
    renderPage();
  });

  document.getElementById('chart-view-weekly')?.addEventListener('click', () => {
    chartView = 'weekly';
    renderPage();
  });
  document.getElementById('chart-view-monthly')?.addEventListener('click', async () => {
    chartView = 'monthly';
    const needsLoad = !dashboardData.monthly
      || dashboardData.monthly.year  !== monthlyYear
      || dashboardData.monthly.month !== monthlyMonth;
    if (needsLoad) {
      await loadMonthly();
    }
    renderPage();
  });

  document.getElementById('monthly-prev')?.addEventListener('click', async () => {
    if (monthlyMonth === 1) { monthlyMonth = 12; monthlyYear--; }
    else                    { monthlyMonth--; }
    await loadMonthly();
    renderPage();
  });

  document.getElementById('monthly-next')?.addEventListener('click', async () => {
    if (monthlyMonth === 12) { monthlyMonth = 1; monthlyYear++; }
    else                     { monthlyMonth++; }
    await loadMonthly();
    renderPage();
  });

  // Medication edit
  document.querySelectorAll('[data-edit-med]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const medId = parseInt(e.currentTarget.getAttribute('data-edit-med'), 10);
      const med = dashboardData.today.find(m => m.medicationId === medId);
      if (med) {
        editingMedicationId = medId;
        editForm = { name: med.name, time: med.time, dosage: med.dosage };
        renderPage();
      }
    });
  });

  document.querySelectorAll('[data-save-med]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const medId = parseInt(e.currentTarget.getAttribute('data-save-med'), 10);
      const nameInput = document.getElementById(`edit-name-${medId}`);
      const timeInput = document.getElementById(`edit-time-${medId}`);
      const dosageInput = document.getElementById(`edit-dosage-${medId}`);
      if (!nameInput || !timeInput || !dosageInput) return;

      const payload = {
        name: nameInput.value,
        time: timeInput.value,
        dosage: parseInt(dosageInput.value, 10),
      };

      btn.disabled = true;
      try {
        await api.updateMedication(medId, payload);
        await refreshTodayAndOverview();
        editingMedicationId = null;
        renderPage();
      } catch (err) {
        console.error('Failed to save medication', err);
        alert(err.message || 'Could not save medication');
      } finally {
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-cancel-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      editingMedicationId = null;
      renderPage();
    });
  });

  // Notifications
  document.getElementById('notifications-toggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showNotifications = !showNotifications;
    renderPage();
  });
  document.getElementById('close-notifications')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showNotifications = false;
    renderPage();
  });
  document.getElementById('clear-all-notifications')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await api.clearAllNotifications();
      await refreshNotifications();
    } catch (err) {
      console.error(err);
    }
    renderPage();
  });
  document.querySelectorAll('[data-dismiss-notification]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const notifId = parseInt(e.currentTarget.getAttribute('data-dismiss-notification'), 10);
      try {
        await api.dismissNotification(notifId);
        await refreshNotifications();
      } catch (err) {
        console.error(err);
      }
      renderPage();
    });
  });

  // Profile edit
  document.getElementById('edit-profile-btn')?.addEventListener('click', () => {
    const user = appState.user;
    profileDraft = {
      username: user.username ?? '',
      age: user.age ?? '',
      medicalHistory: user.medicalHistory ?? '',
      caregiverName: user.caregiverName ?? '',
      allergies: user.allergies ?? '',
    };
    isEditingProfile = true;
    renderPage();
  });

  document.getElementById('cancel-profile-edit')?.addEventListener('click', () => {
    isEditingProfile = false;
    renderPage();
  });

  document.getElementById('profile-edit-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      username: document.getElementById('profile-username').value,
      age: parseInt(document.getElementById('profile-age').value, 10),
      medicalHistory: document.getElementById('profile-medicalHistory').value,
      caregiverName: document.getElementById('profile-caregiverName').value,
      allergies: document.getElementById('profile-allergies').value,
    };

    const errorEl = document.getElementById('profile-error');
    errorEl.classList.add('hidden');

    try {
      const { user } = await api.updateProfile(payload);
      appState.setUser(user);
      isEditingProfile = false;
      renderPage();
    } catch (err) {
      errorEl.textContent = err.message || 'Could not save profile';
      errorEl.classList.remove('hidden');
    }
  });

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await appState.logout();
    navigateTo('/');
  });

  // Click-outside closes notifications. Attach once per page life.
  if (!isDocumentListenerAdded) {
    document.addEventListener('click', (e) => {
      const notifContainer = document.getElementById('notifications-container');
      if (showNotifications && notifContainer && !notifContainer.contains(e.target)) {
        showNotifications = false;
        renderPage();
      }
    });
    isDocumentListenerAdded = true;
  }
}

function renderPage() {
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = renderDashboardPage();
    attachAllListeners();
    initLucideIcons();
  }
}
