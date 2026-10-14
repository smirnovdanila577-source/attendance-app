// --- ГЛОБАЛЬНЫЕ ФУНКЦИИ АВТОРИЗАЦИИ ---
let isRegisterMode = false;

function toggleGroupField() {
  if (window.Ispu) Ispu.refreshAuthFields();
}

function toggleAuthMode() {
  isRegisterMode = !isRegisterMode;

  const title = document.getElementById('authTitle');
  const subtitle = document.getElementById('authSubtitle');
  const submitBtn = document.getElementById('btnSubmitAuth');
  const toggleText = document.getElementById('authToggleText');
  const toggleBtn = document.getElementById('authToggleBtn');

  document.querySelectorAll('#authScreen .input-field').forEach(el => el.classList.remove('input-error'));

  if (isRegisterMode) {
    title.textContent = "Регистрация";
    subtitle.textContent = "Создай аккаунт для облачной синхронизации";
    submitBtn.textContent = "Зарегистрироваться";
    toggleText.textContent = "Уже есть аккаунт?";
    toggleBtn.textContent = "Войти";
  } else {
    title.textContent = "Вход в аккаунт";
    subtitle.textContent = "С возвращением в трекер";
    submitBtn.textContent = "Войти";
    toggleText.textContent = "Еще нет аккаунта?";
    toggleBtn.textContent = "Зарегистрироваться";
  }
  // Показ выбора вуза, поля группы ННГУ или кнопки выбора группы ИГЭУ
  if (window.Ispu) Ispu.refreshAuthFields();
}

// Автоматическое снятие красной рамки при вводе текста
document.addEventListener('DOMContentLoaded', () => {
  ['authNameInput', 'authPasswordInput', 'authGroupInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => el.classList.remove('input-error'));
    }
  });
});

async function handleAuthSubmit() {
  const nameInput = document.getElementById('authNameInput');
  const passInput = document.getElementById('authPasswordInput');
  const groupInput = document.getElementById('authGroupInput');
  const submitBtn = document.getElementById('btnSubmitAuth');

  const username = nameInput ? nameInput.value.trim() : "";
  const password = passInput ? passInput.value.trim() : "";
  
  // Какой вуз выбран (только в режиме регистрации): ННГУ, ИГЭУ или другой
  const uniState = (isRegisterMode && window.Ispu) ? Ispu.state() : { uni: 'nngu', ispu: null };
  const isNngu = uniState.uni === 'nngu';
  const isIspu = uniState.uni === 'ispu';
  // Группа: ННГУ вводится вручную, ИГЭУ выбирается в окне, иначе пустая (и при обычном входе тоже)
  const group_name = !isRegisterMode ? "" : (isNngu && groupInput ? groupInput.value.trim() : (isIspu && uniState.ispu ? uniState.ispu.label : ""));

  // Сбрасываем предыдущие ошибки перед проверкой
  [nameInput, passInput, groupInput].forEach(el => el && el.classList.remove('input-error'));

  let hasError = false;

  if (!username) {
    nameInput.classList.add('input-error');
    hasError = true;
  }
  if (!password) {
    passInput.classList.add('input-error');
    hasError = true;
  }
  // Для ННГУ нужна введённая группа, для ИГЭУ выбранная в окне
  if (isRegisterMode && isNngu && !group_name) {
    groupInput.classList.add('input-error');
    hasError = true;
  }
  let ispuMsg = "";
  if (isRegisterMode && isIspu && !uniState.ispu) {
    ispuMsg = Ispu.flagPick();   // подсветит поле и скажет, чего не хватает
    hasError = true;
  }

  // Если хоть одно поле не заполнено — дальше запрос не идет
  if (hasError) {
    showElegantToast("Внимание", ispuMsg || "Заполните все обязательные поля", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = isRegisterMode ? "Регистрация..." : "Вход...";

  const endpoint = isRegisterMode ? `${API_URL}/api/register` : `${API_URL}/api/login`;
  const payload = isRegisterMode 
    ? { username, password, group_name: group_name, university: window.Ispu ? Ispu.universityName(uniState.uni) : undefined } 
    : { username, password };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Ошибка авторизации");
    }

    const userData = await response.json();
    if (userData.token) localStorage.setItem('tracker_token', userData.token);

    // --- ЗАГРУЗКА ДАННЫХ ИЗ ОБЛАКА ---
    try {
        const cloudRes = await fetch(`${API_URL}/api/schedule/load/${userData.id}`, { headers: authHeaders() });
        if (cloudRes.ok) {
            const cloudData = await cloudRes.json();
            // Если в облаке что-то есть, подменяем локальную базу
            if (Object.keys(cloudData).length > 0) {
                clearAllUndos(); database = cloudData; 
            }
        }
    } catch(e) {
        console.error("Не удалось загрузить данные из облака:", e);
    }

    // Сохраняем/обновляем профиль (чтобы ID всегда был актуальным)
    const rememberMe = document.getElementById('rememberMeCheckbox') ? document.getElementById('rememberMeCheckbox').checked : true;
    
    // Выбранная группа ИГЭУ: при регистрации берём из окна выбора, при входе сохраняем то, что пришло из облака
    const keepIspu = (isRegisterMode && isIspu) ? uniState.ispu : ((database.userProfile && database.userProfile.ispu) || null);

    database.userProfile = {
      id: userData.id,
      name: userData.username,
      university: userData.university,
      group: userData.group_name,
      ispu: keepIspu,
      registeredAt: new Date().toISOString(),
      rememberMe: rememberMe
    };
    
    // Это вызовет нашу новую saveData(), которая сразу синхронизирует профиль
    saveData(); 

    switchScreen('mainApp');
    startMainApp();
    showElegantToast("Успешно", isRegisterMode ? "Аккаунт успешно создан!" : `С возвращением, ${userData.username}!`);
  } catch (err) {
    console.error("Auth error:", err);
    showElegantToast("Внимание", err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = isRegisterMode ? "Зарегистрироваться" : "Войти";
  }
}
// --- КОНЕЦ ГЛОБАЛЬНЫХ ФУНКЦИЙ ---

const API_URL = "https://attendance-backend-114v.onrender.com";

const ICONS = {
  plus: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
  checkAll: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5"/></svg>`,
  x: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  circle: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`,
  xCircle: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
  pencil: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  trash: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
  bookmark: (active, size=16) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${active ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`
};

const ALL_DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const DEFAULT_BELLS = [
  { num: 1, start: "08:00", end: "09:35" }, { num: 2, start: "09:50", end: "11:25" },
  { num: 3, start: "11:40", end: "13:15" }, { num: 4, start: "13:30", end: "15:05" },
  { num: 5, start: "15:20", end: "16:55" }, { num: 6, start: "17:10", end: "18:45" },
  { num: 7, start: "18:55", end: "20:30" }
];

let database;
let currentWeek;
let editingState = null;

// Список удалённых пар, которые ещё можно вернуть (у каждой свой таймер)
let pendingUndos = [];
let undoTicker = null;
const UNDO_TIMEOUT_MS = 6000;

let currentCalMonth = new Date();
let selectedCalDate = new Date();

function switchScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
  database = loadData();
  
  if (!database.userProfile || database.userProfile.rememberMe === false) {
    if (database.userProfile && database.userProfile.rememberMe === false) {
      database.userProfile = null;
      saveData();
    }
    switchScreen('authScreen');
  } else {
    const titleEl = document.getElementById('welcomeTitle');
    const avatarEl = document.getElementById('welcomeAvatar');
    
    if (titleEl) titleEl.textContent = `Привет, ${database.userProfile.name}!`;
    if (avatarEl) {
      const initial = database.userProfile.name ? database.userProfile.name.charAt(0).toUpperCase() : 'С';
      // Выбранный в профиле аватар (если он открыт), иначе первая буква ника
      const ext = database.profileExt || {};
      const av = window.Avatars && ext.avatarId ? Avatars.byId(ext.avatarId) : null;
      if (av && Avatars.isUnlocked(av, ext.achievements || {})) avatarEl.innerHTML = Avatars.html(av.id, database.userProfile.name);
      else avatarEl.textContent = initial;
    }
    switchScreen('welcomeScreen');
  }
});

function showAuthScreen() {
  switchScreen('authScreen');
}

function startMainAppFromWelcome() {
  switchScreen('mainApp');
  startMainApp();
}

