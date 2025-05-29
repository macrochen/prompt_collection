
let storedPrompts = {}; // 将此行移动到文件顶部，或者至少在所有需要使用它的函数外部


// Function to save prompts to Chrome storage
function savePromptsToStorage() {
  chrome.storage.local.set({ prompts: storedPrompts });
}


// Update the prompt checkbox list
function updatePromptSelect() {
  const promptCheckboxList = document.getElementById('prompt-checkbox-list');
  const promptTooltip = document.getElementById('prompt-tooltip');
  const userInput = document.getElementById('user-input');
  promptCheckboxList.innerHTML = ''; // Clear existing list
  for (const name in storedPrompts) {
    const promptItemDiv = document.createElement('div');
    promptItemDiv.classList.add('prompt-item');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `prompt-${name}`;
    checkbox.value = name;
    checkbox.dataset.content = storedPrompts[name]; // Store content in a data attribute

    const label = document.createElement('label');
    label.htmlFor = `prompt-${name}`;
    label.textContent = name;

    // 新增编辑按钮
    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.classList.add('edit-prompt-button'); // 添加类名方便样式控制
    editButton.dataset.promptName = name; // 存储提示词名称

    promptItemDiv.appendChild(checkbox);
    promptItemDiv.appendChild(label);
    promptItemDiv.appendChild(editButton); // 将编辑按钮添加到条目中
    promptCheckboxList.appendChild(promptItemDiv);
  
    // Add event listeners for tooltip
    label.addEventListener('mouseover', (e) => {
      promptTooltip.textContent = checkbox.dataset.content;
      promptTooltip.style.left = `${e.pageX + 10}px`;
      promptTooltip.style.top = `${e.pageY + 10}px`;
      promptTooltip.classList.remove('hidden');
    });
  
    label.addEventListener('mouseout', () => {
      promptTooltip.classList.add('hidden');
    });
  }

  // 为所有编辑按钮添加事件监听器
  document.querySelectorAll('.edit-prompt-button').forEach(button => {
    button.addEventListener('click', (event) => {
      const promptName = event.target.dataset.promptName;
      const promptContent = storedPrompts[promptName];

      // 填充模态框
      document.getElementById('prompt-title').value = promptName;
      document.getElementById('prompt-content').value = promptContent;
      document.getElementById('new-prompt-modal').style.display = 'block';
      // 可以在这里添加一个隐藏字段来标记当前是编辑模式，并存储原始名称
      document.getElementById('prompt-title').dataset.originalName = promptName; 
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // 检查当前页面是否是作为扩展程序的弹出窗口加载的
  // 只有当点击扩展程序图标时，才会执行这里的逻辑
  if (window.location.search.includes('isPopup=true')) {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
    window.close(); // 关闭弹出窗口
    return; // 停止在弹出窗口中执行后续代码
  }

  const messagesDiv = document.getElementById('messages');
  const userInput = document.getElementById('user-input');
  const sendButton = document.getElementById('send-button');
  const promptFileInput = document.getElementById('prompt-file-input');
  const loadPromptsButton = document.getElementById('load-prompts-button');
  const promptCheckboxList = document.getElementById('prompt-checkbox-list');
  const clearPromptsButton = document.getElementById('clear-prompts-button');
  const copySelectedPromptsButton = document.getElementById('copy-selected-prompts-button'); // Add this line
  const copySuccessMessage = document.getElementById('copy-success-message');

  // Replace with your actual Gemini API Key
  // const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY'; 

  // Function to display messages in the chat interface
  function displayMessage(sender, message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    messageElement.innerHTML = marked.parse(message);
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Auto-scroll to the latest message
  }

  // Function to send message to Gemini API
  async function sendMessageToGemini(message) {
    displayMessage('user', message);
    userInput.value = ''; // Clear input after sending

    try {
      // Get API Key from Chrome storage
      chrome.storage.sync.get('geminiApiKey', async (data) => {
        const apiKey = data.geminiApiKey;
        if (!apiKey) {
          displayMessage('error', 'Error: Gemini API Key not set. Please set it in the extension options.');
          return;
        }

        // 3. 为 AI 的回复创建一个DOM占位符，并获取它
        // 传递一个空文本，让 appendMessageToChatHistory 创建结构
        const geminiMessageElement = document.createElement('div');
        geminiMessageElement.classList.add('message', 'gemini-message');
        messagesDiv.appendChild(geminiMessageElement);
        // 初始时，让内容部分显示一个光标或者加载中的提示
        const aiMessageContentElement = geminiMessageElement;
        if (aiMessageContentElement) {
            aiMessageContentElement.innerHTML = marked.parse("▌"); // 使用 marked.parse 来确保和后续更新一致
        }

        try {
          const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=${apiKey}&alt=sse`;
          const requestBody = {
            contents: [{ parts: [{ text: message }] }],
            generationConfig: {
              "temperature": 0.3,
              "topK": 30,
              "topP": 0.7,
              "maxOutputTokens": 50000
            }
          };

          const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini API error: ${errorData.error?.message || response.status}`);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let done = false;
          let accumulatedMarkdown = ""; // 用于累积AI回复的原始Markdown文本

          // 在开始接收流之前，清除占位符的初始内容 (比如光标)
          if (aiMessageContentElement) {
              aiMessageContentElement.innerHTML = '';
          }

          while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const jsonData = JSON.parse(line.substring(5));
                    if (jsonData.candidates?.[0]?.content?.parts?.[0]?.text) {
                      const textPart = jsonData.candidates[0].content.parts[0].text;
                      accumulatedMarkdown += textPart;

                      // 更新AI消息占位符的innerHTML
                      if (aiMessageContentElement) {
                        aiMessageContentElement.innerHTML = marked.parse(accumulatedMarkdown + "▌"); // 添加一个闪烁的光标效果
                      }
                      // 滚动到底部
                      messagesDiv.scrollTop = messagesDiv.scrollHeight;
                    }
                  } catch (e) {
                    // console.warn('Failed to parse JSON chunk or update UI:', line, e);
                  }
                }
              }
            }
          }

          // 流式结束后，移除末尾的光标，并更新最终的HTML
          if (aiMessageContentElement) {
              aiMessageContentElement.innerHTML = marked.parse(accumulatedMarkdown);
              // 更新存储的原始 Markdown 文本
              // aiMessageElement.dataset.markdownContent = accumulatedMarkdown; // 原始代码中这里有，但popup.js中没有aiMessageElement.dataset
              // 滚动到 AI 回答的开头位置
              geminiMessageElement.scrollIntoView({ behavior: 'smooth' });
          }


        } catch (error) {
          console.error('调用 Gemini API 进行流式对话失败:', error);
          // 更新AI消息占位符为错误信息
          if (aiMessageContentElement) {
            const tempDiv = document.createElement('div');
            tempDiv.textContent = `抱歉，与 Gemini 对话时发生错误: ${error.message}`;
            aiMessageContentElement.innerHTML = tempDiv.innerHTML.replace(/\n/g, '<br>');
          } else { // 如果aiMessageContentElement也找不到了，就用老方法追加错误
              displayMessage('system', `抱歉，与 Gemini 对话时发生错误: ${error.message}`);
          }
          // 存储错误信息到历史
          // if (window.chatHistory) { // 原始代码中这里有，但popup.js中没有window.chatHistory
          //     window.chatHistory.push({ sender: 'error', text: `抱歉，与 Gemini 对话时发生错误: ${error.message}` });
          // }
        }
      });
    } catch (error) {
      console.error('Error communicating with Gemini API:', error);
      displayMessage('error', 'Error: Could not connect to Gemini API.');
    }
  }

  // Event listener for send button
  sendButton.addEventListener('click', () => {
    const message = userInput.value.trim();
    if (message) {
      sendMessageToGemini(message);
    }
  });

  // Event listener for Enter key in input field
  userInput.addEventListener('keydown', (e) => {
    // Check for Shift + Enter for newline
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault(); // Prevent default Enter behavior
      const start = userInput.selectionStart;
      const end = userInput.selectionEnd;
      userInput.value = userInput.value.substring(0, start) + '\n' + userInput.value.substring(end);
      userInput.selectionStart = userInput.selectionEnd = start + 1;
    } else if (e.key === 'Enter') {
      e.preventDefault(); // Prevent default Enter behavior
      sendButton.click();
    }
  });

  // Load prompts from Chrome storage
  function loadPromptsFromStorage() {
    chrome.storage.local.get(['prompts'], (result) => {
      if (result.prompts) {
        storedPrompts = result.prompts;
        updatePromptSelect();
      }
    });
  }


  // Event listener for loading prompts from file
  loadPromptsButton.addEventListener('click', () => {
    const files = promptFileInput.files;
    if (files.length > 0) {
      let loadedCount = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target.result;
          const promptName = file.name.split('.').slice(0, -1).join('.');
          storedPrompts[promptName] = content;
          loadedCount++;
          if (loadedCount === files.length) {
            savePromptsToStorage();
            updatePromptSelect();
            alert(`${loadedCount} prompt(s) loaded successfully!`);
          }
        };
        reader.readAsText(file);
      }
    } else {
      alert('Please select one or more prompt files to load.');
    }
  });

  // Event listener for clearing all prompts
  clearPromptsButton.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all stored prompts?')) {
      storedPrompts = {};
      savePromptsToStorage();
      updatePromptSelect();
      alert('All prompts cleared.');
    }
  });

  // Event listener for copying selected prompts
  copySelectedPromptsButton.addEventListener('click', () => {
    const selectedCheckboxes = promptCheckboxList.querySelectorAll('input[type="checkbox"]:checked');
    let combinedPrompts = '';

    if (selectedCheckboxes.length === 0) {
      alert('Please select at least one prompt to copy.');
      return;
    }

    selectedCheckboxes.forEach(checkbox => {
      const promptName = checkbox.value;
      if (storedPrompts[promptName]) {
        combinedPrompts += storedPrompts[promptName] + '\n\n'; // Add content and a separator
      }
    });

    // Remove trailing newlines
    combinedPrompts = combinedPrompts.trim();

    navigator.clipboard.writeText(combinedPrompts)
      .then(() => {
        const originalText = copySelectedPromptsButton.textContent;
        const originalBackgroundColor = copySelectedPromptsButton.style.backgroundColor;
        copySelectedPromptsButton.textContent = 'Copied!';
        copySelectedPromptsButton.style.backgroundColor = '#28a745'; // Green for success

        setTimeout(() => {
          copySelectedPromptsButton.textContent = originalText;
          copySelectedPromptsButton.style.backgroundColor = originalBackgroundColor;
        }, 1500); // Display "Copied!" for 1.5 seconds

        // Optionally uncheck all after copying
        selectedCheckboxes.forEach(checkbox => {
          checkbox.checked = false;
        });
      })
      .catch(err => {
        console.error('Failed to copy prompts: ', err);
        alert('Failed to copy selected prompt(s) to clipboard.');
      });
  });

  // Initial load of prompts when popup opens
  loadPromptsFromStorage();
});


  const newPromptButton = document.getElementById('new-prompt-button');
  const newPromptModal = document.getElementById('new-prompt-modal');
  const closeButton = newPromptModal.querySelector('.close-button');
  const savePromptButton = document.getElementById('save-prompt-button');
  const resetPromptButton = document.getElementById('reset-prompt-button');
  const cancelPromptButton = document.getElementById('cancel-prompt-button');
  const promptTitleInput = document.getElementById('prompt-title');
  const promptContentTextarea = document.getElementById('prompt-content');

  // Show new prompt modal
  newPromptButton.addEventListener('click', () => {
    newPromptModal.style.display = 'block';
    promptTitleInput.value = ''; // Clear previous input
    promptContentTextarea.value = ''; // Clear previous input
  });

  // Hide modal when close button is clicked
  closeButton.addEventListener('click', () => {
    newPromptModal.style.display = 'none';
  });

  // Hide modal when clicking outside of it
  window.addEventListener('click', (event) => {
    if (event.target == newPromptModal) {
      newPromptModal.style.display = 'none';
    }
  });

  // Add keyboard event listener for Escape key
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && newPromptModal.style.display === 'block') {
      newPromptModal.style.display = 'none';
    }
  });

  // Save prompt logic
  savePromptButton.addEventListener('click', () => {
    const title = promptTitleInput.value.trim();
    const content = promptContentTextarea.value.trim();
    const originalName = promptTitleInput.dataset.originalName; // 获取原始名称

    if (title && content) {
      if (originalName && originalName !== title) {
        // 如果名称改变了，删除旧的提示词
        delete storedPrompts[originalName];
      }
      storedPrompts[title] = content;
      savePromptsToStorage();
      updatePromptSelect();
      newPromptModal.style.display = 'none';
      promptTitleInput.dataset.originalName = ''; // 清除标记
    } else {
      alert('Prompt title and content cannot be empty.');
    }
  });

  // Reset prompt form
  resetPromptButton.addEventListener('click', () => {
    promptTitleInput.value = '';
    promptContentTextarea.value = '';
  });

  // Cancel prompt creation
  cancelPromptButton.addEventListener('click', () => {
    newPromptModal.style.display = 'none';
  });