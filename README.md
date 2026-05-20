# medDrop Clean JS - Vanilla JavaScript Version

**Complete conversion of React medDrop application to vanilla JavaScript/HTML/CSS**

This is a clean, production-ready vanilla JavaScript implementation maintaining the **exact same functionality and layout** as the React version, perfect for students who know JavaScript well.

## 📁 Project Structure

```
meddrop-clean-js/
├── index.html                 # Main entry point (Tailwind + Lucide CDN)
├── js/
│   ├── config.js             # App constants & configuration
│   ├── utils.js              # Helper functions (formatTime, maskRFID, etc.)
│   ├── state.js              # State management with localStorage
│   ├── router.js             # Hash-based routing (#/login, #/register, etc.)
│   ├── main.js               # App initialization
│   └── pages/
│       ├── landing.js        # Landing page (246 lines)
│       ├── login.js          # Login page (167 lines)
│       ├── registration.js   # 3-step registration (599 lines)
│       └── dashboard.js      # Full dashboard (791 lines)
└── README.md                 # This file
```

**Total: 2,013 lines of clean, modular code**

## ✨ Complete Feature Parity with React Version

### Landing Page
- ✅ Header with navigation (Features, How It Works)
- ✅ Hero section with "Never Miss a Dose Again"
- ✅ 2×2 Features grid with images from Unsplash
- ✅ "How It Works" 4-step section  
- ✅ CTA Banner
- ✅ Footer

### Registration (3-Step Wizard)
- ✅ **Step 1 - Account Setup**: Username, password, confirm password with validation
- ✅ **Step 2 - Personal Info**: Age, medical history, caregiver, allergies, **RFID UID input**, profile photo upload
- ✅ **Step 3 - Medication Setup**: 3 medications with name, **exact time (HH:MM)**, and dosage (1-10 pills)
- ✅ Step indicator showing progress
- ✅ Form data persists between steps
- ✅ Complete validation with error messages

### Login
- ✅ Username/password authentication
- ✅ Password visibility toggle
- ✅ Error handling (no account, invalid credentials)
- ✅ Validates against localStorage

### Dashboard
- ✅ **Header**: Logo, username, notifications dropdown (with badge), profile photo, logout
- ✅ **Two Tabs**: Overview & Profile

#### Overview Tab
- ✅ **3 Stat Cards**: Total pills, remaining today, missed this week
- ✅ **My Medications** (3 cards):
  - Inline editing for name, time, dosage
  - Status badges (completed, pending, upcoming)
  - Remaining pills progress bar
  - Refill alerts (when ≤5 pills)
- ✅ **Adherence Tracker**:
  - Weekly view: Custom stacked bar chart (192px height, 3 medications + missed + scheduled)
  - Monthly view: Calendar grid for May 2026 with per-pill colored dots
  - Toggle between weekly/monthly
  - Statistics: doses taken, missed, adherence %

#### Profile Tab
- ✅ Patient details display (username, age, medical history, caregiver, allergies, **RFID masked**)
- ✅ Edit Profile button with inline editing
- ✅ Save/Cancel functionality

#### Notifications
- ✅ Real-time notifications dropdown
- ✅ 6 notification types with icons and colors
- ✅ Dismiss individual or clear all
- ✅ Click outside to close

## 🚀 How to Run

### Super Simple - Just Open It!
1. Download the entire `meddrop-clean-js` folder
2. Open `index.html` in any modern web browser
3. Done! Everything runs client-side.

### Optional: Local Server
If you prefer using a local server:

```bash
cd meddrop-clean-js
python -m http.server 8000
# or
npx serve
```

Then open `http://localhost:8000`

## 🔧 Technologies

- **HTML5** - Structure
- **Tailwind CSS v4.0 (CDN)** - All styling  
- **Lucide Icons (CDN)** - Icon library
- **Vanilla JavaScript (ES6+)** - All logic
- **ES6 Modules** - Clean modular architecture
- **localStorage** - Data persistence

## 📊 Key Technical Features

