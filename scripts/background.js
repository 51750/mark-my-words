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
  const sourceLang = 'auto';
  const targetLang = 'zh-CN'; // Default to Simplified Chinese as per user locale implication

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Translation API error: ${response.statusText}`);
    }
    const data = await response.json();

    // The structure returned by this unofficial API is a nested array.
    // data[0] contains the translation segments.
    // Each segment is also an array where index 0 is the translated text.
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
