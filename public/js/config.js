export const CONFIG = {
  APP_NAME: "MedDrop",
  MAX_CAPACITY: 7,
  SYSTEM_CAPACITY: 21,
  API_BASE: "/api/v1",
  TOKEN_KEY: "meddrop_token",
  MED_COLORS: [
    { dot: "bg-blue-500", border: "border-blue-200", bg: "bg-blue-50", icon: "text-blue-600", hex: "#3b82f6" },
    { dot: "bg-green-500", border: "border-green-200", bg: "bg-green-50", icon: "text-green-600", hex: "#22c55e" },
    { dot: "bg-purple-500", border: "border-purple-200", bg: "bg-purple-50", icon: "text-purple-600", hex: "#a855f7" }
  ],
  FEATURES: [
    {
      title: "Multi-Medication Support",
      description: "Supports up to 3 different medications with 7 pills each — 21 doses managed automatically.",
      // Concept: Multiple pills/capsules together
      image: "https://drive.google.com/uc?export=view&id=1_4eSEyKEJpW1YjHUsCxik3lFUpZfIv1j"
    },
    {
      title: "Scheduled Dispensing",
      description: "Automatically dispenses pills at scheduled times — morning, afternoon, and evening.",
      // Concept: A clean, modern digital clock or automation vibe
      image: "https://images.unsplash.com/photo-1508921334182-69688b171f2b?auto=format&fit=crop&q=80&w=800"
    },
    {
      title: "Audio & Visual Alerts",
      description: "Built-in buzzer tones and LED indicators on the dispenser machine gently alert patients at dose time.",
      // Concept: Light/sound abstract or a glowing smart device
      image: "https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&q=80&w=800"
    },
    {
      title: "Smart Notifications",
      description: "Real-time website notifications for doses, refills, and reminders to keep caregivers informed.",
      // Concept: Someone looking at a screen/laptop (representing the web-platform)
      image: "https://lh3.googleusercontent.com/u/0/d/1EqpVI6BU4slDCFLkLVxbkNbbUcJeOwwO"    
    },
    {
      title: "Patient Dashboard",
      description: "Real-time monitoring and weekly adherence reports give caregivers complete peace of mind.",
      // Concept: Data, charts, or a medical tablet interface
      image: "https://lh3.googleusercontent.com/d/1rkogKesNuvrRXjA0YhIaDJst5YX_YcO8"
    },
    {
      title: "RFID Security",
      description: "Secure access with RFID card authentication ensuring only authorized users can dispense or refill.",
      // Concept: Electronic lock, smart card, or keyless entry
      image: "https://images.unsplash.com/photo-1558317751-bc3ed6f85f72?auto=format&fit=crop&q=80&w=800"
    }
  ],
  HOW_IT_WORKS: [
    { title: "Place your medDrop device", description: "Ditch the messy pillboxes. Just plug your device in on any kitchen counter or nightstand.", icon: "Package" },
    { title: "Connect to Wi-Fi", description: "Link to internet to keep your daily pill schedules synced and your reminders ready.", icon: "Wifi" },
    { title: "Set your schedule", description: "Register on the medDrop website to quickly enter your health details, add your medications, and map out your morning, noon, and night pill times.", icon: "Clock" },
    { title: "Load your pills", description: "Pour in up to a 7-day supply for each medication, and let medDrop do the rest!", icon: "Pill" }
  ]
};
