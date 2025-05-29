// 全局变量声明 (如 currentChatArticle, chatHistory)
let currentChatArticle = null;
let chatHistory = [];


// 函数定义区域
// (确保 saveSettings 和 loadSettings 在这里定义)
async function saveSettings() {
  const apiKey = document.getElementById('geminiApiKey').value;
  const prompt = document.getElementById('summaryPrompt').value;

  if (apiKey) {
    await chrome.storage.local.set({ geminiApiKey: apiKey });
  }
  if (prompt) {
    await chrome.storage.local.set({ summaryPrompt: prompt });
  }
  alert('设置已保存！');
}

// 在文件开头添加默认提示词常量
const DEFAULT_SUMMARY_PROMPT = `# 任务目标
你需要扮演一个信息处理和总结助手。请根据我提供的JSON格式的文档，对每篇文章进行处理。

# 输入格式
我的文档结构是 JSON 格式，每篇文章是一个 JSON 对象，包含 \`title\` (文章标题)、\`url\` (文章链接) 和 \`content\` (文章主要内容) 这三个字段。你需要按顺序处理JSON中的每篇文章。

# 主要任务：文章总结与处理

请用简体中文大白话总结给定的内容。对于需要总结的文章（非软文、非内容无法总结的情况），你的总结应包含以下结构化信息，并确保整体风格口语化、忠于原文：

1.  **主要内容**：简明扼要地概括文章主要讲述的是什么事情、哪个领域或哪个主题。
2.  **核心观点**：清晰提炼文章最核心的论点、看法或结论，让人一眼看懂文章主要想表达什么。
3.  **关键细节**：列出支撑核心观点的关键信息点，如重要数据、人物观点、事件要素、具体案例的核心内容等。如果有多条，请分点列出。
4.  **深度解读**：基于原文信息，尝试点出观点背后的逻辑、潜在的假设、可能的引申、与其他信息的联系或对事物更深层次的理解。避免主观臆断和过度引申。

**其他要求：**

5.  **总结风格**：整体总结要像跟朋友聊天一样，自然口语化，避免生硬的书面语。
6.  **忠于原文**：所有部分的总结都必须严格忠于原文内容，不允许虚构或歪曲。
7.  **类型适配**：针对不同类型的文章（比如财经、健康、生活），在“核心观点”、“关键细节”和“深度解读”时，侧重点可以稍微调整（财经侧重数据趋势，健康侧重科学建议等），但都得保证通俗易懂和上述结构。
8.  **问句标题处理**：如果文章标题是疑问句（例如“未来十年，中国零售渠道会有哪些变化？”），请在“核心观点”部分直接、清晰地回答这个问题，并结合“主要内容”、“关键细节”和“深度解读”进行支撑。
9.  **软文识别与处理**：如果识别出文章主要目的是推广产品、课程或服务（即软文），请使用以下固定格式进行标注：\`[软文识别] 此内容可能为推广信息，核心价值较低。\` 无需进行结构化总结。
10. **内容无法总结处理**：如果文章 \`\` 字段为空、内容完全是乱码、或因内容过短/信息量过低而无法进行有意义的总结，请进行标注，例如：\`[内容无法总结] 原文内容不足或无法有效解析。\` 无需进行结构化总结。
11. **编号**：为每篇文章分配一个从1开始的顺序编号，方便后续提问。

# 输出格式示例

对于普通文章：

[1] 《文章标题示例》

**主要内容**：[这里概括文章主要讲述的对象和范围]

**核心观点**：[这里提炼文章最核心的论点或看法；若是问句标题，则在此处回答]

**关键细节**：
- [关键细节1，例如：具体数据、案例要素]
- [关键细节2，例如：重要人物的观点]
- （更多细节，视文章内容而定）

**深度解读**：[这里提供基于原文的深层分析、联系或引申]


对于软文：

[2] 《另一篇文章标题》
[软文识别] 此内容可能为推广信息，核心价值较低。


对于内容无法总结的文章：

[3] 《内容无法总结的文章标题》
[内容无法总结] 原文内容不足或无法有效解析。


`;

async function loadSettings() {
  const result = await chrome.storage.local.get(['geminiApiKey', 'summaryPrompt']);
  if (result.geminiApiKey) {
    document.getElementById('geminiApiKey').value = result.geminiApiKey;
  }
  // 如果没有保存的提示词，使用默认值
  document.getElementById('summaryPrompt').value = result.summaryPrompt || DEFAULT_SUMMARY_PROMPT;
  
}

// 添加恢复默认设置的函数
async function resetAllSettings() {
  document.getElementById('summaryPrompt').value = DEFAULT_SUMMARY_PROMPT;
  
  await chrome.storage.local.set({ 
    presetPrompts: DEFAULT_PRESET_PROMPTS,
  });
  
  loadPresetPrompts();
  
  alert('设置已恢复为默认值！');
}

