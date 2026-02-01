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

  let fullVocabulary = []; // Store all data
  let currentUrl = '';
  // Default showAll to false (unchecked) -> Current Page only
  let showAll = false;

  // Load saved preferences
  chrome.storage.local.get(['sourceLanguage', 'targetLanguage', 'autoTranslate', 'themeColor'], (result) => {
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
      applyThemeToPopup(result.themeColor);
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

  function updateDisableBtnUI(isDisabled) {
    if (!disableSiteBtn) return;
    if (isDisabled) {
      disableSiteBtn.textContent = 'Enable';
      disableSiteBtn.classList.add('active');
    } else {
      disableSiteBtn.textContent = 'Disable';
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
        item.word.toLowerCase().includes(query) ||
        item.translation.includes(query)
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
        <button class="delete-btn" aria-label="Delete">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      `;

      // Different Page Link Action
      const sourceLink = li.querySelector('.source-link');
      if (sourceLink) {
        sourceLink.addEventListener('click', (e) => {
          e.preventDefault();
          chrome.tabs.create({ url: item.url });
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