### Implemented Without Frameworks
- ✅ Hash-based routing (`#/login`, `#/register`, `#/dashboard`)
- ✅ State management with localStorage
- ✅ Form validation
- ✅ File upload with preview (profile photo)
- ✅ **Custom data visualizations**:
  - Stacked bar chart (weekly adherence)
  - Calendar view (monthly adherence)
- ✅ Inline editing (medications & profile)
- ✅ Dropdown menus (notifications)
- ✅ Password visibility toggles
- ✅ Multi-step form wizard
- ✅ Responsive design (Tailwind CSS)

## 🎓 For Students & Developers

This codebase demonstrates:
- **Clean separation of concerns** - Each page in its own file
- **Reusable utilities** - formatTime, maskRfidUid, navigateTo, etc.
- **State management patterns** - Single source of truth with localStorage
- **Event handling** - Delegation and best practices
- **ES6+ features** - Modules, arrow functions, template literals, destructuring

## 🔌 Backend Integration Ready

The application is structured for easy backend integration:

1. **Replace localStorage** in `state.js` with API calls
2. **Update form submissions** to POST to your backend
3. **Add API layer** in new `js/api.js` file

### Example API Integration

```javascript
// js/api.js
export const API = {
  baseURL: 'http://localhost:3000/api',
  
  async login(credentials) {
    const res = await fetch(`${this.baseURL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    return res.json();
  },
  
  async register(userData) {
    const res = await fetch(`${this.baseURL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    return res.json();
  },
  
  async getMedications() {
    const res = await fetch(`${this.baseURL}/medications`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    return res.json();
  },
  
  async updateMedication(id, data) {
    const res = await fetch(`${this.baseURL}/medications/${id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(data)
    });
    return res.json();
  }
};
```

Then in `state.js`, replace localStorage calls with API calls.

## 📝 Data Storage

Currently uses `localStorage`:
- **Key**: `userData`
- **Contains**: All registration data, medications, profile info

## 🎨 Styling

Uses **Tailwind CSS v4.0** via CDN:
- All classes inline (no separate CSS files)
- Fully responsive
- Custom scrollbar styling for notifications
- Matches React version pixel-perfect

## 🔐 Authentication

Simple client-side authentication for demonstration:
- Stores username/password in localStorage
- Login validates against stored credentials
- Dashboard protected route (redirects to /login if not authenticated)

**For production**: Replace with proper backend authentication (JWT, sessions, etc.)

## 📦 What's Different from React Version?

### Architecture
- ❌ No JSX → ✅ Template literals
- ❌ No hooks (useState, useEffect) → ✅ Plain JavaScript variables
- ❌ No React Router → ✅ Hash-based routing
- ❌ No components → ✅ Render functions

### Everything Else is THE SAME
- ✅ Exact same UI/UX
- ✅ Exact same functionality
- ✅ Exact same layout
- ✅ Exact same validation
- ✅ Exact same features

## 🐛 Testing

1. **Landing Page**: Check all sections render, buttons navigate correctly
2. **Registration**: 
   - Test validation (passwords match, RFID format, etc.)
   - Upload photo
   - Navigate between steps
   - Complete registration
3. **Login**: Test with invalid/valid credentials
4. **Dashboard**:
   - View medications
   - Edit medications inline
   - Switch between weekly/monthly views
   - Edit profile
   - Interact with notifications
   - Logout

## 📄 License

Educational project for IoT-based Automatic Pill Dispenser final year project.

---

## 💡 Quick Start Guide

```bash
# 1. Download the folder
# 2. Open in browser
open index.html

# Or with live server
cd meddrop-clean-js
python -m http.server 8000
```

Navigate to:
- Landing: `http://localhost:8000` or `index.html`
- Login: `http://localhost:8000#/login`
- Register: `http://localhost:8000#/register`
- Dashboard: `http://localhost:8000#/dashboard` (requires login)

---

**Created with vanilla JavaScript - No frameworks, no build tools, no dependencies!** 🎉