// 加载文章列表
async function loadArticles() {
  const result = await chrome.storage.local.get(['articles', 'geminiApiKey', 'summaryPrompt']);
  const articles = result.articles || [];
  const apiKey = result.geminiApiKey;
  const summaryPrompt = result.summaryPrompt;
  const listElement = document.getElementById('articlesList');

  if (articles.length === 0) {
    listElement.innerHTML = '<p>暂无文章，请先通过插件抓取。</p>';
    return;
  }

  const local_result = await chrome.storage.local.get('latestSummary');
  if (local_result.latestSummary) {
    // 显示最新的总结
    updateArticleSummaries(local_result.latestSummary);
  }


  listElement.innerHTML = articles.map(article => `
    <div class="article-item collapsed">
      <div class="article-header">
        <input type="checkbox" class="article-checkbox" data-title="${article.title.replace(/"/g, '&quot;')}">
        <div class="title-container">
          <h3 class="article-title">
            <a href="${article.url}" target="_blank" title="${article.title}">${article.title}</a>
          </h3>
          <button class="chat-button" data-title="${article.title.replace(/"/g, '&quot;')}">对话</button>
        </div>
      </div>
    </div>
  `).join('');

  // 更新下拉列表
  const dropdown = document.getElementById('articleDropdown');
  dropdown.innerHTML = '<option value="">-- 选择文章开始对话 --</option>' + 
  articles.map(article => 
      `<option value="${article.title.replace(/"/g, '&quot;')}">${article.title}</option>`
    ).join('');
  
  // 添加下拉列表事件监听
  dropdown.addEventListener('change', function() {
    if (this.value) {
      startChatWithArticle(this.value);
    }
  });

  // 添加对话按钮的事件监听
  document.querySelectorAll('.chat-button').forEach(button => {
    button.addEventListener('click', function() {
      const title = this.dataset.title;
      // 设置下拉框选中该文章
      const dropdown = document.getElementById('articleDropdown');
      dropdown.value = title;
      // 开始对话
      startChatWithArticle(title);
    });
  });

  
}



function clearChatArea() {
  const chatHistoryElement = document.getElementById('chatHistory');
  
  chatHistoryElement.innerHTML = '';
  
  document.getElementById('chatInput').value = '';
  currentChatArticle = null;
  chatHistory = [];
}

// 开始与文章对话
async function startChatWithArticle(title) {
  const result = await chrome.storage.local.get('articles');
  const articles = result.articles || [];
  const article = articles.find(a => a.title === title);

  if (!article) {
    alert('未找到文章！');
    return;
  }

  // 清理聊天历史
  currentChatArticle = article;
  chatHistory = [];
  
  // 清理聊天界面
  const chatHistoryElement = document.getElementById('chatHistory');
  chatHistoryElement.innerHTML = '';
  
  // 聚焦到输入框
  document.getElementById('chatInput').focus();
}