function showElegantToast(title, desc, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `elegant-toast`;
  
  const icon = type === 'error' 
    ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`
    : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`;
    
  const colorCls = type === 'error' ? 'var(--color-red)' : 'var(--color-green)';

  toast.innerHTML = `
    <div class="toast-icon" style="color: ${colorCls}; display: flex; align-items: center;">
      ${icon}
    </div>
    <div class="toast-content" style="display: flex; flex-direction: column; gap: 2px; flex: 1;">
      <div class="toast-title" style="font-size: 14px; font-weight: 700; color: var(--text-main);">${escapeHtml(title)}</div>
      <div class="toast-desc" style="font-size: 12px; font-weight: 500; color: var(--text-muted);">${escapeHtml(desc)}</div>
    </div>
    <div class="toast-progress" style="background: ${colorCls};"></div>
  `;

  container.appendChild(toast);
  
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function resetProfile() {
  if (confirm("Вы уверены, что хотите выйти из аккаунта?")) {
    clearAllUndos();
    localStorage.removeItem('tracker_token');
    cloudPullDone = false;
    database.userProfile = null;
    database.templates = { left: {}, right: {}, unified: {} };
    database.weeks = {};
    database.important_subjects = [];
    database.activeDays = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
    
    database.profileExt = null;
    saveData();
    if (window.Profile) Profile.teardown();
    if (window.Social) Social.teardown();
    closeSettings();
    switchScreen('authScreen');
    showElegantToast("Выход", "Вы вышли из профиля, данные очищены");
  }
}

let mainTimersStarted = false;

function startMainApp() {
  clearFutureMarks();
  currentWeek = calculateCurrentSemesterWeek();
  buildTimeSelectOptions();
  initCustomSelects();      
  syncSettingsUI();         
  evaluateTheme();          

  // Таймеры запускаем один раз: после выхода и повторного входа они не должны дублироваться
  if (!mainTimersStarted) {
    mainTimersStarted = true;
    setInterval(evaluateTheme, 60000);
    setInterval(render, 60000);
  }
  render();
  // Один раз при входе: дни мягко поднимаются по очереди (каждые 60 с render() идёт без анимации)
  const lgWrap = document.getElementById('scheduleAnimationWrapper');
  if (lgWrap) { lgWrap.classList.add('lg-enter'); setTimeout(() => lgWrap.classList.remove('lg-enter'), 1400); }

  const syncBtn = document.getElementById('sync-schedule-btn');

  if (database.userProfile && database.userProfile.group) {
      if (syncBtn) syncBtn.style.display = 'block'; 
      const hasData = Object.keys(database.templates.left || {}).length > 0 || Object.keys(database.templates.unified || {}).length > 0;
      if (!hasData) {
          loadUniversitySchedule();
      }
  } else {
      if (syncBtn) syncBtn.style.display = 'none';
  }

  if (window.Ispu) Ispu.refreshSettingsButtons(); // подпись кнопки синхронизации и «Сменить группу»
  if (window.Profile) Profile.init(); // профиль, статус, уведомления
  if (window.Report) Report.init(); // еженедельный отчёт
  if (window.Social) Social.init(); // очки, серия, лига, друзья, онлайн
  startCloudWatch();
}

function loadData() {
  const saved = localStorage.getItem("tracker_v12_db"); 
  if (saved) { 
    try { 
      const parsed = JSON.parse(saved); 
      if (!parsed.semesterStartDate) parsed.semesterStartDate = "2026-09-01";
      if (!parsed.themeMode) parsed.themeMode = "light";
      if (!parsed.fontSize) parsed.fontSize = "normal";
      if (!parsed.scheduleMode) parsed.scheduleMode = "alternate";
      if (!parsed.firstWeekType) parsed.firstWeekType = "left";
      if (!parsed.bellSchedule) parsed.bellSchedule = JSON.parse(JSON.stringify(DEFAULT_BELLS));
      if (!parsed.userProfile) parsed.userProfile = null;
      return parsed;
    } catch (e) {} 
  }
  return { 
    userProfile: null,
    themeMode: "light", fontSize: "normal", scheduleMode: "alternate", 
    semesterStartDate: "2026-09-01", firstWeekType: "left",
    bellSchedule: JSON.parse(JSON.stringify(DEFAULT_BELLS)),
    activeDays: ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"], important_subjects: [], 
    templates: { left: {}, right: {}, unified: {} }, weekTypes: {}, weeks: {} 
  };
}

let syncTimeout = null;
let authToastShown = false;

// Токен доступа хранится отдельно от основных данных и в облако не отправляется
function authHeaders(extra = {}) {
  const token = localStorage.getItem('tracker_token');
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

// --- ОБЛАЧНАЯ СИНХРОНИЗАЦИЯ ---
let cloudPullDone = false;      // забрали ли мы уже актуальные данные из облака в этой сессии
let cloudWatchStarted = false;
let lastPullAt = 0;
let syncErrToastShown = false;

function saveData() { 
  database._updatedAt = Date.now(); // метка времени: по ней определяем, какая копия новее
  localStorage.setItem("tracker_v12_db", JSON.stringify(database)); 
  if (window.Profile) Profile.onDataSaved(); // профиль: пересчёт достижений и уведомлений
  if (window.Social) Social.onDataSaved();   // очки, серия и отправка публичного профиля
  
  if (database && database.userProfile && database.userProfile.id) {
      clearTimeout(syncTimeout);
      syncTimeout = setTimeout(pushToCloud, 1500); 
  }
}

function pushToCloud() {
  syncTimeout = null;
  if (!database || !database.userProfile || !database.userProfile.id) return;
  // Пока не забрали облачные данные, отправлять свои нельзя — можно затереть более свежие
  if (!cloudPullDone) { syncTimeout = setTimeout(pushToCloud, 1000); return; }

  fetch(`${API_URL}/api/schedule/sync`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ user_id: database.userProfile.id, database_state: database })
  }).then(res => {
      if (res.status === 401) {
          if (!authToastShown) {
              authToastShown = true;
              showElegantToast("Синхронизация", "Сессия истекла. Выйдите и войдите в аккаунт заново", "error");
          }
      } else if (res.ok) {
          authToastShown = false; syncErrToastShown = false;
      } else if (!syncErrToastShown) {
          syncErrToastShown = true;
          showElegantToast("Синхронизация", `Сервер вернул ошибку (${res.status})`, "error");
      }
  }).catch(err => {
      console.error("Ошибка фоновой синхронизации:", err);
      if (!syncErrToastShown) {
          syncErrToastShown = true;
          showElegantToast("Синхронизация", "Нет связи с сервером. Изменения отправятся позже", "error");
      }
  });
}

async function pullFromCloud(opts = {}) {
  if (!database || !database.userProfile || !database.userProfile.id) return;

  if (!localStorage.getItem('tracker_token')) {
    cloudPullDone = true;
    if (!authToastShown) {
      authToastShown = true;
      showElegantToast("Синхронизация", "Выйдите и войдите в аккаунт заново, чтобы включить синхронизацию", "error");
    }
    return;
  }

  if (cloudPullDone) {
    // Не мешаем пользователю: идёт ввод, открыто окно или есть неотправленные правки
    const ae = document.activeElement;
    if (syncTimeout || document.querySelector('.modal-overlay.open') ||
        (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA') && ae.value)) return;
    if (!opts.force && Date.now() - lastPullAt < 10000) return;
  }
  lastPullAt = Date.now();

  try {
    const res = await fetch(`${API_URL}/api/schedule/load/${database.userProfile.id}`, { headers: authHeaders() });
    if (res.status === 401) {
      cloudPullDone = true;
      if (!authToastShown) {
        authToastShown = true;
        showElegantToast("Синхронизация", "Сессия истекла. Выйдите и войдите в аккаунт заново", "error");
      }
      return;
    }
    if (!res.ok) { cloudPullDone = true; return; }

    const cloud = await res.json();
    const localTs = database._updatedAt || 0;
    const cloudTs = (cloud && cloud._updatedAt) || 0;
    cloudPullDone = true;

    if (!cloud || !Object.keys(cloud).length) {
      if (!syncTimeout) pushToCloud(); // в облаке пусто — отправляем свою копию
      return;
    }

    if (cloudTs > localTs) {
      // В облаке данные новее (правили на другом устройстве) — берём их
      const profile = database.userProfile;
      clearAllUndos();
      cloud.userProfile = profile;
      localStorage.setItem("tracker_v12_db", JSON.stringify(cloud));
      database = loadData();
      clearFutureMarks();
      buildTimeSelectOptions();
      syncSettingsUI();
      evaluateTheme();
      render();
      if (window.Profile) Profile.refresh();
      showElegantToast("Синхронизация", "Данные обновлены с другого устройства");
    } else if (localTs > cloudTs && !syncTimeout) {
      pushToCloud(); // локальная копия новее — догоняем облако
    }
  } catch (e) {
    console.error("Не удалось получить данные из облака:", e);
    cloudPullDone = true; // нет связи — не блокируем работу, отправим позже
  }
}

function startCloudWatch() {
  pullFromCloud({ force: true });
  if (cloudWatchStarted) return;
  cloudWatchStarted = true;
  window.addEventListener('focus', () => pullFromCloud());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pullFromCloud(); });
  setInterval(() => pullFromCloud(), 60000);
}

function initCustomSelects() {
  const interactives = document.querySelectorAll('.custom-select');
  interactives.forEach(el => {
    const trigger = el.querySelector('.select-trigger');
    const options = el.querySelectorAll('.select-option');
    const hiddenInput = el.querySelector('input[type="hidden"]');
    const textSpan = el.querySelector('.select-text');
    
    if(trigger && !trigger.dataset.bound) {
      trigger.dataset.bound = "true";
      trigger.addEventListener('click', (e) => { 
        e.stopPropagation(); 
        const isOpening = !el.classList.contains('open');
        interactives.forEach(s => { s.classList.remove('open'); s.closest('.input-group').style.zIndex = '1'; }); 
        if (isOpening) { el.classList.add('open'); el.closest('.input-group').style.zIndex = '100'; }
      });
    }
    if(options) {
      options.forEach(opt => { 
        if (opt.dataset.bound) return;
        opt.dataset.bound = "true";
        opt.addEventListener('click', (e) => { 
          e.stopPropagation(); 
          hiddenInput.value = opt.getAttribute('data-value'); 
          textSpan.textContent = opt.textContent; 
          options.forEach(o => o.classList.remove('selected')); opt.classList.add('selected'); 
          el.classList.remove('open'); el.closest('.input-group').style.zIndex = '1';
          
          if (hiddenInput.id === 'scheduleModeSelect') updateScheduleModeVisibility(hiddenInput.value);
          if (hiddenInput.id === 'themeSelectInput') applyLiveTheme(hiddenInput.value);
        }); 
      });
    }
  });
  document.addEventListener('click', () => { 
    interactives.forEach(s => { s.classList.remove('open'); s.closest('.input-group').style.zIndex = '1'; }); 
    document.getElementById('customDatePicker').classList.remove('open');
  });
}

