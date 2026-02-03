// Content script

// console.log('Mark My Words Content Script Loaded');

let fab = null;
let popup = null;
let selectedText = '';
let selectionRange = null;
let pageVocabulary = [];
let observer = null;
let colorPalette = ['#10b981', '#f59e0b', '#ef4444'];

// Initialize styles and elements
function init() {
  chrome.storage.local.get(['disabledSites'], (result) => {
    const disabledSites = result.disabledSites || [];
    const currentHostname = window.location.hostname;

    if (disabledSites.includes(currentHostname)) {
      console.log('Mark My Words is disabled on this site.');
      return;
    }

    createFAB();
    loadSavedWords();
  });
}

function loadSavedWords() {
  chrome.storage.local.get(['vocabulary', 'themeColor', 'colorPalette'], (result) => {
    const vocabulary = result.vocabulary || [];
    const currentUrl = window.location.href;

    if (result.themeColor) {
      applyColor(result.themeColor);
      updateFabColor(result.themeColor);
    }
    if (result.colorPalette) {
      colorPalette = result.colorPalette;
      updateFabPalette();
    }

    // Filter words that match the current URL
    pageVocabulary = vocabulary.filter(v => v.url === currentUrl);

    if (pageVocabulary.length > 0) {
      // console.log('Loading words for this page:', pageVocabulary);
      highlightSavedWords(pageVocabulary);
    }
    setupObserver();
  });
}

function applyColor(color) {
  document.documentElement.style.setProperty('--vb-primary-color', color);
  // Optional: update hover color if needed, but the CSS uses it mostly for text/borders
}

let isProcessing = false;
let cachedRegex = null;
let lastVocabHash = '';

function getVocabHash(vocabulary) {
  // Simple hash to detect changes in vocabulary words
  return vocabulary.map(v => v.word).join('|');
}

function getVocabularyRegex(vocabulary) {
  const currentHash = getVocabHash(vocabulary);
  if (cachedRegex && currentHash === lastVocabHash) {
    return cachedRegex;
  }

  const validWords = vocabulary.filter(v => v.word && v.word.trim().length > 0);
  if (validWords.length === 0) {
    cachedRegex = null;
    lastVocabHash = currentHash;
    return null;
  }

  // Sort longest words first to ensure greedy matching
  const sortedWords = [...validWords].sort((a, b) => b.word.length - a.word.length);
  const pattern = sortedWords.map(v => v.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

  cachedRegex = new RegExp(`\\b(${pattern})\\b`, 'gi');
  lastVocabHash = currentHash;
  return cachedRegex;
}

function setupObserver() {
  if (observer) observer.disconnect();

  let timeout = null;
  let nodesToProcess = new Set();

  observer = new MutationObserver((mutations) => {
    if (isProcessing) return;

    let needsFullScan = false;

    mutations.forEach(mutation => {
      if (needsFullScan) return;

      const isOurElement = (node) =>
        node.nodeType === Node.ELEMENT_NODE &&
        (node.classList.contains('vb-wrap') || node.id === 'vb-fab' || node.id === 'vb-popup');

      // Ignore if mutation is caused by us
      if (isOurElement(mutation.target) || (mutation.target.closest && mutation.target.closest('.vb-wrap'))) {
        return;
      }

      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (!isOurElement(node)) {
            nodesToProcess.add(node);
          }
        });
      } else if (mutation.type === 'characterData') {
        nodesToProcess.add(mutation.target.parentElement);
      }
    });

    if (nodesToProcess.size > 0) {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (isProcessing || pageVocabulary.length === 0) return;

        const nodes = Array.from(nodesToProcess);
        nodesToProcess.clear();

        isProcessing = true;
        stopObserving();

        try {
          nodes.forEach(node => {
            if (document.body.contains(node)) {
              highlightSavedWords(pageVocabulary, node);
            }
          });
        } finally {
          isProcessing = false;
          startObserving();
        }
      }, 1000); // 1s debounce for stability
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function startObserving() {
  if (observer) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
}

function stopObserving() {
  if (observer) {
    observer.disconnect();
  }
}