// 发送聊天消息
async function sendChatMessage() {
  const inputElement = document.getElementById('chatInput');
  const messageText = inputElement.value.trim(); 

  if (!messageText) return;

  if (!currentChatArticle) {
    alert('请先从左侧选择一篇文章开始对话。');
    return;
  }

  const settings = await chrome.storage.local.get(['geminiApiKey']);
  const apiKey = settings.geminiApiKey;

  if (!apiKey) {
    alert('请先在设置中填写 Gemini API Key！');
    return;
  }

  appendMessageToChatHistory(messageText, 'user');
  inputElement.value = ''; // 清空输入框
  
  // 新增：清除所有预设提示词checkbox的选择状态
  const checkboxes = document.querySelectorAll('#presetPromptsContainer input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    checkbox.checked = false;
  });

  // 构建发送给 Gemini 的上下文
  // 可以包含之前的聊天记录和当前文章内容
  let conversationContext = `这是关于文章《${currentChatArticle.title}》的对话。文章URL: ${currentChatArticle.url}\n文章内容: ${currentChatArticle.textContent}\n\n`;
  
  // 添加最近的几条聊天记录到上下文中，以保持对话连贯性
  // Gemini API 对上下文长度有限制，这里简单取最后几条
  const recentHistory = chatHistory.slice(-5); // 取最近5条对话（用户+Gemini）
  recentHistory.forEach(msg => {
    conversationContext += `${msg.sender === 'user' ? '用户' : 'Gemini'}: ${msg.text}\n`;
  });
  conversationContext += `用户: ${messageText}\nGemini:`; // 提示模型继续回答


  // 3. 为 AI 的回复创建一个DOM占位符，并获取它
  // 传递一个空文本，让 appendMessageToChatHistory 创建结构
  const aiMessageElement = appendMessageToChatHistory("▌", 'gemini');
  // 初始时，让内容部分显示一个光标或者加载中的提示
  const aiMessageContentElement = aiMessageElement.querySelector('.message-content');
  if (aiMessageContentElement) {
      aiMessageContentElement.innerHTML = marked.parse("▌"); // 使用 marked.parse 来确保和后续更新一致
  }


  try {
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=${apiKey}&alt=sse`;
    const requestBody = {
      contents: [{ parts: [{ text: conversationContext }] }],
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
                const chatHistoryElement = document.getElementById('chatHistory');
                chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight;
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
        aiMessageElement.dataset.markdownContent = accumulatedMarkdown;
        // 滚动到 AI 回答的开头位置
        aiMessageElement.scrollIntoView({ behavior: 'smooth' });
    }


  } catch (error) {
    console.error('调用 Gemini API 进行流式对话失败:', error);
    // 更新AI消息占位符为错误信息
    if (aiMessageContentElement) {
      const tempDiv = document.createElement('div');
      tempDiv.textContent = `抱歉，与 Gemini 对话时发生错误: ${error.message}`;
      aiMessageContentElement.innerHTML = tempDiv.innerHTML.replace(/\n/g, '<br>');
    } else { // 如果aiMessageContentElement也找不到了，就用老方法追加错误
        appendMessageToChatHistory(`抱歉，与 Gemini 对话时发生错误: ${error.message}`, 'error');
    }
    // 存储错误信息到历史
    if (window.chatHistory) {
        window.chatHistory.push({ sender: 'error', text: `抱歉，与 Gemini 对话时发生错误: ${error.message}` });
    }
  }
}

/**
 * 将消息追加到聊天记录 (div#chatHistory) 中。
 * @param {string} text - 消息文本 (如果是AI消息，则为已转换为HTML的Markdown)
 * @param {string} sender - 发送者 ('user', 'gemini', 'system', 'error')
 */
function appendMessageToChatHistory(text, sender) {
  const chatHistoryElement = document.getElementById('chatHistory');

  // 创建消息元素
  const messageElement = document.createElement('div');
  messageElement.classList.add('chat-message', sender);

  const senderLabel = sender === 'user' ? '我' :
                     sender === 'gemini' ? 'AI' :
                     sender === 'system' ? '系统' : '错误';

  const senderContent = document.createElement('div');
  senderContent.classList.add('sender-content');
  
  // 为AI消息添加复制按钮
  if (sender === 'gemini') {
    const headerContainer = document.createElement('div');
    headerContainer.style.display = 'flex';
    headerContainer.style.justifyContent = 'space-between';
    headerContainer.style.alignItems = 'center';
    
    const senderLabel = document.createElement('strong');
    senderLabel.textContent = 'AI：';
    
    const copyButton = document.createElement('button');
    copyButton.textContent = '复制';
    copyButton.style.fontSize = '12px';
    copyButton.style.padding = '2px 8px';
    copyButton.style.marginLeft = '8px';
    
    // 存储原始的 Markdown 文本，用于复制
    messageElement.dataset.markdownContent = text;
    
    copyButton.addEventListener('click', () => {
      // 使用存储的原始 Markdown 文本进行复制
      navigator.clipboard.writeText(messageElement.dataset.markdownContent).then(() => {
        const originalText = copyButton.textContent;
        copyButton.textContent = '已复制！';
        setTimeout(() => {
          copyButton.textContent = originalText;
        }, 2000);
      });
    });
    
    headerContainer.appendChild(senderLabel);
    headerContainer.appendChild(copyButton);
    senderContent.appendChild(headerContainer);
  } else {
    senderContent.innerHTML = "<strong>" + senderLabel + "</strong>：";
  }
  
  messageElement.appendChild(senderContent);

  const messageContent = document.createElement('div');
  messageContent.classList.add('message-content');
  messageContent.innerHTML = marked.parse(text);
  messageElement.appendChild(messageContent);

  chatHistoryElement.appendChild(messageElement);
  
  if (sender === 'gemini') {
    // AI 回答完成后，自动滚动到该消息的开头位置
    messageElement.scrollIntoView({ behavior: 'smooth' });
  } else {
    // 其他消息保持原有的滚动到底部行为
    chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight;
  }

  return messageElement;
}

// 导出到 Google Drive (保持大部分不变，但确保文章数据是最新的)
async function exportToDrive() {
  try {
    // 创建并显示加载指示器
    const loadingElement = document.createElement('div');
    loadingElement.id = 'exportLoading';
    loadingElement.style.position = 'fixed';
    loadingElement.style.top = '50%';
    loadingElement.style.left = '50%';
    loadingElement.style.transform = 'translate(-50%, -50%)';
    loadingElement.style.padding = '20px';
    loadingElement.style.background = 'white';
    loadingElement.style.borderRadius = '5px';
    loadingElement.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
    loadingElement.style.zIndex = '1000';
    loadingElement.innerHTML = '<p>正在导出文章到Google Drive...</p><div class="loading-spinner"></div>';
    document.body.appendChild(loadingElement);

    const tokenObject = await chrome.identity.getAuthToken({ interactive: true });
    let accessToken = tokenObject?.token;
    if (!accessToken) {
      alert("获取 Access Token 失败，请重试。"); 
      loadingElement.remove();
      return;
    }

    const settings = await chrome.storage.local.get(['geminiApiKey', 'summaryPrompt']);
    const apiKey = settings.geminiApiKey;
    const summaryPrompt = settings.summaryPrompt;

    if (!apiKey || !summaryPrompt) {
      alert('请先在设置中填写 Gemini API Key 和总结提示词！');
      return;
    }

    const result = await chrome.storage.local.get('articles');
    const articles = result.articles || [];
    
    if (articles.length === 0) {
      alert('没有可导出的文章');
      return;
    }
    
    const folderId = await getOrCreateFolder(accessToken, 'gzh');
    
    const today = new Date();
    const formattedDate = `${(today.getMonth()+1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}${today.getHours().toString().padStart(2, '0')}${today.getMinutes().toString().padStart(2, '0')}${today.getSeconds().toString().padStart(2, '0')}`;
    const jsonData = articles.map(article => ({
      title: article.title,
      url: article.url,
      content: article.content,
    }));

    const fileContent = JSON.stringify(jsonData, null, 2);
    const metadata = {
        name: `文章汇总_${formattedDate}.json`,
        parents: [folderId],
        mimeType: 'application/json'
      };
    
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: createMultipartBodyWithFormData(metadata, fileContent)
    });
    
    if (response.ok) {
        alert('导出成功！');
      } else {
        let errorMessage = `上传失败: ${response.status} ${response.statusText}`;
        try {
          const errorJson = await response.json();
          errorMessage += ` - ${JSON.stringify(errorJson)}`;
        } catch (e) {
          const errorText = await response.text();
          errorMessage += ` - ${errorText}`;
        }
        throw new Error(errorMessage);
      }
  } catch (error) {
    console.error('导出失败:', error);
    alert('导出失败：' + (error.message || error));
  } finally {
    // 无论成功或失败，都移除加载指示器
    const loadingElement = document.getElementById('exportLoading');
    if (loadingElement) loadingElement.remove();
  }
}


// 获取或创建文件夹
async function getOrCreateFolder(token, folderName) {
  // 首先查找是否已存在同名文件夹
  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  
  const searchResult = await searchResponse.json();
  
  if (searchResult.files && searchResult.files.length > 0) {
    return searchResult.files[0].id;
  }
  
  // 如果不存在，创建新文件夹
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
  
  const folder = await createResponse.json();
  return folder.id;
}

function createMultipartBodyWithFormData(metadata, content) {
    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json; charset=UTF-8' }));
    formData.append('file', new Blob([content], { type: 'text/plain' }), 'content.txt'); // 文件名可以随意
    return formData;
  }
  

// 创建多部分请求体
function createMultipartBody(metadata, content) {
  const boundary = 'foo_bar_baz';
  const delimiter = '\r\n--' + boundary + '\r\n';
  const closeDelimiter = '\r\n--' + boundary + '--';
  
  const body = [
    delimiter,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    delimiter,
    'Content-Type: text/plain\r\n\r\n',
    content,
    closeDelimiter
  ].join('');
  
  return body;
}

// 绑定保存设置按钮事件
document.getElementById('saveSettings').addEventListener('click', saveSettings);
// 绑定导出按钮事件
document.getElementById('exportToDrive').addEventListener('click', exportToDrive);


function toggleSettings(header) {
  const section = header.closest('.settings-section');
  section.classList.toggle('collapsed');
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings(); // 先加载设置
  loadArticles(); // 然后加载文章，这样可以立即尝试生成总结
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('exportToDrive').addEventListener('click', exportToDrive);
  document.getElementById('sendChatMessage').addEventListener('click', sendChatMessage);
  
  document.getElementById('scrollToOperation').addEventListener('click', () => {
    const settingsSection = document.querySelector('.actions');
    if (settingsSection) {
      settingsSection.scrollIntoView({ behavior: 'smooth' });
    }
  });

  // 监听选中文本事件
  document.addEventListener('mouseup', function() {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText) {
      // 如果有选中的文本，就复制到剪贴板
      navigator.clipboard.writeText(selectedText).then(() => {
        // 可以添加一个临时的提示，显示复制成功
        const notification = document.createElement('div');
        notification.textContent = '已复制';
        notification.style.position = 'fixed';
        notification.style.left = '50%';
        notification.style.top = '50%';
        notification.style.transform = 'translate(-50%, -50%)';
        notification.style.padding = '8px 12px';
        notification.style.background = 'rgba(0, 0, 0, 0.7)';
        notification.style.color = 'white';
        notification.style.borderRadius = '4px';
        notification.style.fontSize = '14px';
        notification.style.zIndex = '9999';
        
        document.body.appendChild(notification);
        
        // 1秒后移除提示
        setTimeout(() => {
          notification.remove();
        }, 1000);
      });
    }
  });
  
  // 添加选择最后5篇文章的功能
  document.getElementById('selectLastFive').addEventListener('click', function() {
    // 先取消所有选中状态
    document.querySelectorAll('.article-checkbox').forEach(checkbox => {
      checkbox.checked = false;
    });
    
    // 获取所有文章的复选框
    const checkboxes = Array.from(document.querySelectorAll('.article-checkbox'));
    
    // 选中最后5篇文章
    checkboxes.slice(-5).forEach(checkbox => {
      checkbox.checked = true;
    });
  });

  document.getElementById('copyToClipboard').addEventListener('click', async function() {
    const checkboxes = document.querySelectorAll('.article-checkbox:checked');
    if (checkboxes.length === 0) {
      alert('请至少选择一篇文章');
      return;
    }

    try {
      const result = await chrome.storage.local.get('articles');
      const articles = result.articles || [];
      const selectedArticles = articles.filter(article => 
        Array.from(checkboxes).some(cb => cb.dataset.title === article.title)
      );

      const articlesJson = {
        timestamp: new Date().toISOString(),
        articles: selectedArticles.map(article => ({
          title: article.title,
          url: article.url,
          content: article.textContent,
        }))
      };

      await navigator.clipboard.writeText(JSON.stringify(articlesJson, null, 2));
      alert('已成功将选中的文章以JSON格式复制到剪贴板');
    } catch (error) {
      console.error('复制到剪贴板失败:', error);
      alert('复制到剪贴板失败，请重试');
    }
  });
  

  // 允许按 Enter 键发送消息
  document.getElementById('chatInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { // Shift+Enter 用于换行
      e.preventDefault(); // 阻止默认的 Enter 行为 (如换行)
      sendChatMessage();
    }
  });

  // 添加设置区域的折叠/展开功能
  const settingsHeader = document.querySelector('.settings-header');
  if (settingsHeader) {
    settingsHeader.addEventListener('click', function() {
      const section = this.closest('.settings-section');
      section.classList.toggle('collapsed');
    });
  }

  document.getElementById('summarizeSelected').addEventListener('click', summarizeSelectedArticles);


  // 绑定全选功能
  document.getElementById('selectAll').addEventListener('change', function(e) {
    const checkboxes = document.querySelectorAll('.article-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
  });

  // 绑定删除选中按钮
  document.getElementById('deleteSelected').addEventListener('click', deleteSelectedArticles);

  const presetSelect = document.getElementById('presetPromptsContainer');

  // 修改为监听 change 事件
  presetSelect.addEventListener('change', async function() {
    // 获取所有选中的 checkbox，但排除全选复选框
    const selectedCheckboxes = this.querySelectorAll('input[type="checkbox"]:checked:not(#select-all-presets)');
    
    // 获取 chatInput 元素
    const chatInput = document.getElementById('chatInput');
    
    // 如果选中的是展开[x]复选框
    if (selectedCheckboxes.length === 1 && selectedCheckboxes[0].id === "preset-展开[x]" ) {
      try {
        // 读取剪贴板内容
        const clipboardText = await navigator.clipboard.readText();
        // 组合提示词和剪贴板内容
        chatInput.value = `${selectedCheckboxes[0].value}${clipboardText}`;
      } catch (err) {
        // 如果无法访问剪贴板，则只使用提示词
        chatInput.value = `${selectedCheckboxes[0].value}`;
      }
    } else {
      // 将选中的值连接成字符串
      chatInput.value = Array.from(selectedCheckboxes).map(cb => cb.value).join('\n');
    }
    
    chatInput.focus();
  });


  // 添加恢复默认设置按钮的事件监听
  document.getElementById('resetAllSettings').addEventListener('click', resetAllSettings);


  // 加载预设提示词
  loadPresetPrompts();

  // 添加编辑预设提示词按钮事件监听
  document.getElementById('editPresetPrompts').addEventListener('click', editPresetPrompts);
  
  // 添加预设提示词选择事件
  document.querySelectorAll('#presetPrompts').forEach(selector => {
    selector.addEventListener('change', function() {
      if (this.value) {
        // 根据所在区域决定填充到哪个输入框
        if (this.closest('.chat-input')) {
          document.getElementById('chatInput').value = this.value;
        } else {
          document.getElementById('summaryPrompt').value = this.value;
        }
        this.value = ''; // 重置选择
      }
    });
  });
  
});

async function deleteSelectedArticles() {
  const checkboxes = document.querySelectorAll('.article-checkbox:checked');
  if (checkboxes.length === 0) {
    alert('请至少选择一篇文章');
    return;
  }

  if (!confirm('确定要删除选中的文章吗？')) {
    return;
  }

  const result = await chrome.storage.local.get('articles');
  let articles = result.articles || [];
  
  // 获取要删除的文章标题
  const titlesToDelete = Array.from(checkboxes).map(cb => cb.dataset.title);
  
  // 过滤掉要删除的文章
  articles = articles.filter(article => !titlesToDelete.includes(article.title));
  
  // 保存更新后的文章列表
  await chrome.storage.local.set({ articles });
  
  // 更新文章对话下拉列表
  const dropdown = document.getElementById('articleDropdown');
  dropdown.innerHTML = '<option value="">-- 选择文章开始对话 --</option>' + 
    articles.map(article => 
      `<option value="${article.title.replace(/"/g, '&quot;')}">${article.title}</option>`
    ).join('');
  
  // 如果当前正在对话的文章被删除，清理对话区域
  if (currentChatArticle && titlesToDelete.includes(currentChatArticle.title)) {
    clearChatArea();
  }
  
  // 重新加载文章列表
  loadArticles();
}