function toggleCalendarPopup(e) {
  e.stopPropagation();
  const dp = document.getElementById('customDatePicker');
  const isOpening = !dp.classList.contains('open');
  document.querySelectorAll('.custom-select').forEach(s => s.classList.remove('open'));
  if (isOpening) { dp.classList.add('open'); dp.closest('.input-group').style.zIndex = '100'; renderCalendar(); } 
  else { dp.classList.remove('open'); dp.closest('.input-group').style.zIndex = '1'; }
}

function applyLiveTheme(mode) {
  if (mode === "dark") document.body.classList.add('dark-theme');
  else if (mode === "light") document.body.classList.remove('dark-theme');
  else if (mode === "auto") {
    const hour = new Date().getHours();
    if (hour >= 19 || hour < 7) document.body.classList.add('dark-theme');
    else document.body.classList.remove('dark-theme');
  }
}

function updateScheduleModeVisibility(mode) {
  const group = document.getElementById('firstWeekGroup');
  if (group) group.style.display = (mode === 'unified') ? 'none' : 'block';
}

function setCustomSelectValue(inputId, value) {
  const hiddenInput = document.getElementById(inputId); if (!hiddenInput) return; 
  hiddenInput.value = value;
  const selectWrap = hiddenInput.closest('.custom-select');
  if(!selectWrap) return;
  const textSpan = selectWrap.querySelector('.select-text');
  const options = selectWrap.querySelectorAll('.select-option');
  
  let found = false;
  options.forEach(opt => { 
    if (opt.getAttribute('data-value') === String(value)) { 
      opt.classList.add('selected'); 
      if(textSpan) textSpan.textContent = opt.textContent; 
      found = true;
    } else { opt.classList.remove('selected'); } 
  });

  if(!found && options.length > 0) {
    hiddenInput.value = options[0].getAttribute('data-value');
    options[0].classList.add('selected');
    if(textSpan) textSpan.textContent = options[0].textContent;
  }
}

function evaluateTheme() {
  applyLiveTheme(database.themeMode);
  if (database.fontSize === "large") document.body.classList.add('text-large');
  else document.body.classList.remove('text-large');
}

function syncSettingsUI() {
  setCustomSelectValue('themeSelectInput', database.themeMode);
  setCustomSelectValue('fontSelectInput', database.fontSize);
  setCustomSelectValue('scheduleModeSelect', database.scheduleMode);
  setCustomSelectValue('firstWeekInput', database.firstWeekType);
  updateScheduleModeVisibility(database.scheduleMode);
  
  const parts = database.semesterStartDate.split('-');
  selectedCalDate = new Date(parts[0], parts[1] - 1, parts[2]);
  updateCalInputDisplay();
}

function renderCalendar() {
  const year = currentCalMonth.getFullYear();
  const month = currentCalMonth.getMonth();
  const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  document.getElementById('calMonthLabel').innerText = `${monthNames[month]} ${year}`;

  let firstDay = new Date(year, month, 1).getDay();
  firstDay = firstDay === 0 ? 7 : firstDay; 
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let html = '';
  ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach(d => html += `<div class="cal-day-name">${d}</div>`);
  for (let i = 1; i < firstDay; i++) html += `<div class="cal-cell empty"></div>`;
  for (let i = 1; i <= daysInMonth; i++) {
    const isSelected = selectedCalDate.getFullYear() === year && selectedCalDate.getMonth() === month && selectedCalDate.getDate() === i;
    html += `<div class="cal-cell ${isSelected ? 'selected' : ''}" onclick="selectCalDate(${year}, ${month}, ${i}, event)">${i}</div>`;
  }
  document.getElementById('calGridDays').innerHTML = html;
}

function changeCalMonth(diff, e) {
  if(e) e.stopPropagation();
  currentCalMonth.setMonth(currentCalMonth.getMonth() + diff);
  renderCalendar();
}

function selectCalDate(y, m, d, event) {
  event.stopPropagation();
  selectedCalDate = new Date(y, m, d);
  updateCalInputDisplay();
  const dp = document.getElementById('customDatePicker');
  dp.classList.remove('open');
  dp.closest('.input-group').style.zIndex = '1';
}

function updateCalInputDisplay() {
  const d = String(selectedCalDate.getDate()).padStart(2, '0');
  const m = String(selectedCalDate.getMonth() + 1).padStart(2, '0');
  const y = selectedCalDate.getFullYear();
  document.getElementById('dateText').innerText = `${d}.${m}.${y}`;
  document.getElementById('semesterStartInputHidden').value = `${y}-${m}-${d}`;
}

function getWeek1Monday() {
  const [year, month, day] = (database.semesterStartDate || "2026-09-01").split("-").map(Number);
  const d = new Date(year, month - 1, day);
  const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (dayOfWeek - 1));
  d.setHours(0, 0, 0, 0); return d;
}
function calculateCurrentSemesterWeek() {
  const week1Mon = getWeek1Monday();
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const diffWeeks = Math.floor((now - week1Mon) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, diffWeeks);
}
function getDateForDay(weekNum, dayName) {
  const week1Mon = getWeek1Monday();
  const dayIndex = ALL_DAYS.indexOf(dayName);
  const target = new Date(week1Mon);
  target.setDate(week1Mon.getDate() + (weekNum - 1) * 7 + dayIndex);
  return target;
}
function getWeekDatesString(weekNum) {
  const mon = getDateForDay(weekNum, "Понедельник");
  const sun = getDateForDay(weekNum, "Воскресенье");
  const monthsShort = ["янв", "февр", "марта", "апр", "мая", "июня", "июля", "авг", "сент", "окт", "нояб", "дек"];
  return `${mon.getDate()} ${monthsShort[mon.getMonth()]} — ${sun.getDate()} ${monthsShort[sun.getMonth()]}`;
}
function formatDate(d) {
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
function isDateToday(d) {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function getWeekType(weekNum) { 
  if (database.scheduleMode === 'unified') return 'unified';
  const isFirstWeekLeft = (database.firstWeekType === 'left');
  const isOddWeek = (weekNum % 2 !== 0);
  return isFirstWeekLeft ? (isOddWeek ? 'left' : 'right') : (isOddWeek ? 'right' : 'left');
}

function getWeekData(weekNum) {
  const key = String(weekNum);
  if (!database.weeks[key]) { 
    const type = getWeekType(weekNum); 
    const fresh = JSON.parse(JSON.stringify(database.templates[type] || {})); 
    for (const day of ALL_DAYS) { if(fresh[day]) fresh[day].forEach(p => p.attended = null); } 
    database.weeks[key] = fresh; saveData(); 
  }
  return database.weeks[key];
}

// Пересобирает недели из шаблонов после смены режима или загрузки нового расписания.
// Прошедший день, где есть отметки или ДЗ, не трогаем: это история. Прошедший день без них
// (например, до первой синхронизации) и всё с сегодняшнего дня берут новое расписание,
// а данные старых пар переносятся на него:
//   1) тот же день, предмет и время — переносим отметку и ДЗ;
//   2) тот же день и предмет, другое время (пару сдвинули) — тоже переносим;
//   3) ДЗ переезжает на ближайшую пару этого предмета в ту же неделю;
//   4) если перенести некуда, пара с отметкой или ДЗ остаётся зачёркнутой («Убрана из расписания»).
// Возвращает { moved, cancelled } — сколько пар с данными перенесено и сколько осталось убранными.
function rebuildWeeksFromToday() {
  const old = database.weeks || {};
  const nums = Object.keys(old).map(Number).filter(n => n > 0);
  const nowWeek = calculateCurrentSemesterWeek();
  const nowDay = (new Date().getDay() + 6) % 7; // 0 = понедельник
  const last = Math.max(20, nowWeek, ...nums);
  const summary = { moved: 0, cancelled: 0 };
  const hasData = p => (p.attended === true || p.attended === false) || (Array.isArray(p.tasks) && p.tasks.length > 0);
  const dayHasData = list => (list || []).some(hasData);
  const next = {};
  const todo = nums.filter(n => n < nowWeek).sort((a, b) => a - b); // прошедшие недели — только уже созданные
  for (let w = nowWeek; w <= last; w++) todo.push(w);

  for (const w of todo) {
    const fresh = JSON.parse(JSON.stringify(database.templates[getWeekType(w)] || {}));
    const prev = old[String(w)];
    const week = {};
    const rebuilt = []; // дни, которые пересобираем: [день, новые пары, старые пары]
    ALL_DAYS.forEach((day, i) => {
      const isPast = w < nowWeek || (w === nowWeek && i < nowDay);
      if (isPast && prev && dayHasData(prev[day])) { week[day] = prev[day]; return; } // история с отметками
      const pairs = (fresh[day] || []).map(p => { p.attended = null; delete p.tasks; return p; });
      week[day] = pairs;
      rebuilt.push([day, pairs, prev ? (prev[day] || []) : []]);
    });

    const left = []; // старые пары, которым не нашлось места в том же дне
    rebuilt.forEach(([day, pairs, olds]) => {
      const taken = new Set();
      const give = (p, o) => {
        taken.add(p);
        p.attended = (o.attended === true || o.attended === false) ? o.attended : null;
        if (Array.isArray(o.tasks) && o.tasks.length) p.tasks = o.tasks;
      };
      const rest = [];
      olds.forEach(o => { // 1) точное совпадение
        const p = pairs.find(x => !taken.has(x) && x.subject === o.subject && x.time === o.time);
        if (p) give(p, o); else rest.push(o);
      });
      rest.forEach(o => { // 2) тот же предмет в этот день, другое время
        const p = pairs.find(x => !taken.has(x) && x.subject === o.subject);
        if (p) { give(p, o); if (hasData(o)) summary.moved++; }
        else if (hasData(o)) left.push([day, o]);
      });
    });

    left.forEach(([day, o]) => { // 3) ДЗ — на ближайшую пару этого предмета в неделе
      const tasks = Array.isArray(o.tasks) ? o.tasks : [];
      const attendedMark = o.attended === true || o.attended === false;
      if (tasks.length && !attendedMark) {
        const from = ALL_DAYS.indexOf(day);
        const order = rebuilt.map(r => r[0]).sort((x, y) => Math.abs(ALL_DAYS.indexOf(x) - from) - Math.abs(ALL_DAYS.indexOf(y) - from));
        for (const d of order) {
          const p = week[d].find(x => x.subject === o.subject && !x.cancelled);
          if (p) { p.tasks = (p.tasks || []).concat(tasks); summary.moved++; return; }
        }
      }
      // 4) некуда перенести — оставляем зачёркнутой
      if (!o.cancelled) summary.cancelled++;
      week[day].push(Object.assign({}, o, { cancelled: true }));
    });

    rebuilt.forEach(([day]) => week[day].sort((x, y) => (x.time || '').localeCompare(y.time || '')));
    next[String(w)] = week;
  }
  database.weeks = next;
  return summary;
}

// Подпись к уведомлению о синхронизации: что стало с парами, у которых были отметки или ДЗ
function rebuildSummaryText(sum) {
  const parts = [];
  if (sum.moved) parts.push(`перенесено пар с ДЗ или отметками: ${sum.moved}`);
  if (sum.cancelled) parts.push(`убрано из расписания: ${sum.cancelled} (оставлены зачёркнутыми)`);
  return parts.length ? `. ${parts.join(', ')}` : '';
}

function jumpToCurrentWeek() {
  const realWeek = calculateCurrentSemesterWeek();
  const weekChanged = (currentWeek !== realWeek);

  if (weekChanged) {
    currentWeek = realWeek;
    render();
  }

  setTimeout(() => {
    const livePair = document.querySelector('.pair-card.is-live');
    const todayBadge = document.querySelector('.today-badge');
    
    const target = livePair || (todayBadge ? todayBadge.closest('.day-group') : null);

    if (!target) return;

    // Прокручивается вся страница; стеклянная верхняя панель лежит поверх, поэтому отступаем на её высоту
    const container = document.getElementById('mainScroll') || target.closest('.scroll-container');
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const bar = document.querySelector('#mainApp .lg-topbar');
    const offset = (bar ? bar.offsetHeight : 0) + 12;

    const targetScrollTop = (targetRect.top - containerRect.top) + container.scrollTop - offset;

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth'
    });
  }, weekChanged ? 80 : 10);
}

