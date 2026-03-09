// background.js — jobApply Chrome Extension

// Make clicking the extension action icon toggle the side panel open/closed.
// Users can also close the panel using the X button inside the panel itself.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);