// 创建加载提示
function createLoadingIndicator() {
  const loadingElement = document.createElement('div');
  loadingElement.id = 'summaryLoading';
  loadingElement.style.position = 'fixed';
  loadingElement.style.top = '50%';
  loadingElement.style.left = '50%';
  loadingElement.style.transform = 'translate(-50%, -50%)';
  loadingElement.style.padding = '20px';
  loadingElement.style.background = 'white';
  loadingElement.style.borderRadius = '5px';
  loadingElement.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
  loadingElement.style.zIndex = '1000';
  loadingElement.innerHTML = '<p>正在批量总结中，请稍候...</p><div class="loading-spinner"></div>';
  document.body.appendChild(loadingElement);
  return loadingElement;
}

// 准备要总结的文章数据
function prepareSelectedArticles(checkboxes, articles) {
  return Array.from(checkboxes).map(checkbox => {
    const title = checkbox.dataset.title;
    const article = articles.find(a => a.title === title);
    return article ? { title: article.title, textContent: article.textContent } : null;
  }).filter(Boolean);
}

// 调用批量总结API
async function callBatchSummaryAPI(apiKey, summaryPrompt, selectedArticles) {
  const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const requestBody = {
    contents: [{
      parts: [{
        text: `请以Markdown格式返回以下内容的总结:\n\n${JSON.stringify(selectedArticles)}\n\n总结要求:${summaryPrompt}`
      }]
    }],
    // 可以添加 generationConfig 等参数控制输出
    generationConfig: {
      "temperature": 0.3,
      "topK": 30,
      "topP": 0.7,
      "maxOutputTokens": 500000
    }
  
  };

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/plain' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`API请求失败: ${response.status}`);
  }

  const data = await response.json();
  // 直接返回 API 响应的文本内容
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}