function markEntireDay(dayName) {
  const week = getWeekData(currentWeek);
  const pairs = (week[dayName] || []).filter(p => !p.cancelled && pairHasEnded(currentWeek, dayName, p.time));
  if (pairs.length === 0) { showElegantToast("Рано", "В этот день ещё нет закончившихся пар", "error"); return; }
  const allAttended = pairs.every(p => p.attended === true);
  pairs.forEach(p => { p.attended = !allAttended; if (window.Social) Social.queueMark(currentWeek, dayName, p); });
  saveData(); render();
}

function hideDay(day) { database.activeDays = database.activeDays.filter(d => d !== day); saveData(); render(); }

function openAddDayModal() {
  const available = ALL_DAYS.filter(d => !database.activeDays.includes(d));
  const list = document.getElementById("availableDaysList"); list.innerHTML = "";
  available.forEach(d => { 
    const btn = document.createElement("button"); btn.className = "btn-add-day"; btn.innerText = d; 
    btn.onclick = () => { 
      database.activeDays.push(d); 
      database.activeDays.sort((a, b) => ALL_DAYS.indexOf(a) - ALL_DAYS.indexOf(b)); 
      saveData(); closeAddDayModal(); render(); 
    }; 
    list.appendChild(btn); 
  });
  document.getElementById("addDayBackdrop").classList.add("open");
}
function closeAddDayModal() { document.getElementById("addDayBackdrop").classList.remove("open"); }

function openSettings() { 
  syncSettingsUI();
  currentCalMonth = new Date(selectedCalDate.getFullYear(), selectedCalDate.getMonth(), 1);
  renderCalendar();
  document.getElementById("setupBackdrop").classList.add("open"); 
}
function closeSettings() { 
  document.getElementById("setupBackdrop").classList.remove("open"); 
  evaluateTheme(); 
}

function saveSettings() {
  const oldMode = database.scheduleMode;
  const oldFirstWeek = database.firstWeekType;

  database.themeMode = document.getElementById("themeSelectInput").value;
  database.fontSize = document.getElementById("fontSelectInput").value;
  database.scheduleMode = document.getElementById("scheduleModeSelect").value;
  database.firstWeekType = document.getElementById("firstWeekInput").value;
  
  const newStartDate = document.getElementById("semesterStartInputHidden").value;
  if (newStartDate) database.semesterStartDate = newStartDate;

  if (oldMode !== database.scheduleMode || oldFirstWeek !== database.firstWeekType) {
    clearAllUndos();
    rebuildWeeksFromToday();
  }

  saveData(); 
  document.getElementById("setupBackdrop").classList.remove("open"); 
  evaluateTheme();
  currentWeek = calculateCurrentSemesterWeek();
  render();
  
  showElegantToast("Настройки", "Изменения успешно сохранены");
}

function isSubjectImportant(subj) { return (database.important_subjects || []).includes(subj.trim()); }
function toggleSubjectPriority(subj) { const clean = subj.trim(); if (!database.important_subjects) database.important_subjects = []; const idx = database.important_subjects.indexOf(clean); if (idx > -1) { database.important_subjects.splice(idx, 1); lastImpChange = { subj: clean, on: false }; } else { database.important_subjects.push(clean); lastImpChange = { subj: clean, on: true }; } saveData(); render(); }
let lastImpChange = null; // какой предмет только что отметили/сняли — значок в списке предметов появляется или уходит плавно

function changeWeek(diff) { 
  if (currentWeek + diff < 1) return;
  const wrapper = document.getElementById("scheduleAnimationWrapper");
  const outClass = diff > 0 ? 'slide-out-left' : 'slide-out-right';
  const inClass = diff > 0 ? 'slide-in-right' : 'slide-in-left';
  
  document.getElementById("prevBtn").disabled = true;
  document.getElementById("nextBtn").disabled = true;

  wrapper.classList.remove('slide-in-right', 'slide-in-left');
  wrapper.classList.add(outClass);

  setTimeout(() => {
    currentWeek += diff; render(); 
    wrapper.classList.remove('slide-out-left', 'slide-out-right');
    wrapper.classList.add(inClass);
    setTimeout(() => {
      wrapper.classList.remove(inClass); 
      document.getElementById("prevBtn").disabled = currentWeek <= 1;
      document.getElementById("nextBtn").disabled = false;
    }, 300); 
  }, 150); 
}

// Момент окончания пары: дата дня недели + время конца («08:00 - 09:35» → 09:35). Нет времени — конец дня.
function pairEndDate(weekNum, dayName, timeStr) {
  const d = getDateForDay(weekNum, dayName);
  const m = String(timeStr || '').match(/(\d{1,2})[:.](\d{2})\s*$/);
  if (m) d.setHours(Number(m[1]), Number(m[2]), 0, 0); else d.setHours(23, 59, 59, 0);
  return d;
}
// Отмечать посещение можно только после окончания пары
function pairHasEnded(weekNum, dayName, timeStr) {
  return Date.now() >= pairEndDate(weekNum, dayName, timeStr).getTime();
}

// Убирает отметки с пар, которые ещё не закончились (могли остаться от старой версии или прийти с другого устройства).
// Пишем напрямую в localStorage без новой метки времени, чтобы не перебить более свежие данные из облака.
function clearFutureMarks() {
  let n = 0;
  Object.keys(database.weeks || {}).forEach(k => {
    const w = Number(k); if (!(w > 0)) return;
    ALL_DAYS.forEach(day => (database.weeks[k][day] || []).forEach(p => {
      if ((p.attended === true || p.attended === false) && !pairHasEnded(w, day, p.time)) { p.attended = null; n++; }
    }));
  });
  if (n) localStorage.setItem("tracker_v12_db", JSON.stringify(database));
  return n;
}

function toggleAttendance(pairId) { 
  const week = getWeekData(currentWeek); 
  for (const d of ALL_DAYS) { 
    const p = week[d]?.find(i => i.id === pairId); 
    if (p && p.cancelled) return;
    if (p && !pairHasEnded(currentWeek, d, p.time)) { showElegantToast("Рано", "Отметить пару можно после её окончания", "error"); return; }
    if (p) { p.attended = p.attended === null ? true : p.attended === true ? false : null; lastToggledPair = p.id; if (window.Social) Social.queueMark(currentWeek, d, p); saveData(); render(); return; } 
  } 
}

function undoSecondsLeft(entry) {
  return Math.max(1, Math.ceil((entry.deadline - Date.now()) / 1000));
}

