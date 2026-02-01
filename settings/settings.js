document.addEventListener('DOMContentLoaded', () => {
  const themeColorInput = document.getElementById('theme-color');
  const themeColorValue = document.getElementById('theme-color-value');
  const paletteList = document.getElementById('palette-list');
  const newColorPicker = document.getElementById('new-color-picker');
  const addColorBtn = document.getElementById('add-color-btn');
  const backBtn = document.getElementById('back-btn');

  let currentPalette = ['#10b981', '#f59e0b', '#ef4444'];

  // Load saved settings
  chrome.storage.local.get(['themeColor', 'colorPalette'], (result) => {
    if (result.themeColor) {
      themeColorInput.value = result.themeColor;
      themeColorValue.textContent = result.themeColor.toUpperCase();
      applyTheme(result.themeColor);
    }
    if (result.colorPalette) {
      currentPalette = result.colorPalette;
    }
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

  backBtn.addEventListener('click', () => {
    window.location.href = '../popup/popup.html';
  });
});