// 更新文章总结
async function updateArticleSummaries(summaries) {
  // 先移除旧的总结结果
  const oldSummary = document.querySelector('.summary-results');
  if (oldSummary) {
    oldSummary.remove();
  }

  // 创建总结结果显示区域
  const summaryResults = document.createElement('div');
  summaryResults.className = 'summary-results';
  summaryResults.innerHTML = '<h3>批量总结结果</h3>';

  // 预处理：提取真正的Markdown内容（处理有代码块和无代码块两种情况）
  let markdownContent = summaries;
  
  // 尝试匹配代码块格式
  const codeBlockMatch = summaries.match(/```markdown\n([\s\S]*?)\n```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    markdownContent = codeBlockMatch[1];
  }

  // 将 Markdown 转换为 HTML 并添加到结果区域
  const summaryContent = document.createElement('div');
  summaryContent.className = 'summary-content';
  
  // 先转换Markdown为HTML
  let processedHTML = marked.parse(markdownContent);
  
  // 获取当前选中的文章标题列表
  const result = await chrome.storage.local.get('articles');
  const articles = result.articles || [];
  
  // 遍历选中的文章标题，在总结内容中查找并添加链接和对话按钮
  for (const article of articles) {
    const title = article.title;
    const url = article.url;
    // 在处理后的HTML中查找标题
    const titleIndex = processedHTML.indexOf(title);
    if (titleIndex !== -1) {
      // 添加链接和对话按钮（如果还没有添加过）
      if (!processedHTML.slice(Math.max(0, titleIndex - 100), titleIndex).includes('chat-button')) {
        const buttonHTML = `<button class="chat-button" style="font-size: 10px; padding: 1px 6px; margin-left: 4px;" data-title="${title.replace(/"/g, '&quot;')}">对话</button>`;
        
        // 检查标题后面是否有书名号
        const endBracketIndex = processedHTML.indexOf('》', titleIndex + title.length);
        const insertButtonIndex = endBracketIndex !== -1 ? endBracketIndex + 1 : titleIndex + title.length;
        
        // 保持原有内容的顺序，只替换标题部分
        processedHTML = processedHTML.slice(0, titleIndex) + 
                       `<a href="${url}" target="_blank" title="${title}">${title}</a>` + 
                       processedHTML.slice(titleIndex + title.length, insertButtonIndex) + 
                       buttonHTML + 
                       processedHTML.slice(insertButtonIndex);
      }
    }
  }
  
  summaryContent.innerHTML = processedHTML;
  
  // 为新添加的对话按钮绑定事件监听器
  summaryContent.querySelectorAll('.chat-button').forEach(button => {
    button.addEventListener('click', function() {
      const title = this.dataset.title;
      // 设置下拉框选中该文章
      const dropdown = document.getElementById('articleDropdown');
      dropdown.value = title;
      // 开始对话
      startChatWithArticle(title);
    });
  });
  
  summaryResults.appendChild(summaryContent);

  // 将总结结果插入到操作按钮区域下方
  const buttonArea = document.querySelector('.actions'); // 修改为匹配实际的类名
  if (buttonArea) {
    buttonArea.insertAdjacentElement('afterend', summaryResults);
  } else {
    document.body.appendChild(summaryResults);
  }

  // 将总结内容保存到本地存储
  await chrome.storage.local.set({ latestSummary: summaries });
}

