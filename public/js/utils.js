export function formatTime(time) {
  if (!time || !time.includes(":")) return time;
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours);
  const ampm = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

export function maskRfidUid(uid) {
  if (!uid) return "Not set";
  if (uid.length <= 4) return uid;
  const lastFour = uid.slice(-4);
  return `****-${lastFour.toUpperCase()}`;
}

export function initLucideIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

export function isValidRFID(rfid) {
  const re = /^[A-Fa-f0-9-]+$/;
  return re.test(rfid);
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function navigateTo(path) {
  window.location.hash = path;
}

export function getCurrentRoute() {
  return window.location.hash.slice(1) || '/';
}
