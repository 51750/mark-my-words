document.addEventListener('DOMContentLoaded', () => {
  const themeColorInput = document.getElementById('theme-color');
  const themeColorValue = document.getElementById('theme-color-value');
  const paletteList = document.getElementById('palette-list');
  const newColorPicker = document.getElementById('new-color-picker');
  const addColorBtn = document.getElementById('add-color-btn');
  const backBtn = document.getElementById('back-btn');
  const resetBtn = document.getElementById('reset-btn');
  const autoTranslateToggle = document.getElementById('auto-translate-toggle');
  const whitelistModeToggle = document.getElementById('whitelist-mode-toggle');
  const appVersion = document.getElementById('app-version');

  let currentPalette = ['#10b981', '#f59e0b', '#ef4444'];

  if (appVersion && chrome.runtime?.getManifest) {
    const manifest = chrome.runtime.getManifest();
    appVersion.textContent = `v${manifest.version}`;
  }

  // Load saved settings
  chrome.storage.local.get(['themeColor', 'colorPalette', 'autoTranslate', 'whitelistMode'], (result) => {
    if (result.themeColor) {
      themeColorInput.value = result.themeColor;
      themeColorValue.textContent = result.themeColor.toUpperCase();
      applyTheme(result.themeColor);
    }
    if (result.colorPalette) {
      currentPalette = result.colorPalette;
    }
    if (result.autoTranslate !== undefined) {
      autoTranslateToggle.checked = result.autoTranslate;
    }
    whitelistModeToggle.checked = result.whitelistMode === true;
    renderPalette();
  });

  // Theme color change
  themeColorInput.addEventListener('input', (e) => {
    const color = e.target.value;
    themeColorValue.textContent = color.toUpperCase();
    applyTheme(color);
  });

  themeColorInput.addEventListener('change', (e) => {
    const color = e.target.value;
    chrome.storage.local.set({ themeColor: color }, () => {
      notifyUpdate('updateColor', color);
    });
  });

  // Palette management
  addColorBtn.addEventListener('click', () => {
    const newColor = newColorPicker.value;
    if (!currentPalette.includes(newColor)) {
      currentPalette.push(newColor);
      chrome.storage.local.set({ colorPalette: currentPalette }, () => {
        renderPalette();
        notifyUpdate('updatePalette', currentPalette);
      });
    }
  });

  // Auto-translate toggle
  autoTranslateToggle.addEventListener('change', (e) => {
    chrome.storage.local.set({ autoTranslate: e.target.checked }, () => {
      // Notify popup to update language row visibility
      chrome.runtime.sendMessage({
        action: 'autoTranslateChanged',
        enabled: e.target.checked
      }).catch(() => {
        // Popup might not be open, that's okay
      });
    });
  });

  whitelistModeToggle.addEventListener('change', (e) => {
    chrome.storage.local.set({ whitelistMode: e.target.checked });
  });

  function renderPalette() {
    paletteList.innerHTML = '';
    currentPalette.forEach((color, index) => {
      const item = document.createElement('div');
      item.className = 'palette-item';
      item.style.backgroundColor = color;

      const removeBtn = document.createElement('div');
      removeBtn.className = 'remove-color';
      removeBtn.innerHTML = '×';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentPalette.splice(index, 1);
        chrome.storage.local.set({ colorPalette: currentPalette }, () => {
          renderPalette();
          notifyUpdate('updatePalette', currentPalette);
        });
      });

      item.appendChild(removeBtn);
      paletteList.appendChild(item);
    });
  }

  function applyTheme(color) {
    document.documentElement.style.setProperty('--primary', color);
  }

  function notifyUpdate(action, value) {
    // Notify all tabs (for content script)
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        const message = { action };
        if (action === 'updateColor') message.color = value;
        if (action === 'updatePalette') message.palette = value;

        chrome.tabs.sendMessage(tab.id, message).catch(() => { });
      });
    });
  }

  // Reset to factory defaults
  resetBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all settings to factory defaults? This will not delete your saved vocabulary.')) {
      const defaultSettings = {
        themeColor: '#6366f1',
        colorPalette: ['#10b981', '#f59e0b', '#ef4444'],
        sourceLanguage: 'auto',
        targetLanguage: 'zh-CN',
        autoTranslate: true,
        whitelistMode: false,
        disabledSites: []
      };

      chrome.storage.local.set(defaultSettings, () => {
        // Update UI
        themeColorInput.value = defaultSettings.themeColor;
        themeColorValue.textContent = defaultSettings.themeColor.toUpperCase();
        applyTheme(defaultSettings.themeColor);
        currentPalette = defaultSettings.colorPalette;
        renderPalette();
        autoTranslateToggle.checked = defaultSettings.autoTranslate;
        whitelistModeToggle.checked = defaultSettings.whitelistMode;

        // Notify all tabs
        notifyUpdate('updateColor', defaultSettings.themeColor);
        notifyUpdate('updatePalette', defaultSettings.colorPalette);

        alert('Settings have been reset to factory defaults.');
      });
    }
  });

  backBtn.addEventListener('click', () => {
    window.location.href = '../popup/popup.html';
  });
});