// 添加批量总结函数
async function summarizeSelectedArticles() {
  const checkboxes = document.querySelectorAll('.article-checkbox:checked');
  if (checkboxes.length === 0) {
    alert('请先选择要总结的文章');
    return;
  }

  const loadingElement = createLoadingIndicator();

  try {
    const settings = await chrome.storage.local.get(['geminiApiKey', 'summaryPrompt']);
    const apiKey = settings.geminiApiKey;
    const summaryPrompt = settings.summaryPrompt;
    // const summaryPrompt = `
    // 您将收到一个JSON数组，每个元素包含 "title" 和 "textContent" 字段。请为每篇文章生成总结，并返回一个严格符合以下格式的JSON数组，除了总结内容外，不要包含任何额外的文本或解释。

    // 要求：
    // 1.  输出必须是严格有效的JSON格式，结构与输入完全一致。
    // 2.  每篇文章的总结必须包含在 "content" 字段中。
    // 3.  总结语言为简体中文，使用口语化表达。
    // 4.  保留关键细节，总结长度控制在原文的 30% 以内。
    // 5.  对于软文，直接在 "content" 字段中标记为 "软文"。

    // 示例输入格式：
    // [{"title": "文章标题", "textContent": "文章内容..."}]

    // 示例输出格式：
    // [
    //   {"title": "文章标题1", "content": "总结内容1"},
    //   {"title": "文章标题2", "content": "总结内容2"},
    //   ...
    // ]

    // 总结内容要求：
    // -   快速提炼核心观点。
    // -   保留关键细节。
    // -   使用口语化表达。
    // -   根据文章类型调整总结侧重点。
    // -   对于疑问句标题，直接从文章内容中回答问题。
    // -   明确标注软文。
    // `;

    if (!apiKey || !summaryPrompt) {
      alert('请先在设置中填写 Gemini API Key 和总结提示词！');
      return;
    }

    const result = await chrome.storage.local.get('articles');
    const articles = result.articles || [];
    
    // 准备要总结的文章数据
    const selectedArticles = prepareSelectedArticles(checkboxes, articles);
    const summaries = await callBatchSummaryAPI(settings.geminiApiKey, settings.summaryPrompt, selectedArticles);
    
    await updateArticleSummaries(summaries);
    alert('批量总结完成！');
  } catch (error) {
    console.error('批量总结失败:', error);
    alert(`批量总结失败: ${error.message}`);
  } finally {
    document.body.removeChild(loadingElement);
  }
}