// Список для отрисовки дня: реальные пары + плашки «Отменить» на местах удалённых пар
function buildDayDisplay(day, weekNum) {
  const pairs = getWeekData(weekNum)[day] || [];
  const items = pairs.map(p => ({ pair: p }));
  let remaining = pendingUndos.filter(e => e.day === day && e.weekNum === weekNum);
  const itemId = it => it.pair ? it.pair.id : it.undo.id;

  let progress = true;
  while (remaining.length && progress) {
    progress = false;
    remaining = remaining.filter(e => {
      let at;
      if (e.anchor === null) {
        at = 0;
      } else {
        const i = items.findIndex(it => itemId(it) === e.anchor);
        if (i === -1) return true; // якорь ещё не вставлен — попробуем на следующем проходе
        at = i + 1;
      }
      items.splice(at, 0, { undo: e });
      progress = true;
      return false;
    });
  }
  remaining.forEach(e => items.push({ undo: e }));
  return items;
}

function removeUndoEntry(entry) {
  pendingUndos = pendingUndos.filter(e => e !== entry);
  // Те, кто стоял «после» этой плашки, привязываем к её предыдущему элементу
  pendingUndos.forEach(e => { if (e.anchor === entry.id) e.anchor = entry.anchor; });
  if (!pendingUndos.length && undoTicker) { clearInterval(undoTicker); undoTicker = null; }
}

function clearAllUndos() {
  pendingUndos = [];
  if (undoTicker) { clearInterval(undoTicker); undoTicker = null; }
}

function startUndoTicker() {
  if (undoTicker) return;
  undoTicker = setInterval(() => {
    const now = Date.now();
    let expired = false;
    pendingUndos.slice().forEach(e => {
      if (now >= e.deadline) { removeUndoEntry(e); expired = true; }
      else {
        const btn = document.getElementById(`undoBtn_${e.id}`);
        if (btn) btn.textContent = `Отменить (${undoSecondsLeft(e)}с)`;
      }
    });
    if (expired) render();
  }, 250);
}

function triggerDeletePair(day, pairId) { 
  const week = getWeekData(currentWeek);
  const pairIndex = (week[day] || []).findIndex(p => p.id === pairId);
  if (pairIndex === -1) return;

  // Запоминаем, за каким элементом списка стояла пара (с учётом других плашек)
  const display = buildDayDisplay(day, currentWeek);
  const pos = display.findIndex(it => it.pair && it.pair.id === pairId);
  const prev = pos > 0 ? display[pos - 1] : null;
  const anchor = prev ? (prev.pair ? prev.pair.id : prev.undo.id) : null;

  // Высота настоящей карточки — плашка «Отменить» будет точно такой же, чтобы список не дёргался
  const cardEl = document.querySelector(`.pair-card[data-pair-id="${CSS.escape(String(pairId))}"]`);
  const cardHeight = cardEl ? cardEl.getBoundingClientRect().height : null;

  const deletedPair = week[day][pairIndex];
  pendingUndos.push({
    id: pairId, day, weekNum: currentWeek, anchor, height: cardHeight, shown: false,
    pair: JSON.parse(JSON.stringify(deletedPair)),
    deadline: Date.now() + UNDO_TIMEOUT_MS
  });

  week[day].splice(pairIndex, 1);
  saveData(); render();
  startUndoTicker();
}

function undoSpecificDelete(pairId) {
  const entry = pendingUndos.find(e => e.id === pairId);
  if (!entry) return;

  // Реальный индекс = число настоящих пар перед плашкой
  const display = buildDayDisplay(entry.day, entry.weekNum);
  const pos = display.findIndex(it => it.undo === entry);
  const realIndex = display.slice(0, pos).filter(it => it.pair).length;

  const week = getWeekData(entry.weekNum);
  week[entry.day] = week[entry.day] || [];
  week[entry.day].splice(realIndex, 0, entry.pair);

  // Пара вернулась с тем же id, поэтому зависимые плашки остаются на месте
  pendingUndos = pendingUndos.filter(e => e !== entry);
  if (!pendingUndos.length && undoTicker) { clearInterval(undoTicker); undoTicker = null; }
  saveData(); render();
}

function buildTimeSelectOptions() {
  const container = document.getElementById('customTimeOptions');
  container.innerHTML = '';
  database.bellSchedule.forEach(b => {
    const val = `${b.start} - ${b.end}`;
    const div = document.createElement('div');
    div.className = 'select-option';
    div.setAttribute('data-value', val);
    div.title = `${b.num} пара (${val})`;
    // Плитка: номер пары сверху, время снизу
    div.innerHTML = `<b>${b.num} пара</b><span>${escapeHtml(b.start)} – ${escapeHtml(b.end)}</span>`;
    container.appendChild(div);
  });
  initCustomSelects(); 
}

// --- ДОМАШНЕЕ ЗАДАНИЕ: чек-лист внутри карточки пары ---
const openHwPanels = new Set(); // какие панели сейчас раскрыты (переживают перерисовку)
let hwFreshTaskId = null;

