document.addEventListener('DOMContentLoaded', () => {
  const wordList = document.getElementById('word-list');
  const searchInput = document.getElementById('search-input');
  const emptyState = document.getElementById('empty-state');
  const clearAllBtn = document.getElementById('clear-all');
  const filterToggle = document.getElementById('filter-toggle');
  const exportBtn = document.getElementById('export-btn');
  const sourceLanguageSelect = document.getElementById('source-language');
  const targetLanguageSelect = document.getElementById('target-language');
  const languageRow = document.querySelector('.language-row');
  const settingsBtn = document.getElementById('settings-btn');
  const disableSiteBtn = document.getElementById('disable-site-btn');
  const toggleDefinitionsBtn = document.getElementById('toggle-definitions-btn');

  let fullVocabulary = []; // Store all data
  let currentUrl = '';
  let themeColor = '#6366f1';
  let colorPalette = ['#10b981', '#f59e0b', '#ef4444'];
  // Default showAll to false (unchecked) -> Current Page only
  let showAll = false;

  // Load saved preferences
  chrome.storage.local.get(['sourceLanguage', 'targetLanguage', 'autoTranslate', 'themeColor', 'hideDefinitions', 'colorPalette'], (result) => {
    if (result.sourceLanguage) {
      sourceLanguageSelect.value = result.sourceLanguage;
    }
    if (result.targetLanguage) {
      targetLanguageSelect.value = result.targetLanguage;
    }
    // Show/hide language row based on autoTranslate setting
    const autoTranslate = result.autoTranslate !== false; // Default to true
    if (languageRow) {
      languageRow.style.display = autoTranslate ? 'flex' : 'none';
    }
    if (result.themeColor) {
      themeColor = result.themeColor;
      applyThemeToPopup(result.themeColor);
    }
    if (result.colorPalette && Array.isArray(result.colorPalette)) {
      colorPalette = result.colorPalette;
    }
    if (toggleDefinitionsBtn) {
      const hidden = result.hideDefinitions === true;
      updateDefinitionsBtnUI(hidden);
    }
  });

  // Language Change Listeners
  sourceLanguageSelect.addEventListener('change', (e) => {
    chrome.storage.local.set({ sourceLanguage: e.target.value });
  });

  targetLanguageSelect.addEventListener('change', (e) => {
    chrome.storage.local.set({ targetLanguage: e.target.value });
  });

  // Settings Button Listener
  settingsBtn.addEventListener('click', () => {
    window.location.href = '../settings/settings.html';
  });

  // Listen for autoTranslate changes from settings page
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'autoTranslateChanged') {
      if (languageRow) {
        languageRow.style.display = message.enabled ? 'flex' : 'none';
      }
    }
  });

  function updateDefinitionsBtnUI(hidden) {
    if (!toggleDefinitionsBtn) return;
    toggleDefinitionsBtn.textContent = hidden ? 'Show Definitions' : 'Hide Definitions';
    toggleDefinitionsBtn.classList.toggle('active', hidden);
  }

  function applyThemeToPopup(color) {
    document.documentElement.style.setProperty('--primary', color);
    // Calculate a hover color (simpler way: just same or slightly different)
    // For now, let's keep it simple.
  }

  function notifyContentScriptsOfColorChange(color) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'updateColor',
          color: color
        }).catch(err => {
          // Ignore errors for tabs where content script isn't loaded
        });
      });
    });
  }

  // Get current tab URL first
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      currentUrl = tabs[0].url;
      try {
        const url = new URL(currentUrl);
        const hostname = url.hostname;

        // Check if current site is disabled
        chrome.storage.local.get(['disabledSites'], (result) => {
          const disabledSites = result.disabledSites || [];
          const isDisabled = disabledSites.includes(hostname);
          updateDisableBtnUI(isDisabled);

          // Add listener for clicking disable button
          disableSiteBtn.addEventListener('click', () => {
            toggleSiteDisabled(hostname);
          });
        });
      } catch (e) {
        disableSiteBtn.style.display = 'none'; // Not a valid URL for disabling
      }
      loadWords();
    }
  });

  if (toggleDefinitionsBtn) {
    toggleDefinitionsBtn.addEventListener('click', () => {
      chrome.storage.local.get(['hideDefinitions'], (result) => {
        const nextHidden = !(result.hideDefinitions === true);
        chrome.storage.local.set({ hideDefinitions: nextHidden }, () => {
          updateDefinitionsBtnUI(nextHidden);
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
              chrome.tabs.sendMessage(tab.id, {
                action: 'toggleDefinitions',
                hidden: nextHidden
              }).catch(() => {
                // Ignore tabs without content script
              });
            });
          });
        });
      });
    });
  }

  function updateDisableBtnUI(isDisabled) {
    if (!disableSiteBtn) return;
    if (isDisabled) {
      disableSiteBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Enable
      `;
      disableSiteBtn.classList.add('active');
    } else {
      disableSiteBtn.innerHTML = `
        <span class="status-dot"></span>
        Disable
      `;
      disableSiteBtn.classList.remove('active');
    }
  }

  function toggleSiteDisabled(hostname) {
    chrome.storage.local.get(['disabledSites'], (result) => {
      let disabledSites = result.disabledSites || [];
      const isDisabled = disabledSites.includes(hostname);

      if (isDisabled) {
        disabledSites = disabledSites.filter(s => s !== hostname);
      } else {
        disabledSites.push(hostname);
      }

      chrome.storage.local.set({ disabledSites }, () => {
        const nowDisabled = !isDisabled;
        updateDisableBtnUI(nowDisabled);

        // Notify content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'toggleExtension',
              disabled: nowDisabled
            }).catch(() => {
              // Tab might not have content script loaded
            });
          }
        });
      });
    });
  }

  // Toggle Listener
  filterToggle.addEventListener('change', (e) => {
    showAll = e.target.checked;
    renderCurrentView();
  });

  // Export CSV Listener
  exportBtn.addEventListener('click', () => {
    const vocab = getDisplayedVocabulary();
    if (vocab.length === 0) {
      alert('No words to export.');
      return;
    }

    const headers = ['Word', 'Translation', 'Date', 'URL'];
    const csvContent = [
      headers.join(','),
      ...vocab.map(item => {
        const row = [
          `"${(item.word || '').replace(/"/g, '""')}"`,
          `"${(item.translation || '').replace(/"/g, '""')}"`,
          `"${item.date}"`,
          `"${item.url}"`
        ];
        return row.join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'vocabulary_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Search functionality
  searchInput.addEventListener('input', (e) => {
    renderCurrentView();
  });

  // Clear all
  clearAllBtn.addEventListener('click', () => {
    if (showAll) {
      if (confirm('CAUTION: Are you sure you want to clear your ENTIRE vocabulary history? This cannot be undone.')) {
        chrome.storage.local.set({ vocabulary: [] }, () => {
          loadWords();
        });
      }
    } else {
      if (confirm('Are you sure you want to clear all saved words for THIS PAGE?')) {
        // Filter out words belonging to this URL
        const newVocabulary = fullVocabulary.filter(v => v.url !== currentUrl);
        chrome.storage.local.set({ vocabulary: newVocabulary }, () => {
          loadWords();
        });
      }
    }
  });

  function loadWords() {
    chrome.storage.local.get(['vocabulary'], (result) => {
      fullVocabulary = result.vocabulary || [];
      // Sort: newest first
      fullVocabulary.sort((a, b) => new Date(b.date) - new Date(a.date));
      renderCurrentView();
    });
  }

  function getDisplayedVocabulary() {
    let vocab = showAll ? fullVocabulary : fullVocabulary.filter(v => v.url === currentUrl);

    // Apply search filter
    const query = searchInput.value.toLowerCase();
    if (query) {
      vocab = vocab.filter(item =>
        (item.word || '').toLowerCase().includes(query) ||
        (item.translation || '').toLowerCase().includes(query)
      );
    }
    return vocab;
  }

  function renderCurrentView() {
    const words = getDisplayedVocabulary();
    renderWords(words);
  }

  function renderWords(words) {
    wordList.innerHTML = '';

    if (words.length === 0) {
      // Append emptyState directly to wordList if no words
      wordList.appendChild(emptyState);
      // Ensure emptyState is visible
      emptyState.style.display = 'block';
      return;
    } else {
      // Hide emptyState if there are words
      emptyState.style.display = 'none';
    }

    words.forEach(item => {
      const li = document.createElement('li');
      li.className = 'word-item';

      li.innerHTML = `
        <div class="word-content">
          <div class="word-header-row">
            <span class="word-text">${escapeHtml(item.word)}</span>
            ${item.color ? `<span class="color-dot" style="background-color: ${item.color}"></span>` : ''}
          </div>
          <span class="word-translation">${escapeHtml(item.translation)}</span>
          ${showAll && item.url !== currentUrl ? `<a href="#" class="source-link" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</a>` : ''}
        </div>
        <div class="word-actions">
          <button class="edit-btn" aria-label="Edit">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-1.5L7 16.999l-4 1 1-4 9.732-9.731a2.5 2.5 0 013.536 3.536z" />
            </svg>
          </button>
          <button class="delete-btn" aria-label="Delete">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
        <div class="word-edit">
          <div class="edit-row">
            <label>Translation</label>
            <input type="text" class="edit-translation" />
          </div>
          <div class="edit-row">
            <label>Color</label>
            <div class="edit-color-row">
              <input type="color" class="edit-color" />
              <label class="edit-default-toggle">
                <input type="checkbox" class="edit-use-default" />
                Default
              </label>
            </div>
            <div class="edit-palette"></div>
          </div>
          <div class="edit-row">
            <label>URL</label>
            <input type="text" class="edit-url" />
          </div>
          <div class="edit-actions">
            <button class="secondary-btn edit-cancel" type="button">Cancel</button>
            <button class="primary-btn edit-save" type="button">Save</button>
          </div>
        </div>
      `;

      // Different Page Link Action
      const sourceLink = li.querySelector('.source-link');
      if (sourceLink) {
        sourceLink.addEventListener('click', (e) => {
          e.preventDefault();
          chrome.tabs.create({ url: item.url });
        });
      }

      const editBtn = li.querySelector('.edit-btn');
      const translationInput = li.querySelector('.edit-translation');
      const urlInput = li.querySelector('.edit-url');
      const colorInput = li.querySelector('.edit-color');
      const useDefaultInput = li.querySelector('.edit-use-default');
      const paletteContainer = li.querySelector('.edit-palette');
      const cancelBtn = li.querySelector('.edit-cancel');
      const saveBtn = li.querySelector('.edit-save');

      function setPaletteSelection(selectedColor) {
        if (!paletteContainer) return;
        paletteContainer.querySelectorAll('.palette-swatch').forEach(swatch => {
          swatch.classList.toggle('is-selected', swatch.dataset.color === selectedColor);
        });
      }

      function renderPalette(selectedColor) {
        if (!paletteContainer) return;
        paletteContainer.innerHTML = '';
        if (!Array.isArray(colorPalette) || colorPalette.length === 0) {
          paletteContainer.style.display = 'none';
          return;
        }
        paletteContainer.style.display = 'flex';
        colorPalette.forEach(color => {
          const swatch = document.createElement('button');
          swatch.type = 'button';
          swatch.className = 'palette-swatch';
          swatch.dataset.color = color;
          swatch.style.backgroundColor = color;
          swatch.title = color;
          swatch.addEventListener('click', () => {
            useDefaultInput.checked = false;
            colorInput.disabled = false;
            colorInput.value = color;
            setPaletteSelection(color);
          });
          paletteContainer.appendChild(swatch);
        });
        setPaletteSelection(selectedColor);
      }

      function syncEditValues() {
        translationInput.value = item.translation || '';
        urlInput.value = item.url || '';
        const useDefault = !item.color;
        useDefaultInput.checked = useDefault;
        colorInput.value = item.color || themeColor;
        colorInput.disabled = useDefault;
        renderPalette(useDefault ? null : (item.color || themeColor));
      }

      function enterEditMode() {
        document.querySelectorAll('.word-item.is-editing').forEach(node => node.classList.remove('is-editing'));
        syncEditValues();
        li.classList.add('is-editing');
      }

      function exitEditMode() {
        li.classList.remove('is-editing');
      }

      if (editBtn) {
        editBtn.addEventListener('click', () => {
          enterEditMode();
        });
      }

      if (useDefaultInput) {
        useDefaultInput.addEventListener('change', () => {
          colorInput.disabled = useDefaultInput.checked;
          if (useDefaultInput.checked) {
            setPaletteSelection(null);
          } else {
            setPaletteSelection(colorInput.value);
          }
        });
      }

      if (colorInput) {
        colorInput.addEventListener('input', () => {
          useDefaultInput.checked = false;
          colorInput.disabled = false;
          setPaletteSelection(colorInput.value);
        });
      }

      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          exitEditMode();
        });
      }

      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const newTranslation = translationInput.value.trim();
          const newUrl = urlInput.value.trim();
          const newColor = useDefaultInput.checked ? null : colorInput.value;

          if (!newUrl) {
            alert('URL is required.');
            return;
          }

          updateWordEntry(item, {
            translation: newTranslation,
            color: newColor,
            url: newUrl
          });
        });
      }

      // Delete action
      const deleteBtn = li.querySelector('.delete-btn');
      deleteBtn.addEventListener('click', () => {
        deleteWord(item.word, item.url);
      });

      wordList.appendChild(li);
    });
  }

  function updateWordEntry(item, updates) {
    const originalUrl = item.url;
    const wordLower = (item.word || '').toLowerCase();
    const index = fullVocabulary.findIndex(v => (v.word || '').toLowerCase() === wordLower && v.url === item.url);
    if (index === -1) return;

    fullVocabulary[index].translation = updates.translation;
    fullVocabulary[index].color = updates.color;
    fullVocabulary[index].url = updates.url;

    chrome.storage.local.set({ vocabulary: fullVocabulary }, () => {
      loadWords();
      const shouldRefresh = originalUrl === currentUrl || updates.url === currentUrl;
      if (shouldRefresh) {
        refreshCurrentTabVocabulary();
      }
    });
  }

  function refreshCurrentTabVocabulary() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'refreshVocabulary'
        }).catch(() => {
          // Ignore tabs without content script
        });
      }
    });
  }

  function deleteWord(wordToDelete, urlOfWord) {
    // Remove specific entry (word + url)
    fullVocabulary = fullVocabulary.filter(item => !(item.word === wordToDelete && item.url === urlOfWord));

    chrome.storage.local.set({ vocabulary: fullVocabulary }, () => {
      // Re-render
      loadWords();

      // Notify content script ONLY if we deleted a word from the CURRENT page
      if (urlOfWord === currentUrl) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: "deleteWord",
              word: wordToDelete
            });
          }
        });
      }
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