function highlightSavedWords(vocabulary, rootNode = document.body) {
  const regex = getVocabularyRegex(vocabulary);
  if (!regex) return;

  // Use a temporary list to avoid modifying DOM while walking
  const textNodes = [];
  const walker = document.createTreeWalker(
    rootNode,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        const tagName = parent.tagName;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'CANVAS', 'VIDEO'].includes(tagName)) {
          return NodeFilter.FILTER_REJECT;
        }

        if (parent.isContentEditable || parent.closest('.vb-wrap')) {
          return NodeFilter.FILTER_REJECT;
        }

        // Potential conflict avoidance (e.g. Immersive Translate)
        if (parent.closest('.immersive-translate-target-wrapper') || parent.classList.contains('immersive-translate-state-translated')) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  let node;
  while (node = walker.nextNode()) {
    textNodes.push(node);
  }

  textNodes.forEach(textNode => {
    const text = textNode.nodeValue;
    if (!text) return;

    // Use split with capturing group for safe, non-recursive matching
    regex.lastIndex = 0;
    const parts = text.split(regex);
    if (parts.length <= 1) return;

    if (!textNode.parentNode) return;

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        // Even index: regular text
        if (parts[i]) {
          fragment.appendChild(document.createTextNode(parts[i]));
        }
      } else {
        // Odd index: matched word
        const foundWord = parts[i];
        const savedItem = vocabulary.find(v => v.word.toLowerCase() === foundWord.toLowerCase());

        const wrap = document.createElement('span');
        wrap.className = 'vb-wrap';

        const cap = document.createElement('span');
        cap.className = 'vb-def';
        cap.textContent = savedItem ? savedItem.translation : '...';

        const highlight = document.createElement('span');
        highlight.className = 'vb-highlight';
        highlight.textContent = foundWord;
        highlight.title = 'Click to remove';

        if (savedItem && savedItem.color) {
          highlight.style.borderBottomColor = savedItem.color;
          highlight.style.backgroundColor = `color-mix(in srgb, ${savedItem.color}, transparent 90%)`;
          cap.style.color = savedItem.color;
        }

        cap.style.pointerEvents = 'auto';
        cap.title = 'Click to edit';
        cap.addEventListener('click', (e) => {
          e.stopPropagation();
          const currentTrans = cap.textContent;
          const newTrans = prompt('Update translation:', currentTrans);
          if (newTrans !== null && newTrans !== currentTrans) {
            updateWordTranslation(foundWord, savedItem ? savedItem.url : window.location.href, newTrans);
          }
        });

        highlight.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Remove "${foundWord}" from vocabulary?`)) {
            deleteWord(foundWord, savedItem ? savedItem.url : window.location.href);
          }
        });

        wrap.appendChild(cap);
        wrap.appendChild(highlight);
        fragment.appendChild(wrap);
      }
    }

    try {
      if (textNode.parentNode) {
        textNode.parentNode.replaceChild(fragment, textNode);
      }
    } catch (e) {
      console.warn('Failed to replace text node:', e);
    }
  });
}

function updateFabColor(color) {
  const mainBtn = document.getElementById('vb-fab-main');
  if (mainBtn) {
    mainBtn.style.backgroundColor = color;
  }
}

function createFAB() {
  fab = document.createElement('div');
  fab.id = 'vb-fab-container';
  fab.style.position = 'absolute';
  fab.style.zIndex = '2147483647';
  fab.style.display = 'none';
  fab.style.alignItems = 'center';
  fab.style.gap = '6px';

  fab.innerHTML = `
    <button id="vb-fab-main" title="Mark it with default color">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      Mark it
    </button>
    <div id="vb-palette"></div>
  `;
  document.body.appendChild(fab);

  fab.querySelector('#vb-fab-main').addEventListener('click', (e) => handleFabClick(e, null));
  updateFabPalette();
}

function updateFabPalette() {
  const palette = fab.querySelector('#vb-palette');
  if (!palette) return;
  palette.innerHTML = '';
  if (colorPalette.length === 0) {
    palette.style.display = 'none';
    return;
  }
  palette.style.display = 'flex';
  colorPalette.forEach(color => {
    const dot = document.createElement('div');
    dot.className = 'vb-palette-dot';
    dot.style.backgroundColor = color;
    dot.title = `Mark with ${color}`;
    dot.addEventListener('click', (e) => handleFabClick(e, color));
    palette.appendChild(dot);
  });
}

function createPopup(translation) {
  // Deprecated in favor of inline translation bubble
}

async function handleFabClick(e, color) {
  if (!chrome.runtime?.id) {
    alert('Extension context invalidated. Please refresh the page.');
    return;
  }
  e.preventDefault();
  e.stopPropagation();

  hideFab(); // Hide button immediately

  if (!selectedText) return;

  try {
    // Check if auto-translate is enabled
    const settings = await chrome.storage.local.get(['autoTranslate']);
    const autoTranslate = settings.autoTranslate !== false; // Default to true

    let translatedText;

    if (autoTranslate) {
      // 1. Highlight immediately with pending state
      const wrapper = highlightSelection(selectionRange, null, color);

      try {
        // 2. Translate
        const response = await chrome.runtime.sendMessage({
          action: 'translate',
          text: selectedText
        });

        if (response.error || !response.translatedText) {
          throw new Error(response.error || 'No translation returned');
        }

        translatedText = response.translatedText;

        // 3. Update Highlight with Translation
        if (wrapper) {
          const cap = wrapper.querySelector('.vb-def');
          if (cap) {
            cap.textContent = translatedText;
            cap.classList.remove('vb-def-pending');
          }
        }
      } catch (transErr) {
        console.warn('Auto-translation failed:', transErr);

        // Update existing wrapper with failure state instead of thread-blocking prompt
        if (wrapper) {
          const cap = wrapper.querySelector('.vb-def');
          if (cap) {
            cap.textContent = 'Translation failed (click to edit)';
            cap.classList.remove('vb-def-pending');
            cap.style.color = '#ef4444'; // Red for error
          }
        }
      }
    } else {
      // Manual translation mode - prompt user for input
      translatedText = prompt(`Enter translation for "${selectedText}":`);

      if (!translatedText) {
        // User cancelled
        return;
      }

      // Highlight with user-provided translation
      highlightSelection(selectionRange, translatedText, color);
    }

    // 4. Save
    saveWord(selectedText, translatedText, color);

  } catch (err) {
    if (err.message.includes('context invalidated')) {
      alert('Extension was updated or reloaded. Please refresh this page to continue using Mark My Words.');
    } else {
      console.error('Error in handleFabClick:', err);
    }
  }
}

function saveWord(word, translation, color) {
  const newWord = {
    word: word,
    translation: translation,
    url: window.location.href, // Save the URL
    date: new Date().toISOString(),
    color: color // Can be null (uses theme color)
  };

  chrome.storage.local.get(['vocabulary'], (result) => {
    const vocabulary = result.vocabulary || [];

    if (!vocabulary.some(item => item.word.toLowerCase() === word.toLowerCase() && item.url === window.location.href)) {
      vocabulary.push(newWord);
      chrome.storage.local.set({ vocabulary }, () => {
        // console.log('Word saved:', newWord);
        pageVocabulary.push(newWord);
        // Highlight other occurrences on the page immediately
        highlightSavedWords([newWord]);
      });
    }
  });
}

function highlightSelection(range, translation, color) {
  if (!range) return;

  try {
    // Create the wrapper
    const wrap = document.createElement('span');
    wrap.className = 'vb-wrap';

    // Create the caption (translation)
    const cap = document.createElement('span');
    cap.className = 'vb-def';
    cap.textContent = translation || '...'; // Default or loading state
    if (!translation) cap.classList.add('vb-def-pending');

    // Create the highlight part
    const highlight = document.createElement('span');
    highlight.className = 'vb-highlight';
    highlight.textContent = range.toString();
    highlight.title = 'Click to remove';

    if (color) {
      highlight.style.borderBottomColor = color;
      highlight.style.backgroundColor = `color-mix(in srgb, ${color}, transparent 90%)`;
      cap.style.color = color;
    }

    // Add Edit Event to Caption
    cap.style.pointerEvents = 'auto';
    cap.title = 'Click to edit';
    cap.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentTrans = cap.textContent;
      const newTrans = prompt('Update translation:', currentTrans);
      if (newTrans !== null && newTrans !== currentTrans) {
        const word = highlight.textContent;
        updateWordTranslation(word, window.location.href, newTrans);
      }
    });

    // Add Delete Event (Fix for newly added words)
    highlight.addEventListener('click', (e) => {
      e.stopPropagation();
      const word = highlight.textContent;
      if (confirm(`Remove "${word}" from vocabulary?`)) {
        deleteWord(word, window.location.href);
      }
    });

    // Assemble
    wrap.appendChild(cap);
    wrap.appendChild(highlight);

    // Insert (Temporarily disable observer to avoid infinite loops)
    stopObserving();
    try {
      range.deleteContents();
      range.insertNode(wrap);
    } finally {
      startObserving();
    }

    // Restore selection or clear it
    window.getSelection().removeAllRanges();

    return wrap; // Return the wrapper for further updates if needed
  } catch (e) {
    console.warn('Could not highlight directly:', e);
  }
}

function deleteWord(word, url) {
  chrome.storage.local.get(['vocabulary'], (result) => {
    let vocabulary = result.vocabulary || [];
    // Filter out the word matching this URL
    const newVocabulary = vocabulary.filter(v => !(v.word.toLowerCase() === word.toLowerCase() && v.url === url));
    chrome.storage.local.set({ vocabulary: newVocabulary }, () => {
      // console.log('Word deleted:', word);
      pageVocabulary = pageVocabulary.filter(v => v.word.toLowerCase() !== word.toLowerCase());
      removeHighlights(word);
    });
  });
}

function undoHighlight(wrapper) {
  if (!wrapper || !wrapper.parentNode) return;
  const highlight = wrapper.querySelector('.vb-highlight');
  if (highlight) {
    const text = document.createTextNode(highlight.textContent);
    wrapper.parentNode.replaceChild(text, wrapper);
  } else {
    wrapper.remove();
  }
}

function updateWordTranslation(word, url, newTranslation) {
  chrome.storage.local.get(['vocabulary'], (result) => {
    const vocabulary = result.vocabulary || [];
    const index = vocabulary.findIndex(v => v.word.toLowerCase() === word.toLowerCase() && v.url === url);
    if (index !== -1) {
      vocabulary[index].translation = newTranslation;
      chrome.storage.local.set({ vocabulary }, () => {
        // console.log('Word updated:', word);
        // Update local cache
        const localIndex = pageVocabulary.findIndex(v => v.word.toLowerCase() === word.toLowerCase());
        if (localIndex !== -1) pageVocabulary[localIndex].translation = newTranslation;

        // Update UI
        updateHighlights(word, newTranslation);
      });
    }
  });
}

function updateHighlights(word, newTranslation) {
  const wrappers = document.querySelectorAll('.vb-wrap');
  wrappers.forEach(wrap => {
    const highlight = wrap.querySelector('.vb-highlight');
    if (highlight && highlight.textContent.toLowerCase() === word.toLowerCase()) {
      const cap = wrap.querySelector('.vb-def');
      if (cap) cap.textContent = newTranslation;
    }
  });
}

function showFab(selectionRect) {
  if (!fab || !selectionRect) return;

  fab.style.display = 'flex';
  const fabWidth = fab.offsetWidth || 200;
  const fabHeight = fab.offsetHeight || 30;

  // Calculate position: Centered above the selection
  let left = selectionRect.left + (selectionRect.width / 2) - (fabWidth / 2);
  let top = selectionRect.top - fabHeight - 8;

  if (left < 10) left = 10;
  if (left + fabWidth > window.innerWidth - 10) left = window.innerWidth - fabWidth - 10;

  if (top < 0) {
    top = selectionRect.bottom + 8;
  }

  fab.style.left = `${left + window.scrollX}px`;
  fab.style.top = `${top + window.scrollY}px`;
}

function hideFab() {
  if (fab) fab.style.display = 'none';
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'deleteWord') {
    removeHighlights(request.word);
    pageVocabulary = pageVocabulary.filter(v => v.word.toLowerCase() !== request.word.toLowerCase());
  } else if (request.action === 'updateColor') {
    applyColor(request.color);
    updateFabColor(request.color);
  } else if (request.action === 'updatePalette') {
    colorPalette = request.palette;
    updateFabPalette();
  } else if (request.action === 'toggleExtension') {
    if (request.disabled) {
      // Remove features
      hideFab();
      removeHighlightsFromPage();
      const container = document.getElementById('vb-fab-container');
      if (container) container.remove();
      fab = null;
      if (observer) observer.disconnect();
    } else {
      // Enable features
      if (!fab) {
        createFAB();
        loadSavedWords();
      }
    }
  }
});

function removeHighlights(word) {
  const wrappers = document.querySelectorAll('.vb-wrap');
  wrappers.forEach(wrap => {
    const highlight = wrap.querySelector('.vb-highlight');
    if (highlight && highlight.textContent.toLowerCase() === word.toLowerCase()) {
      const text = document.createTextNode(highlight.textContent);
      wrap.parentNode.replaceChild(text, wrap);
    }
  });
}

function removeHighlightsFromPage() {
  const wrappers = document.querySelectorAll('.vb-wrap');
  wrappers.forEach(wrap => {
    const highlight = wrap.querySelector('.vb-highlight');
    if (highlight) {
      const text = document.createTextNode(highlight.textContent);
      wrap.parentNode.replaceChild(text, wrap);
    }
  });
}

// Event Listeners for Selection
document.addEventListener('mouseup', (e) => {
  if (!chrome.runtime?.id) return;
  // If clicking on the FAB or popup, ignore
  if ((fab && fab.contains(e.target)) || (popup && popup.contains(e.target))) {
    return;
  }

  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    // Debug log removed or kept if users wants debug
    // console.log('Selection detected:', text); 

    // Relaxed Check: allow length > 0. Validating "is it a word" is hard, so let's be more permissive.
    // Limit to 30 words
    const wordCount = text.split(/\s+/).length;

    if (text.length > 0 && wordCount <= 30) {
      selectedText = text;
      selectionRange = selection.getRangeAt(0).cloneRange();
      const rect = selectionRange.getBoundingClientRect();
      showFab(rect);
    } else {
      hideFab();
      selectedText = '';
      selectionRange = null;
    }
  }, 10);
});

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

