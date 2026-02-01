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

function setupObserver() {
  if (observer) observer.disconnect();

  let timeout = null;
  observer = new MutationObserver((mutations) => {
    // Check if mutations are relevant
    const shouldUpdate = mutations.some(mutation => {
      // Ignore if the mutation target is inside a vb-wrap or is the popup/fab
      if (mutation.target && mutation.target.closest && (mutation.target.closest('.vb-wrap') || mutation.target.id === 'vb-fab' || mutation.target.id === 'vb-popup')) {
        return false;
      }
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check added nodes, ignore if they are our own
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node.classList && (node.classList.contains('vb-wrap') || node.id === 'vb-fab')) {
            return false;
          }
        }
      }
      return true;
    });

    if (shouldUpdate) {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (pageVocabulary.length > 0) highlightSavedWords(pageVocabulary);
      }, 500); // Debounce 500ms
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function highlightSavedWords(vocabulary) {
  // Create a regex from the vocabulary words
  const words = vocabulary.map(v => v.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (words.length === 0) return;

  // Match whole words only, case insensitive
  const regex = new RegExp(`\\b(${words.join('|')})\\b`, 'gi');

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  const nodesToReplace = [];

  let node;
  while (node = walker.nextNode()) {
    // Skip if inside existing highlight or scripts/styles
    if (node.parentElement.closest('.vb-wrap') ||
      node.parentElement.tagName === 'SCRIPT' ||
      node.parentElement.tagName === 'STYLE' ||
      node.parentElement.isContentEditable) {
      continue;
    }

    if (regex.test(node.nodeValue)) {
      nodesToReplace.push(node);
    }
    // Reset regex state since we just tested
    regex.lastIndex = 0;
  }

  // Replace nodes
  nodesToReplace.forEach(textNode => {
    // Verify it's still in the document
    if (!textNode.parentNode) return;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    regex.lastIndex = 0;
    let match;
    const text = textNode.nodeValue;

    while ((match = regex.exec(text)) !== null) {
      // Capture the word value for the closure
      const foundWord = match[0];

      // Append text before match
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
      }

      // Find translation
      const savedItem = vocabulary.find(v => v.word.toLowerCase() === foundWord.toLowerCase());
      const translation = savedItem ? savedItem.translation : '...';

      // Create the wrapper structure
      const wrap = document.createElement('span');
      wrap.className = 'vb-wrap';

      const cap = document.createElement('span');
      cap.className = 'vb-def';
      cap.textContent = translation;

      const highlight = document.createElement('span');
      highlight.className = 'vb-highlight';
      highlight.textContent = foundWord;
      highlight.title = 'Click to remove';

      // Apply specific color if saved
      if (savedItem && savedItem.color) {
        highlight.style.borderBottomColor = savedItem.color;
        highlight.style.backgroundColor = `color-mix(in srgb, ${savedItem.color}, transparent 90%)`;
        cap.style.color = savedItem.color;
      }

      // Add Edit Event to Caption
      cap.style.pointerEvents = 'auto'; // Ensure it's clickable
      cap.title = 'Click to edit';
      cap.addEventListener('click', (e) => {
        e.stopPropagation();
        const newTrans = prompt('Update translation:', translation);
        if (newTrans !== null && newTrans !== translation) {
          updateWordTranslation(foundWord, savedItem ? savedItem.url : window.location.href, newTrans);
        }
      });

      // Add Delete Event to Highlight
      highlight.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Remove "${foundWord}" from vocabulary?`)) {
          deleteWord(foundWord, savedItem ? savedItem.url : window.location.href);
        }
      });

      wrap.appendChild(cap);
      wrap.appendChild(highlight);
      fragment.appendChild(wrap);

      // Note: regex.lastIndex behaves weirdly with global flag in loop sometimes, but here we manually manage
      lastIndex = match.index + foundWord.length;
    }

    // Append remaining text
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
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

      // 2. Translate
      const response = await chrome.runtime.sendMessage({
        action: 'translate',
        text: selectedText
      });

      if (response.error) {
        console.error('Translation error:', response.error);
        if (wrapper) wrapper.remove(); // Undo highlight
        alert('Translation failed: ' + response.error);
        return;
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

    // Insert
    range.deleteContents();
    range.insertNode(wrap);

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