// 在文件开头添加预设提示词常量
const DEFAULT_PRESET_PROMPTS = [
  {
    name: "全文总结",
    prompt: `总结内容要求：
- 快速提炼核心观点
- 保留关键细节
- 口语化表达
- 根据文章类型调整侧重点
- 对疑问句标题直接回答`
  },
  {
    name: "批判性思考",
    prompt: `用最大白话、最容易懂的简体中文进行批判性思考。请尝试从下面几个方面帮我分析分析（挑你觉得最合适的几个方面说就行，不用每个都说）：

1.  **它到底在说啥？** (核心观点/主要信息是什么？)
2.  **这么说有啥依据吗？** (支撑它的理由或证据可靠吗？充分吗？)
3.  **有没有啥没明说但暗含的意思？** (背后可能藏着什么假设或前提？)
4.  **有没有别的看法或角度？** (换个角度看会怎么样？有没有不同的声音？)
5.  **可能会有啥好的或不好的影响？** (长远来看会怎么样？)
6.  **我们应该怎么更全面地看待这事儿/这个说法？**

请把你的分析一点一点说清楚，用简单的词，别整那些难懂的。 `
  },
  {
    name: "列出案例",
    prompt: "总结这篇文章中提到的案例或故事"
  },
  {
    name: "列出数据",
    prompt: "请从文章中提取所有数据点和统计信息，并按重要性排序。"
  },
  {
    name: "列出金句",
    prompt: "提取这篇文章中的金句或精彩观点"
  },
  {
    name: "新颖见解",
    prompt: "找出这篇文章中新颖或反直觉的观点"
  },
  {
    name: "科普[x]",
    prompt: "大白话科普一下"
  },
  {
    name: "展开[x]",
    prompt: "对以下内容请展开说说:\n"
  }
];

// 加载预设提示词到下拉菜单
async function loadPresetPrompts() {
  const result = await chrome.storage.local.get('presetPrompts');
  let presetPrompts = result.presetPrompts || DEFAULT_PRESET_PROMPTS;
  
  // 更新两个预设提示词下拉菜单
  const presetSelectors = document.querySelectorAll('#presetPromptsContainer');
  presetSelectors.forEach(container => {
    container.innerHTML = ''; // 清空容器
  
    // 创建标题
    const title = document.createElement('h4');
    title.textContent = '选择预设提示词：';
    container.appendChild(title);
  
    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'preset-items-container';
    container.appendChild(itemsContainer);

    // 创建全选复选框
    const selectAllWrapper = document.createElement('div');
    selectAllWrapper.className = 'preset-item';
    
    const selectAllCheckbox = document.createElement('input');
    selectAllCheckbox.type = 'checkbox';
    selectAllCheckbox.id = 'select-all-presets';
    
    const selectAllLabel = document.createElement('label');
    selectAllLabel.htmlFor = 'select-all-presets';
    selectAllLabel.textContent = '全选';
    
    // 添加全选复选框的事件监听器
    selectAllCheckbox.addEventListener('change', (e) => {
      const checkboxes = itemsContainer.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
        // 获取复选框的label文本
        const labelText = checkbox.parentElement?.textContent || '';
        // 如果文本中不包含[x]，则应用全选状态
        if (!labelText.includes('[x]')) {
          checkbox.checked = e.target.checked;
        }
      });
    });
    
    selectAllWrapper.appendChild(selectAllCheckbox);
    selectAllWrapper.appendChild(selectAllLabel);
    itemsContainer.appendChild(selectAllWrapper);

    // 创建checkbox列表
    presetPrompts.forEach(preset => {
      const wrapper = document.createElement('div');
      wrapper.className = 'preset-item';
    
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `preset-${preset.name}`;
      checkbox.value = preset.prompt;
    
      const label = document.createElement('label');
      label.htmlFor = `preset-${preset.name}`;
      label.textContent = preset.name;
    
      wrapper.appendChild(checkbox);
      wrapper.appendChild(label);
      itemsContainer.appendChild(wrapper);
    });
  });
}

