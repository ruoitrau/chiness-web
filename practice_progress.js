/* Preserve unfinished answers when a lesson is reopened - HSKK Practice Platform */
(function () {
  'use strict';

  const storageKey = 'dest_chiness_answers_v1:' + (location.pathname.split('/').pop() || 'index.html');
  let restoring = false;
  let resetting = false;
  let skipSave = false;
  let choices = {};

  function readSaved() {
    try {
      return JSON.parse(localStorage.getItem(storageKey)) || {};
    } catch (error) {
      return {};
    }
  }

  function selectorFor(element) {
    const parts = [];
    while (element && element !== document.documentElement) {
      if (element.id) {
        parts.unshift('#' + CSS.escape(element.id));
        break;
      }
      const parent = element.parentElement;
      if (!parent) break;
      const index = Array.from(parent.children).indexOf(element) + 1;
      parts.unshift(element.tagName.toLowerCase() + ':nth-child(' + index + ')');
      element = parent;
    }
    return parts.join(' > ');
  }

  function fields() {
    return Array.from(document.querySelectorAll('input, select, textarea'))
      .filter(element => !element.readOnly && !element.disabled && element.type !== 'hidden');
  }

  function save() {
    if (restoring || resetting || skipSave) return;
    for (const element of document.querySelectorAll('.selected[onclick], .choice-pill.selected, .opt-label.selected, .pill.selected, .option-btn.selected')) {
      const handler = element.getAttribute('onclick') || '';
      const group = element.closest('[id*="opts"], [id*="options"], .mc-group, .mcq-options, .options-grid, .options-row, .q-pills, .q-options') || element.parentElement;
      if (group) {
        choices[selectorFor(group)] = { selector: selectorFor(element), handler: handler };
      }
    }
    const values = fields().map(element => ({
      selector: selectorFor(element),
      type: element.type,
      value: element.value,
      checked: element.checked,
      revealed: element.dataset.revealed === 'true'
    }));
    try {
      const assistedGroups = Array.from(document.querySelectorAll('[id][data-revealed="true"]'))
        .filter(element => !element.matches('input, select, textarea'))
        .map(selectorFor);
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, fields: values, choices: choices, assistedGroups: assistedGroups }));
    } catch (error) {
      // Platform remains fully usable when browser storage is restricted.
    }
  }

  function clear() {
    skipSave = true;
    choices = {};
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {}
  }

  function restore() {
    const saved = readSaved();
    if (!saved || saved.version !== 1) return;
    restoring = true;
    for (const item of saved.fields || []) {
      const element = document.querySelector(item.selector);
      if (!element || element.type !== item.type || element.readOnly) continue;
      if (element.type === 'radio' || element.type === 'checkbox') {
        element.checked = Boolean(item.checked);
        if (element.checked) {
          element.dispatchEvent(new Event('change', { bubbles: true }));
          if (element.type === 'radio') element.click();
        }
      } else if (typeof item.value === 'string') {
        if (element.value !== item.value) {
          element.value = item.value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      if (item.revealed) element.dataset.revealed = 'true';
    }
    choices = saved.choices && typeof saved.choices === 'object' ? saved.choices : {};
    for (const item of Object.values(choices)) {
      const element = document.querySelector(item.selector);
      if (element) {
        if (element.tagName === 'BUTTON' || element.classList.contains('choice-pill') || element.classList.contains('opt-label')) {
          element.click();
        }
      }
    }
    for (const selector of saved.assistedGroups || []) {
      const element = document.querySelector(selector);
      if (element) element.dataset.revealed = 'true';
    }
    restoring = false;

    // Trigger UI progress recalculation if available
    if (typeof window.updateGlobalProgress === 'function') {
      try { window.updateGlobalProgress(); } catch (e) {}
    }
  }

  function saveEditedAnswer() {
    skipSave = false;
    save();
  }

  document.addEventListener('input', saveEditedAnswer);
  document.addEventListener('change', saveEditedAnswer);
  document.addEventListener('click', function (event) {
    const element = event.target.closest('[onclick], .choice-pill, .opt-label, .option-btn');
    if (!element) return;
    const handler = element.getAttribute('onclick') || '';
    const reset = /^(?:resetAll\w*|resetTest|resetReview|resetExam|resetProgress|restartTest|resetUnit|resetEntireLesson|resetDe)\s*\(/.test(handler) ||
      (/học lại từ đầu|làm lại từ đầu|reset toàn bộ|làm lại bài/i.test(element.textContent) && !/^resetEx|^retryEx/i.test(handler));
    if (reset) {
      resetting = true;
      setTimeout(function () {
        if (resetting) clear();
        resetting = false;
      }, 0);
      return;
    }
    if (/^reset|^retry/i.test(handler) || /làm lại|thử lại/i.test(element.textContent)) {
      const section = element.closest('.card, .section-card, .exercise-block, .q-item, .ex-card, .box') || element.parentElement;
      if (section) {
        for (const [key, choice] of Object.entries(choices)) {
          const answer = document.querySelector(choice.selector);
          if (answer && section.contains(answer)) delete choices[key];
        }
      }
    }
    if ((/^(?:select|choose|pick|checkChoice|checkTrap|selectChoice)[A-Za-z0-9_]*\s*\(/.test(handler) ||
         element.classList.contains('choice-pill') || element.classList.contains('opt-label')) &&
        element.tagName !== 'INPUT') {
      skipSave = false;
      const group = element.closest('[id*="opts"], [id*="options"], .mc-group, .mcq-options, .options-grid, .options-row, .q-pills, .q-options') ||
        element.parentElement;
      if (group) {
        choices[selectorFor(group)] = { selector: selectorFor(element), handler: handler };
      }
    }
    setTimeout(save, 0);
  }, true);

  const originalConfirm = window.confirm;
  window.confirm = function (message) {
    const accepted = originalConfirm.call(window, message);
    if (resetting) {
      if (accepted) clear();
      resetting = false;
    }
    return accepted;
  };

  window.addEventListener('pagehide', save);
  window.addEventListener('beforeunload', save);

  function scheduleRestore() {
    restore();
    setTimeout(restore, 100);
    setTimeout(restore, 500);
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', scheduleRestore);
  } else {
    scheduleRestore();
  }
})();
