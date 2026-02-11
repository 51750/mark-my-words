// Background script to handle translation requests

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    translateText(request.text)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Will respond asynchronously
  }
  if (request.action === 'speak') {
    getDictionaryPronunciation(request.text, request.lang)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

async function translateText(text) {
  // Get preferred source and target languages from storage
  const result = await chrome.storage.local.get(['sourceLanguage', 'targetLanguage']);
  const sourceLang = result.sourceLanguage || 'auto';
  const targetLang = result.targetLanguage || 'zh-CN';

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Translation API error: ${response.statusText}`);
    }
    const data = await response.json();

    // The structure returned by this unofficial API is a nested array.
    if (data && data[0]) {
      const translatedText = data[0].map(segment => segment[0]).join('');
      return { translatedText };
    } else {
      throw new Error('Invalid translation response format');
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Translation timed out');
      throw new Error('Translation request timed out. Please try again or enter manually.');
    }
    console.error('Translation failed:', error);
    throw error;
  }
}

async function getDictionaryPronunciation(text, lang) {
  const normalizedText = normalizeWord(text);
  if (!normalizedText) {
    throw new Error('No valid word for pronunciation');
  }

  const language = inferDictionaryLanguage(lang);
  const endpoint = `https://api.dictionaryapi.dev/api/v2/entries/${language}/${encodeURIComponent(normalizedText)}`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error('No pronunciation found');
  }

  const data = await response.json();
  const audioUrl = pickAudioUrl(data, lang);
  if (!audioUrl) {
    throw new Error('No audio pronunciation found');
  }

  return {
    audioUrl
  };
}

function normalizeWord(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return '';
  const word = trimmed.split(/\s+/)[0];
  return word.replace(/[.,/#!$%^&*;:{}=_`~()?"'[\]\\<>|+-]/g, '');
}

function inferDictionaryLanguage(lang) {
  const safeLang = (lang || '').toLowerCase();
  // dictionaryapi.dev pronunciation endpoint is most reliable for English.
  // fallback to en for non-English language codes.
  if (!safeLang || safeLang === 'auto' || safeLang.startsWith('en')) {
    return 'en';
  }
  return safeLang.split('-')[0] || 'en';
}

function pickAudioUrl(entries, lang) {
  if (!Array.isArray(entries)) return '';
  const safeLang = (lang || '').toLowerCase();
  const preferredRegion = safeLang.includes('-') ? safeLang.split('-')[1] : '';
  const audios = [];

  entries.forEach((entry) => {
    if (!entry || !Array.isArray(entry.phonetics)) return;
    entry.phonetics.forEach((phonetic) => {
      if (phonetic && typeof phonetic.audio === 'string' && phonetic.audio.trim()) {
        audios.push(phonetic.audio.trim());
      }
    });
  });

  if (audios.length === 0) return '';
  if (!preferredRegion) return audios[0];

  const match = audios.find((url) => url.toLowerCase().includes(`-${preferredRegion}`));
  return match || audios[0];
}
