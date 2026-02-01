// Background script to handle translation requests

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    translateText(request.text)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Will respond asynchronously
  }
});

async function translateText(text) {
  // Get preferred source and target languages from storage
  const result = await chrome.storage.local.get(['sourceLanguage', 'targetLanguage']);
  const sourceLang = result.sourceLanguage || 'auto';
  const targetLang = result.targetLanguage || 'zh-CN';

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(url);
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
    console.error('Translation failed:', error);
    throw error;
  }
}
