// content.js — Injected into all pages for JD scraping and domain persistence

(function () {
  'use strict';

  // Check if we should auto-persist JD for this domain
  chrome.runtime.sendMessage({ type: 'GET_JD' }, (response) => {
    if (chrome.runtime.lastError) return;
    const jd = response?.jd;
    if (!jd) return;

    const currentDomain = window.location.hostname;
    // If stored JD is from same domain, it stays valid — nothing needed
    // This runs silently to confirm domain continuity
  });

  // Listen for scrape requests from the side panel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CONTENT_EXTRACT') {
      const text = extractText();
      sendResponse({ text, url: window.location.href, title: document.title });
    }
    return true;
  });

  function extractText() {
    const selectors = [
      '[data-automation="jobDescription"]',
      '.job-description',
      '#job-description',
      '[class*="jobDescription"]',
      '[class*="job-description"]',
      '.description__text',
      '[data-testid="job-description"]',
      '.jobs-description',
      '#jobDescriptionText',
      '.jobsearch-jobDescriptionText',
      '[class*="posting-description"]',
      '[class*="job-details"]',
      'article',
      'main',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 200) {
        return el.innerText.trim().slice(0, 12000);
      }
    }
    return document.body.innerText.trim().slice(0, 12000);
  }
})();