// 编辑预设提示词功能
function editPresetPrompts() {
  // 获取当前预设提示词
  chrome.storage.local.get('presetPrompts', async (result) => {
    let presetPrompts = result.presetPrompts || DEFAULT_PRESET_PROMPTS;
    
    // 创建编辑对话框
    const dialog = document.createElement('div');
    dialog.className = 'preset-dialog';
    dialog.innerHTML = `
      <div class="preset-dialog-content">
        <h2>编辑预设提示词</h2>
        <div id="presetEntries"></div>
        <div class="preset-actions">
          <button id="addPreset">添加预设</button>
          <div class="preset-dialog-buttons">
            <button id="savePresets">保存</button>
            <button id="cancelEdit">取消</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    // 添加ESC键监听
    const handleEsc = (event) => {
      if (event.key === 'Escape') {
        closeDialog();
      }
    };
    document.addEventListener('keydown', handleEsc);
    
    // 关闭对话框函数
    function closeDialog() {
      document.removeEventListener('keydown', handleEsc);
      dialog.remove();
      style.remove();
    }
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      .preset-dialog {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
      }
      .preset-dialog-content {
        background: white;
        padding: 20px;
        border-radius: 8px;
        width: 80%;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
      }
      .preset-entry {
        margin-bottom: 15px;
        border-bottom: 1px solid #eee;
        padding-bottom: 15px;
      }
      .preset-entry input, .preset-entry textarea {
        width: 100%;
        margin-top: 5px;
        padding: 8px;
        box-sizing: border-box;
      }
      .preset-entry textarea {
        height: 100px;
      }
      .preset-actions {
        margin-top: 20px;
        display: flex;
        justify-content: space-between;
      }
      .preset-dialog-buttons {
        display: flex;
        gap: 10px;
      }
      .preset-entry-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .delete-preset {
        color: red;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
    
    // 渲染预设条目
    const presetEntriesContainer = document.getElementById('presetEntries');
    function renderPresetEntries() {
      presetEntriesContainer.innerHTML = '';
      
      // 使用数组的forEach来保持顺序
      presetPrompts.forEach(preset => {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'preset-entry';
        entryDiv.innerHTML = `
          <div class="preset-entry-header">
            <label>预设名称:</label>
            <span class="delete-preset" data-name="${preset.name}">删除</span>
          </div>
          <input type="text" class="preset-name" value="${preset.name}">
          <label>提示词内容:</label>
          <textarea class="preset-content">${preset.prompt}</textarea>
        `;
        presetEntriesContainer.appendChild(entryDiv);
      });
      
      // 添加删除事件监听
      document.querySelectorAll('.delete-preset').forEach(btn => {
        btn.addEventListener('click', function() {
          const nameToDelete = btn.getAttribute('data-name');
          presetPrompts = presetPrompts.filter(preset => preset.name !== nameToDelete);
          renderPresetEntries();
        });
      });
    }
    
    renderPresetEntries();
    
    // 添加新预设
    document.getElementById('addPreset').addEventListener('click', () => {
      const newName = `预设 ${presetPrompts.length + 1}`;
      // 添加到数组末尾
      presetPrompts.push({
        name: newName,
        prompt: "请输入提示词内容"
      });
      renderPresetEntries();
    });
    
    // 保存预设
    document.getElementById('savePresets').addEventListener('click', () => {
      const entries = document.querySelectorAll('.preset-entry');
      const newPresets = [];
      
      // 保持DOM中的顺序
      entries.forEach(entry => {
        const name = entry.querySelector('.preset-name').value.trim();
        const content = entry.querySelector('.preset-content').value.trim();
        
        if (name && content) {
          newPresets.push({
            name: name,
            prompt: content
          });
        }
      });
      
      chrome.storage.local.set({ presetPrompts: newPresets }, () => {
        loadPresetPrompts(); // 重新加载预设
        closeDialog();
        alert('预设提示词已保存！');
      });
    });
    
    // 取消编辑
    document.getElementById('cancelEdit').addEventListener('click', closeDialog);
  });
}