const HW_ICONS = {
  list: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>',
  check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  plus: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  enter: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 10-5 5 5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>',
  close: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
};

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Строка для подстановки в onclick="fn('...')": сначала экранируем для JS, потом для HTML-атрибута
function jsArg(str) {
  return escapeHtml(String(str == null ? "" : str).replace(/\\/g, "\\\\").replace(/'/g, "\\'"));
}

function findWeekPair(weekNum, pairId) {
  const week = getWeekData(weekNum);
  for (const d of ALL_DAYS) {
    const p = week[d]?.find(i => i.id === pairId);
    if (p) return p;
  }
  return null;
}

function hwButtonHtml(p) {
  const tasks = Array.isArray(p.tasks) ? p.tasks : [];
  const left = tasks.filter(t => !t.done).length;
  const cls = ['action-circle-btn', 'hw-btn'];
  if (openHwPanels.has(p.id)) cls.push('active');
  if (tasks.length && left === 0) cls.push('all-done');
  const badge = left > 0 ? `<span class="hw-badge">${left}</span>` : '';
  return `<button class="${cls.join(' ')}" id="hwBtn_${p.id}" onclick="toggleHwPanel('${p.id}')" title="Домашнее задание">${HW_ICONS.list}${badge}</button>`;
}

function hwItemHtml(pairId, t) {
  const cls = 'hw-item' + (t.done ? ' done' : '') + (t.id === hwFreshTaskId ? ' fresh' : '');
  return `<div class="${cls}" data-task-id="${t.id}">
    <button class="hw-check" onclick="toggleHwTask('${pairId}', '${t.id}')" aria-label="Отметить">${HW_ICONS.check}</button>
    <span class="hw-text">${escapeHtml(t.text)}</span>
    <button class="hw-del" onclick="deleteHwTask('${pairId}', '${t.id}')" aria-label="Удалить">${HW_ICONS.close}</button>
  </div>`;
}

function hwPanelHtml(p) {
  const tasks = Array.isArray(p.tasks) ? p.tasks : [];
  return `<div class="hw-panel${openHwPanels.has(p.id) ? ' open' : ''}" id="hw_${p.id}">
    <div class="hw-panel-inner">
      <div class="hw-body">
        <div class="hw-list" id="hwList_${p.id}">${tasks.map(t => hwItemHtml(p.id, t)).join('')}</div>
        <div class="hw-add">
          <span class="hw-add-icon">${HW_ICONS.plus}</span>
          <input type="text" class="hw-input" maxlength="200" autocomplete="off" aria-label="Новый пункт" oninput="this.parentElement.classList.toggle('ready', this.value.trim().length > 0)" onkeydown="if (event.key === 'Enter') { event.preventDefault(); addHwTask('${p.id}'); }">
          <button class="hw-add-submit" onclick="addHwTask('${p.id}')">Добавить ${HW_ICONS.enter}</button>
        </div>
      </div>
    </div>
  </div>`;
}

// Обновляет только кнопку-индикатор (счётчик невыполненных), без перерисовки всего списка
function refreshHwButton(pairId) {
  const p = findWeekPair(currentWeek, pairId);
  const btn = document.getElementById(`hwBtn_${pairId}`);
  if (p && btn) btn.outerHTML = hwButtonHtml(p);
}

function refreshHwList(pairId) {
  const p = findWeekPair(currentWeek, pairId);
  const list = document.getElementById(`hwList_${pairId}`);
  if (!p || !list) return;
  list.innerHTML = (p.tasks || []).map(t => hwItemHtml(pairId, t)).join('');
  refreshHwButton(pairId);
}

function toggleHwPanel(pairId) {
  const panel = document.getElementById(`hw_${pairId}`);
  if (!panel) return;
  const open = !panel.classList.contains('open');
  panel.classList.toggle('open', open);
  if (open) openHwPanels.add(pairId); else openHwPanels.delete(pairId);
  const btn = document.getElementById(`hwBtn_${pairId}`);
  if (btn) btn.classList.toggle('active', open);
  if (open) {
    setTimeout(() => {
      const input = panel.querySelector('.hw-input');
      if (input && panel.classList.contains('open')) input.focus({ preventScroll: true });
    }, 320);
  }
}

function addHwTask(pairId) {
  const panel = document.getElementById(`hw_${pairId}`);
  const p = findWeekPair(currentWeek, pairId);
  if (!panel || !p) return;
  const input = panel.querySelector('.hw-input');
  const text = input.value.trim();
  if (!text) { input.focus(); return; }
  if (!Array.isArray(p.tasks)) p.tasks = [];
  const task = { id: 't_' + Math.random().toString(36).substr(2, 9), text, done: false };
  p.tasks.push(task);
  if (window.Social) Social.queueTask(task.id, 'add'); // сервер запоминает, когда пункт появился
  saveData();
  input.value = '';
  input.parentElement.classList.remove('ready');
  hwFreshTaskId = task.id;
  refreshHwList(pairId);
  hwFreshTaskId = null;
  input.focus({ preventScroll: true });
}

function toggleHwTask(pairId, taskId) {
  const p = findWeekPair(currentWeek, pairId);
  const t = p && (p.tasks || []).find(x => x.id === taskId);
  if (!t) return;
  t.done = !t.done;
  if (t.done && window.Social) Social.queueTask(t.id, 'done');
  saveData();
  const row = document.querySelector(`#hwList_${CSS.escape(pairId)} .hw-item[data-task-id="${CSS.escape(taskId)}"]`);
  if (row) row.classList.toggle('done', t.done); // без перерисовки — чтобы сработала плавная анимация
  refreshHwButton(pairId);
}

function deleteHwTask(pairId, taskId) {
  const p = findWeekPair(currentWeek, pairId);
  if (!p || !Array.isArray(p.tasks)) return;
  p.tasks = p.tasks.filter(x => x.id !== taskId);
  if (!p.tasks.length) delete p.tasks;
  saveData();
  const row = document.querySelector(`#hwList_${CSS.escape(pairId)} .hw-item[data-task-id="${CSS.escape(taskId)}"]`);
  if (row) { row.classList.add('removing'); setTimeout(() => refreshHwList(pairId), 180); }
  else refreshHwList(pairId);
}

function openModal(day, pair = null) {
  editingState = { day, pair }; 
  document.getElementById("modalBackdrop").classList.add("open"); 
  document.getElementById("modalTitle").textContent = pair ? `Редактировать пару` : `Новая пара`;
  document.getElementById("subjInput").value = pair ? pair.subject : ""; 
  
  const defaultTime = `${database.bellSchedule[0].start} - ${database.bellSchedule[0].end}`;
  setCustomSelectValue('timeSelect', pair ? pair.time : defaultTime);
  setCustomSelectValue('typeSelect', pair ? pair.type : "Лекция");
}

function closeModal() { document.getElementById("modalBackdrop").classList.remove("open"); editingState = null; }

function savePair() {
  if (!editingState) return;
  const { day, pair } = editingState;
  const subject = document.getElementById("subjInput").value.trim() || "Без названия";
  const timeVal = document.getElementById("timeSelect").value;
  const typeSelect = document.getElementById("typeSelect").value;
  
  const week = getWeekData(currentWeek);
  const tk = getWeekType(currentWeek);

  if (pair) { 
    const target = week[day].find(p => p.id === pair.id);
    if (target) { target.subject = subject; target.time = timeVal; target.type = typeSelect; }
    const tmplTarget = database.templates[tk][day]?.find(p => p.id === pair.id);
    if (tmplTarget) { tmplTarget.subject = subject; tmplTarget.time = timeVal; tmplTarget.type = typeSelect; }
  } else { 
    const newPair = { id: 'p_' + Math.random().toString(36).substr(2, 9), subject, time: timeVal, type: typeSelect, attended: null }; 
    week[day] = week[day] || []; week[day].push(newPair); 
    database.templates[tk][day] = database.templates[tk][day] || []; 
    database.templates[tk][day].push({...newPair}); 
  }
  
  week[day].sort((a, b) => a.time.localeCompare(b.time));
  saveData(); closeModal(); render();
}

function openBellModal() {
  const container = document.getElementById('bellListContainer');
  container.innerHTML = '';
  database.bellSchedule.forEach((b, i) => {
    const row = document.createElement('div');
    row.className = 'bell-grid-row';
    row.innerHTML = `
      <span style="font-size: var(--fs-sm); font-weight: 600; color: var(--text-main);">${b.num} пара:</span>
      <input type="text" class="input-field bell-start" data-idx="${i}" value="${b.start}" style="padding: 10px; text-align: center;">
      <span class="bell-divider">–</span>
      <input type="text" class="input-field bell-end" data-idx="${i}" value="${b.end}" style="padding: 10px; text-align: center;">
    `;
    container.appendChild(row);
  });
  document.getElementById('bellBackdrop').classList.add('open');
}

function closeBellModal() { document.getElementById('bellBackdrop').classList.remove('open'); }

function saveBellSchedule() {
  const starts = document.querySelectorAll('.bell-start');
  const ends = document.querySelectorAll('.bell-end');
  
  // Запоминаем звонки ДО правок: время меняется только у тех пар, что стояли ровно в изменённом звонке
  const timeKey = t => (t || '').replace(/\s+/g, '');
  const oldBellTimes = database.bellSchedule.map(b => `${b.start} - ${b.end}`);

  // 1. Сохраняем новые вводы пользователя в локальную базу звонков
  starts.forEach((inp, i) => {
    database.bellSchedule[i].start = inp.value.trim();
    database.bellSchedule[i].end = ends[i].value.trim();
  });

  // 2. Связка «старое время звонка -> новое». Раньше пары привязывались к звонкам по порядку,
  // и если в расписании нет пар в первом слоте (как у ИГЭУ), всё съезжало на слот вверх.
  const timeMapping = {};
  database.bellSchedule.forEach((b, i) => {
    const newTime = `${b.start} - ${b.end}`;
    if (timeKey(oldBellTimes[i]) !== timeKey(newTime)) timeMapping[timeKey(oldBellTimes[i])] = newTime;
  });

  // 5. Пробегаемся по всем парам и тотально заменяем старое время на новое
  const updateTimesInSchedule = (scheduleObj) => {
    Object.keys(scheduleObj).forEach(day => {
      if (scheduleObj[day]) {
        scheduleObj[day].forEach(pair => {
          const mapped = timeMapping[timeKey(pair.time)];
          if (mapped) pair.time = mapped;
        });
        // Сортируем пары внутри дня, чтобы они не перепутались местами
        scheduleObj[day].sort((a, b) => a.time.localeCompare(b.time));
      }
    });
  };

  // Обновляем шаблоны
  if (database.templates.unified) updateTimesInSchedule(database.templates.unified);
  if (database.templates.left) updateTimesInSchedule(database.templates.left);
  if (database.templates.right) updateTimesInSchedule(database.templates.right);

  // Обновляем уже отрисованные недели
  if (database.weeks) {
    Object.keys(database.weeks).forEach(weekKey => {
      updateTimesInSchedule(database.weeks[weekKey]);
    });
  }

  // 6. Сохраняем, закрываем окно и мгновенно перерисовываем главный экран!
  saveData(); 
  closeBellModal(); 
  buildTimeSelectOptions();
  render(); 
  
  showElegantToast("Звонки", "Время пар успешно изменено везде");
}
function checkLiveStatus(dayName, timeStr, weekNum) {
  if (weekNum !== calculateCurrentSemesterWeek()) return null;
  const now = new Date();
  const dayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
  if (ALL_DAYS[dayIndex] !== dayName) return null;

  const [startStr, endStr] = timeStr.split(' - ');
  if (!startStr || !endStr) return null;
  const [sH, sM] = startStr.split(':').map(Number);
  const [eH, eM] = endStr.split(':').map(Number);

  const sDate = new Date(now); sDate.setHours(sH, sM, 0, 0);
  const eDate = new Date(now); eDate.setHours(eH, eM, 0, 0);

  if (now >= sDate && now <= eDate) {
    const leftMin = Math.round((eDate - now) / 60000);
    return `ещё ${leftMin} мин`;
  }
  return null;
}
// Сколько процентов идущей пары уже прошло (для заливки строки)
function livePercent(timeStr) {
  const [a, b] = String(timeStr || '').split(' - ');
  if (!a || !b) return 0;
  const now = new Date(), s = new Date(now), e = new Date(now);
  s.setHours(...a.split(':').map(Number), 0, 0); e.setHours(...b.split(':').map(Number), 0, 0);
  return Math.max(0, Math.min(100, Math.round((now - s) / (e - s) * 100)));
}
let lastToggledPair = null;

function render() {
  document.getElementById("prevBtn").disabled = currentWeek <= 1; 
  const typeKey = getWeekType(currentWeek);
  
  document.getElementById("weekCenterDisplay").textContent = `Неделя ${currentWeek}`;
  // Под заголовком — даты недели; тип недели пишем только при чередующемся расписании
  const wkMon = getDateForDay(currentWeek, "Понедельник"), wkSun = getDateForDay(currentWeek, "Воскресенье");
  const wkRange = wkMon.getMonth() === wkSun.getMonth()
    ? `${wkMon.getDate()} – ${formatDate(wkSun)}` : `${formatDate(wkMon)} – ${formatDate(wkSun)}`;
  document.getElementById("weekTypeDisplay").textContent = wkRange + (typeKey === "left" ? " · первая неделя" : typeKey === "right" ? " · вторая неделя" : "");
  document.querySelector(".lg-today")?.classList.toggle("is-current", currentWeek === calculateCurrentSemesterWeek());
  
  const wrapper = document.getElementById("scheduleAnimationWrapper"); 
  wrapper.innerHTML = ""; const weekData = getWeekData(currentWeek);

  (database.activeDays || ALL_DAYS).forEach(day => {
    const pairs = weekData[day] || []; 
    const block = document.createElement("div");
    const dateObj = getDateForDay(currentWeek, day);
    const formattedDate = formatDate(dateObj);
    const isToday = isDateToday(dateObj);
    block.className = "day-group" + (isToday ? " is-today" : "");

    let html = `
      <div class="day-header">
        <div class="day-title-wrap">
          <span class="day-name">${day}</span><span class="day-date">${formattedDate}</span>${isToday ? `<span class="today-badge">Сегодня</span>` : ''}
        </div>
        <div class="day-actions">
          <!-- Действия с днём (отметить все, добавить пару, скрыть день) — в стеклянном меню (glass.js) -->
          <button class="lg-more" onclick="PairMenu.openDay(this, '${day}')" aria-label="Действия с днём" aria-haspopup="menu" title="Действия с днём"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button>
        </div>
      </div>
      <div class="day-card">
    `;

    if (pairs.length === 0 && !pendingUndos.some(e => e.day === day && e.weekNum === currentWeek)) {
      html += `<div class="day-empty"><span>Нет пар</span><button type="button" class="day-empty-add" onclick="openModal('${day}')">${ICONS.plus}Добавить пару</button></div>`;
    } else {
      buildDayDisplay(day, currentWeek).forEach(item => {
        if (item.undo) {
          const u = item.undo;
          const phStyle = u.height ? ` style="height: ${u.height}px;"` : '';
          const phCls = u.shown ? 'undo-placeholder-card' : 'undo-placeholder-card fresh';
          u.shown = true; // анимация появления только при первой отрисовке
          html += `
          <div class="${phCls}"${phStyle}>
            <span class="undo-info">«${escapeHtml(item.undo.pair.subject)}» удалена</span>
            <button class="undo-action-btn" onclick="undoSpecificDelete('${item.undo.id}')" id="undoBtn_${item.undo.id}">Отменить (${undoSecondsLeft(item.undo)}с)</button>
          </div>
        `;
          return;
        }
        const p = item.pair;
        const isImp = isSubjectImportant(p.subject || ""), cln = jsArg(p.subject || ""); 
        // Отметка — круглая кнопка: пусто → посещено (зелёная галочка) → пропуск (красный крестик) → пусто
        let stCls = "lg-status", stTxt = "Отметить посещение";
        let stIcn = '';
        if (p.attended === true) {
          stCls += " attended"; stTxt = "Посещено. Нажми, чтобы отметить пропуск";
          stIcn = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path class="lg-draw" d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
        } else if (p.attended === false) {
          stCls += " missed"; stTxt = "Пропуск. Нажми, чтобы снять отметку";
          stIcn = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path class="lg-draw" d="M6 6l12 12M18 6L6 18"/></svg>`;
        }
        const notEnded = !p.cancelled && !pairHasEnded(currentWeek, day, p.time);
        if (notEnded) { stCls += " not-yet"; stTxt = "Отметить можно после окончания пары"; }
        if (p.id === lastToggledPair) stCls += " pop";   // пружинка только у той пары, которую сейчас отметили

        const liveStatus = p.cancelled ? null : checkLiveStatus(day, p.time, currentWeek);
        const livePct = liveStatus ? livePercent(p.time) : 0;

        // Номер пары по звонкам — в подсказке при наведении на время
        const safePTime = (p.time || "").replace(/\s+/g, '');
        const bell = database.bellSchedule.find(b => `${b.start}-${b.end}`.replace(/\s+/g, '') === safePTime);
        // Тип занятия: цвет плитки как на сайте (лекция жёлтая, практика зелёная, лабораторная розовая)
        const typeLow = (p.type || "").toLowerCase();
        const typeKind = typeLow.startsWith("лек") ? "lecture"
          : (typeLow.startsWith("практ") || typeLow.startsWith("сем") || typeLow.startsWith("пр")) ? "practice"
          : typeLow.startsWith("лаб") ? "lab" : "other";
        // Время пары: начало над концом
        const tParts = (p.time || "").split(" - ");
        const timeHtml = tParts.length === 2
          ? `<span class="time-text">${escapeHtml(tParts[0].trim())}</span><span class="time-text time-end">${escapeHtml(tParts[1].trim())}</span>`
          : `<span class="time-text">${escapeHtml(p.time || "")}</span>`;

        html += `
          <div data-pair-id="${p.id}" class="pair-card ${isImp ? 'is-important' : ''} ${liveStatus ? 'is-live' : ''} ${p.cancelled ? 'is-cancelled' : ''} ${(p.tasks || []).some(t => !t.done) ? 'has-hw' : ''}"${liveStatus ? ` style="--live:${livePct}%"` : ''}>
            <div class="time-block"${bell ? ` title="${bell.num} пара"` : ''}>
              ${timeHtml}
            </div>

            <div class="pair-info" onclick="PairMenu.rowTap(this, '${day}', '${p.id}')">
              <span class="pair-title">${escapeHtml(p.subject || "")}</span>
              <span class="pair-meta">
                <span class="pair-type" data-kind="${typeKind}">${escapeHtml(p.type || "")}</span>
                ${isImp ? `<span class="pair-flag" title="Важный предмет"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill="currentColor"/><path d="M4 22v-7"/></svg>Важный</span>` : ''}
                ${liveStatus ? `<span class="live-indicator">${liveStatus}</span>` : ''}
                ${p.cancelled ? `<span class="cancelled-note" title="Пары больше нет в расписании вуза. Отметка и ДЗ сохранены">убрана из расписания</span>` : ''}
              </span>
            </div>
            <div class="pair-actions">
              <!-- Действия с парой — в стеклянном меню (glass.js: PairMenu) -->
              <button class="lg-more" onclick="PairMenu.open(this, '${day}', '${p.id}')" aria-label="Действия с парой" aria-haspopup="menu" title="Действия">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
              </button>
              <!-- Домашнее задание — всегда под рукой, рядом с отметкой -->
              ${hwButtonHtml(p)}
            </div>
            ${p.cancelled ? '<span class="lg-status-gap"></span>'
              : `<button class="${stCls}" onclick="toggleAttendance('${p.id}')" title="${stTxt}" aria-label="${stTxt}">${stIcn}</button>`}
            ${hwPanelHtml(p)}
          </div>`;
      });

    }
    html += `</div>`; // .day-card
    block.innerHTML = html; wrapper.appendChild(block);
  });

  const addDayContainer = document.getElementById("addDayBtnContainer");
  if ((database.activeDays || []).length < ALL_DAYS.length) {
    addDayContainer.innerHTML = `<button type="button" class="lg-add-day" onclick="PairMenu.openAddDay(this)" aria-haspopup="menu" title="Добавить учебный день">${ICONS.plus}<span>Учебный день</span></button>`;
  } else {
    addDayContainer.innerHTML = '';
  }

  lastToggledPair = null;
  renderSubjectStats(); lastImpChange = null; renderOverallStats();
}
// Тип занятия по названию: лекция / практика (семинар) / лабораторная / другое
function pairKind(type) {
  const t = (type || "").toLowerCase();
  return t.startsWith("лек") ? "lecture"
    : (t.startsWith("практ") || t.startsWith("сем") || t.startsWith("пр")) ? "practice"
    : t.startsWith("лаб") ? "lab" : "other";
}
const KIND_ORDER = ["lecture", "practice", "lab", "other"];
const KIND_NAME = { lecture: "Лекции", practice: "Практики", lab: "Лабораторные", other: "Другие занятия" };
const KIND_SHORT = { lecture: "лекции", practice: "практики", lab: "лабы", other: "другое" };

function renderSubjectStats() {
  // Считаем по предмету и отдельно по каждому типу занятий
  const stats = {};
  Object.values(database.weeks).forEach(w => {
    (database.activeDays || ALL_DAYS).forEach(day => {
      (w[day] || []).forEach(p => {
        const n = p.subject?.trim(); if (!n || p.cancelled) return;
        const s = stats[n] || (stats[n] = { a: 0, t: 0, kinds: {} });
        const k = s.kinds[pairKind(p.type)] || (s.kinds[pairKind(p.type)] = { a: 0, t: 0 });
        if (p.attended === true) { s.a++; s.t++; k.a++; k.t++; }
        else if (p.attended === false) { s.t++; k.t++; }
      });
    });
  });
  const list = document.getElementById("subjectsList"); list.innerHTML = "";
  const pctOf = i => i.t > 0 ? Math.round((i.a / i.t) * 100) : null;
  // Сортировка: «по важности» — важные сверху, затем от худшей посещаемости; «по посещаемости» — от худшей к лучшей.
  // Предметы без отметок — в конце; при равенстве — по алфавиту.
  const mode = database.subjectSort || "importance";
  const byPct = (x, y) => {
    const px = pctOf(stats[x]), py = pctOf(stats[y]);
    if (px === null || py === null) return (px === null) - (py === null);
    return px - py;
  };
  const keys = Object.keys(stats).sort((x, y) =>
    (mode === "importance" ? isSubjectImportant(y) - isSubjectImportant(x) : 0) || byPct(x, y) || x.localeCompare(y, "ru"));
  if (keys.length === 0) { list.innerHTML = `<div style="font-size: var(--fs-base); color: var(--text-light);">Нет предметов</div>`; return; }
  keys.forEach(subj => {
    const i = stats[subj], isImp = isSubjectImportant(subj), pct = i.t > 0 ? Math.round((i.a / i.t) * 100) : 0;
    let c = pct < 60 ? "var(--color-red)" : pct < 80 ? "var(--color-yellow)" : "var(--color-green)";
    if (i.t === 0) c = "var(--text-light)";
    const b = document.createElement("div"); b.className = "subject-item" + (isImp ? " is-important" : "") + (lastImpChange && lastImpChange.subj === subj ? (lastImpChange.on ? " imp-in" : " imp-out") : ""); b.title = `${subj}: посещено ${i.a} из ${i.t}`;
    b.innerHTML = `
      <div class="subj-header">
        <div class="subj-name-wrap">
          <div class="priority-btn ${isImp ? 'active' : ''}" onclick="toggleSubjectPriority('${jsArg(subj)}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${isImp ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
          </div>
          <span class="subj-name">${escapeHtml(subj)}</span>
        </div>
        <div class="subj-stat" style="color: ${c};">${i.t > 0 ? pct + '%' : '—'}</div>
      </div>
      <div class="prog-track" style="height: 4px;"><div class="prog-fill" style="width: ${pct}%; background: ${c}"></div></div>`;
    list.appendChild(b);
  });
}

function renderOverallStats() {
  let a = 0, t = 0; 
  Object.values(database.weeks).forEach(w => { 
    (database.activeDays || ALL_DAYS).forEach(day => { 
      (w[day] || []).forEach(p => { 
        if (p.cancelled) return;
        if (p.attended === true) { a++; t++; } 
        else if (p.attended === false) { t++; } 
      });
    });
  });
  const pct = t > 0 ? Math.round((a / t) * 100) : 0; 
  document.getElementById("overallPercent").textContent = t > 0 ? `${pct}%` : '—';
  document.getElementById("overallCount").textContent = `${a} из ${t} ${t % 10 === 1 && t % 100 !== 11 ? 'пары' : 'пар'}`;
  const ring = document.getElementById("overallRing");
  if (ring) {
    const C = 2 * Math.PI * 52;
    ring.style.strokeDasharray = C;
    ring.style.strokeDashoffset = C * (1 - (t > 0 ? pct : 0) / 100);
    ring.style.stroke = pct >= 80 ? "var(--color-green)" : pct >= 60 ? "var(--color-yellow)" : "var(--color-red)";
    // Цвет кольца нужен и дорожке под ним (бледная подложка того же цвета)
    const box = ring.closest('.lg-ring');
    if (box) box.style.setProperty('--ring', t > 0 ? ring.style.stroke : 'var(--text-light)');
  }
}

function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(database, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `tracker_backup_${new Date().toISOString().slice(0,10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const imported = JSON.parse(event.target.result);
      if (imported.templates && imported.weeks) {
        clearAllUndos(); database = imported; clearFutureMarks(); saveData(); syncSettingsUI(); evaluateTheme();
        currentWeek = calculateCurrentSemesterWeek(); render(); closeSettings();
        if (window.Profile) Profile.refresh();
        showElegantToast("Восстановление", "Резервная копия успешно загружена");
      }
    } catch (err) { alert("Ошибка чтения файла JSON"); }
  };
  reader.readAsText(file);
}

// --- ИНТЕГРАЦИЯ С ПАРСЕРОМ ННГУ (ЧЕРЕДОВАНИЕ ЛЕВАЯ / ПРАВАЯ) ---

function getWeekMondayISO(weekNum) {
  const d = getDateForDay(weekNum, "Понедельник");
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLessonsToTemplate(fetchedData) {
  const dayMap = { 
    "ПН": "Понедельник", 
    "ВТ": "Вторник", 
    "СР": "Среда", 
    "ЧТ": "Четверг", 
    "ПТ": "Пятница", 
    "СБ": "Суббота", 
    "ВС": "Воскресенье" 
  };
  const template = {};
  for (const day of ALL_DAYS) {
    template[day] = [];
  }

  if (!fetchedData) return template;

  for (const [dateKey, lessons] of Object.entries(fetchedData)) {
    const prefix = dateKey.split(" ")[0];
    const fullDayName = dayMap[prefix];
    if (!fullDayName) continue;

    template[fullDayName] = (lessons || []).map(l => {
      let type = "Лекция";
      const infoText = (l.info || "").toLowerCase();
      const subjText = (l.subject || "Без названия").toLowerCase();

      if (infoText.includes("практикум") || subjText.includes("практикум") || infoText.includes("практ")) type = "Практика";
      if (infoText.includes("лаб") || subjText.includes("лаб")) type = "Лабораторная";
      // Парсер сам определяет тип занятия; догадка по тексту выше нужна только если он его не прислал
      if (["Лекция", "Практика", "Лабораторная"].includes(l.type)) type = l.type;

      return {
        id: 'p_' + Math.random().toString(36).substr(2, 9),
        time: l.time || "00:00",
        subject: l.subject || "Без названия",
        type: type,
        attended: null
      };
    });
  }
  return template;
}

function areTemplatesEqual(tmplA, tmplB) {
  for (const day of ALL_DAYS) {
    const listA = tmplA[day] || [];
    const listB = tmplB[day] || [];
    if (listA.length !== listB.length) return false;
    for (let i = 0; i < listA.length; i++) {
      if (
        listA[i].subject !== listB[i].subject || 
        listA[i].time !== listB[i].time ||
        listA[i].type !== listB[i].type
      ) {
        return false;
      }
    }
  }
  return true;
}

async function loadUniversitySchedule() {
  if (window.Ispu && Ispu.isIspuUser()) return Ispu.loadSchedule(); // ИГЭУ: свой парсер
  if (!database || !database.userProfile || !database.userProfile.group) return;
  const groupName = database.userProfile.group;

  try {
    showElegantToast("Синхронизация", `Загружаем расписание для ${groupName}...`, "success");

    const week1Num = currentWeek;       
    const week2Num = currentWeek + 1;   

    const date1 = getWeekMondayISO(week1Num);
    const date2 = getWeekMondayISO(week2Num);

    const url1 = `${API_URL}/api/schedule_v2?group=${encodeURIComponent(groupName)}&date=${date1}&_t=${Date.now()}`;
    const url2 = `${API_URL}/api/schedule_v2?group=${encodeURIComponent(groupName)}&date=${date2}&_t=${Date.now()}`;

    const [res1, res2] = await Promise.all([fetch(url1), fetch(url2)]);

    if (!res1.ok || !res2.ok) throw new Error("Сервер не ответил на один из запросов");

    const data1 = await res1.json();
    const data2 = await res2.json();

    if (data1.error || data2.error) throw new Error(data1.error || data2.error);

    const tmpl1 = parseLessonsToTemplate(data1.data);
    const tmpl2 = parseLessonsToTemplate(data2.data);

    const isUnified = areTemplatesEqual(tmpl1, tmpl2);

    if (isUnified) {
      database.scheduleMode = "unified";
      database.templates.unified = tmpl1;
    } else {
      database.scheduleMode = "alternate";
      const type1 = getWeekType(week1Num);
      const type2 = getWeekType(week2Num);
      database.templates[type1] = tmpl1;
      database.templates[type2] = tmpl2;
    }

    const uniqueTimes = new Set();
    const extractTimes = (tmpl) => {
      Object.values(tmpl).forEach(day => day.forEach(p => { if (p.time) uniqueTimes.add(p.time); }));
    };
    
    if (isUnified) { 
      extractTimes(tmpl1); 
    } else { 
      extractTimes(tmpl1); 
      extractTimes(tmpl2); 
    }

    const sortedTimes = Array.from(uniqueTimes).sort();
    
    if (sortedTimes.length > 0) {
      database.bellSchedule = sortedTimes.map((timeStr, i) => {
        const [start, end] = timeStr.split(' - ');
        return { num: i + 1, start: start ? start.trim() : "", end: end ? end.trim() : "" };
      });
      buildTimeSelectOptions(); 
    }

    clearAllUndos();
    const rebuilt = rebuildWeeksFromToday();

    showElegantToast("Успешно", "Расписание и время звонков синхронизированы" + rebuildSummaryText(rebuilt), "success");

    saveData();
    syncSettingsUI();
    render();

  } catch (error) {
    console.error("Ошибка загрузки расписания:", error);
    showElegantToast("Сбой загрузки", error.message, "error");
  }
}

// --- ЛОГИКА РУЧНОЙ СИНХРОНИЗАЦИИ ---
document.addEventListener('DOMContentLoaded', () => {
    const syncBtn = document.getElementById('sync-schedule-btn');
    const syncModal = document.getElementById('sync-warning-modal');
    const cancelSyncBtn = document.getElementById('cancel-sync-btn');
    const confirmSyncBtn = document.getElementById('confirm-sync-btn');

    if (syncBtn && syncModal) {
        // Открываем модалку по кнопке из настроек
        syncBtn.addEventListener('click', () => {
            syncModal.classList.add('open');
        });
    }

    if (cancelSyncBtn) {
        // Закрываем модалку
        cancelSyncBtn.addEventListener('click', () => {
            syncModal.classList.remove('open');
        });
    }

    if (confirmSyncBtn) {
        // Запускаем синхронизацию
        confirmSyncBtn.addEventListener('click', async () => {
            syncModal.classList.remove('open');
            // Сохраняем тему и размер шрифта, выбранные в настройках (они применялись только как предпросмотр),
            // иначе после синхронизации интерфейс откатится к ранее сохранённым значениям
            const themeInput = document.getElementById('themeSelectInput');
            const fontInput = document.getElementById('fontSelectInput');
            if (themeInput && themeInput.value) database.themeMode = themeInput.value;
            if (fontInput && fontInput.value) database.fontSize = fontInput.value;
            // Эта функция сама всё скачает, сохранит и отрисует
            await loadUniversitySchedule();
            // Закрываем окно настроек, чтобы юзер увидел свежее расписание
            closeSettings(); 
        });
    }
});
