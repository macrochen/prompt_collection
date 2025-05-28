document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const saveButton = document.getElementById('save-button');
  const statusDiv = document.getElementById('status');

  // Load API Key from storage when the options page opens
  chrome.storage.sync.get('geminiApiKey', (data) => {
    if (data.geminiApiKey) {
      apiKeyInput.value = data.geminiApiKey;
    }
  });

  // Save API Key to storage when the save button is clicked
  saveButton.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.storage.sync.set({ 'geminiApiKey': apiKey }, () => {
        statusDiv.textContent = 'API Key saved successfully!';
        statusDiv.className = 'success';
        setTimeout(() => {
          statusDiv.textContent = '';
        }, 2000);
      });
    } else {
      statusDiv.textContent = 'Please enter your API Key.';
      statusDiv.className = 'error';
    }
  });
});