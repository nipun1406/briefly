// content.js — Briefly V2 content script
(function () {
  'use strict';
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'CONTENT_EXTRACT') {
      sendResponse({ text: extractText(), url: location.href, title: document.title });
    }
    return true;
  });

  function extractText() {
    const selectors = [
      '[data-automation="jobDescription"]', '.job-description', '#job-description',
      '[class*="jobDescription"]', '[class*="job-description"]', '.description__text',
      '[data-testid="job-description"]', '.jobs-description', '#jobDescriptionText',
      '.jobsearch-jobDescriptionText', '[class*="posting-description"]',
      '[class*="job-details"]', 'article', 'main',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 200) return el.innerText.trim().slice(0, 12000);
    }
    return document.body.innerText.trim().slice(0, 12000);
  }
})();
