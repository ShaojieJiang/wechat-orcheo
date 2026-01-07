// chat.ts
interface IMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// Orcheo API configuration
const API_CONFIG = {
  baseUrl: 'https://orcheo.ai-colleagues.com',
  workflowId: '5a573dd0-69dc-4cc9-94eb-78a1166dd4cc',
  domainKey: 'domain_pk_6954ef8b091c8190b0734f266b51edd00094f73ed7d04989',
  workflowName: 'Orcheo Bot',
};

Component({
  data: {
    messages: [] as IMessage[],
    inputValue: '',
    isLoading: false,
    scrollToView: '',
    threadId: '' as string,
    assistantMessage: '' as string, // For streaming response
    statusBarHeight: 0, // Height of status bar for safe area
    headerRightPadding: 0, // Right padding to avoid capsule button
    inputFocus: true, // Control input focus to keep keyboard visible
    keyboardHeight: 0, // Track keyboard height for manual positioning
  },

  lifetimes: {
    attached() {
      // Get system info for status bar height
      const systemInfo = wx.getSystemInfoSync();
      // Get menu button (capsule) position to avoid overlap
      const menuButtonInfo = wx.getMenuButtonBoundingClientRect();

      this.setData({
        statusBarHeight: systemInfo.statusBarHeight || 44,
        // Right padding to avoid the capsule button
        headerRightPadding: systemInfo.windowWidth - menuButtonInfo.left + 10,
      });

    },
  },

  methods: {
    // Generate unique ID for messages
    generateId(): string {
      return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    // Add a new message to the chat
    addMessage(role: 'user' | 'assistant', content: string) {
      const newMessage: IMessage = {
        id: this.generateId(),
        role,
        content,
        timestamp: Date.now(),
      };

      const messages = [...this.data.messages, newMessage];
      this.setData({
        messages,
        scrollToView: `msg-${newMessage.id}`,
      });

      return newMessage;
    },

    // Update the last assistant message (for streaming)
    updateLastAssistantMessage(content: string) {
      const messages = [...this.data.messages];
      const lastIndex = messages.length - 1;
      if (lastIndex >= 0 && messages[lastIndex].role === 'assistant') {
        messages[lastIndex].content = content;
        this.setData({
          messages,
          scrollToView: `msg-${messages[lastIndex].id}`,
        });
      }
    },

    // Handle input change
    onInputChange(e: WechatMiniprogram.Input) {
      this.setData({
        inputValue: e.detail.value,
      });
    },

    // Handle tap on messages area to hide keyboard
    onMessagesAreaTap() {
      this.setData({ inputFocus: false });
    },

    // Handle keyboard height change
    onKeyboardHeightChange(e: WechatMiniprogram.InputKeyboardHeightChange) {
      this.setData({ keyboardHeight: e.detail.height });
    },

    // Handle send message
    onSendMessage() {
      const content = this.data.inputValue.trim();
      if (!content || this.data.isLoading) return;

      // Add user message
      this.addMessage('user', content);

      // Clear input while keeping keyboard visible
      this.setData({
        inputValue: '',
        isLoading: true,
        inputFocus: true,
      });

      // Send to Orcheo API
      this.sendToOrcheo(content);
    },

    // Build ChatKit SDK request payload
    buildChatKitPayload(userMessage: string): Record<string, any> {
      // Build user message input in ChatKit format
      const userInput = {
        content: [
          {
            type: 'input_text',
            text: userMessage,
          },
        ],
        attachments: [],
        quoted_text: null,
        inference_options: {},
      };

      // If we have a thread_id, add message to existing thread
      // Otherwise, create a new thread
      if (this.data.threadId) {
        return {
          type: 'threads.add_user_message',
          params: {
            thread_id: this.data.threadId,
            input: userInput,
          },
          metadata: {
            workflow_id: API_CONFIG.workflowId,
            workflow_name: API_CONFIG.workflowName,
          },
          workflow_id: API_CONFIG.workflowId,
        };
      } else {
        return {
          type: 'threads.create',
          params: {
            input: userInput,
          },
          metadata: {
            workflow_id: API_CONFIG.workflowId,
            workflow_name: API_CONFIG.workflowName,
          },
          workflow_id: API_CONFIG.workflowId,
        };
      }
    },

    // Send message to Orcheo backend
    sendToOrcheo(userMessage: string) {
      const apiUrl = `${API_CONFIG.baseUrl}/api/chatkit`;

      // Build the request payload in ChatKit SDK format
      const payload = this.buildChatKitPayload(userMessage);

      console.log('Sending payload:', JSON.stringify(payload, null, 2));

      // Add placeholder for assistant response
      this.addMessage('assistant', '');

      wx.request({
        url: apiUrl,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          'X-Domain-Key': API_CONFIG.domainKey,
        },
        data: payload,
        success: (res: WechatMiniprogram.RequestSuccessCallbackResult) => {
          console.log('API response:', res);
          this.handleApiResponse(res);
        },
        fail: (err) => {
          console.error('API request failed:', err);
          this.updateLastAssistantMessage('Sorry, I encountered an error. Please try again.');
          this.setData({ isLoading: false });
        },
      });
    },

    // Handle API response (SSE format from ChatKit)
    handleApiResponse(res: WechatMiniprogram.RequestSuccessCallbackResult) {
      const data = res.data;

      if (res.statusCode === 200 && data) {
        // ChatKit returns SSE (Server-Sent Events) format
        // Parse the SSE data to extract thread_id and response text
        const { threadId, responseText } = this.parseSSEResponse(data);

        if (threadId) {
          this.setData({ threadId });
        }

        if (responseText) {
          this.updateLastAssistantMessage(responseText);
        } else {
          this.updateLastAssistantMessage('I received your message but couldn\'t generate a response.');
        }
      } else {
        console.error('API error:', res);
        const errorData = res.data as any;
        const errorMsg = errorData?.detail?.message || 'Sorry, something went wrong. Please try again.';
        this.updateLastAssistantMessage(errorMsg);
      }

      this.setData({ isLoading: false });
    },

    // Parse SSE (Server-Sent Events) response from ChatKit
    parseSSEResponse(data: any): { threadId: string; responseText: string } {
      let threadId = '';
      let responseText = '';

      // If data is a string, it's likely SSE format
      if (typeof data === 'string') {
        const lines = data.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const eventData = JSON.parse(line.substring(6));

              // Extract thread_id from thread.created event
              if (eventData.type === 'thread.created' && eventData.thread?.id) {
                threadId = eventData.thread.id;
              }

              // Extract text from thread.item.done event (assistant message)
              if (eventData.type === 'thread.item.done' && eventData.item) {
                const item = eventData.item;
                if (item.type === 'assistant_message' && item.content) {
                  for (const content of item.content) {
                    if (content.type === 'output_text' && content.text) {
                      responseText += content.text;
                    }
                  }
                }
              }

              // Also check thread.item.updated for streaming text
              if (eventData.type === 'thread.item.updated' && eventData.update) {
                const update = eventData.update;
                if (update.type === 'content_part_added' && update.part?.text) {
                  responseText += update.part.text;
                }
              }
            } catch (e) {
              // Skip malformed JSON lines
              console.log('Skipping malformed SSE line:', line);
            }
          }
        }
      } else if (typeof data === 'object') {
        // Handle JSON response (non-streaming)
        if (data.thread_id) {
          threadId = data.thread_id;
        }
        if (data.thread?.id) {
          threadId = data.thread.id;
        }
        responseText = this.extractResponseFromObject(data);
      }

      return { threadId, responseText };
    },

    // Extract response text from JSON object
    extractResponseFromObject(data: any): string {
      // Handle various response formats
      if (data.output) return data.output;
      if (data.response) return data.response;
      if (data.message && typeof data.message === 'string') return data.message;
      if (data.content && typeof data.content === 'string') return data.content;
      if (data.text) return data.text;

      // Handle ChatKit item format
      if (data.item?.content) {
        let text = '';
        for (const content of data.item.content) {
          if (content.type === 'output_text' && content.text) {
            text += content.text;
          }
        }
        if (text) return text;
      }

      // Handle choices format (OpenAI-style)
      if (data.choices?.[0]?.message?.content) {
        return data.choices[0].message.content;
      }

      return '';
    },

    // Handle keyboard confirm (enter key)
    onConfirm() {
      this.onSendMessage();
    },

    // Clear chat history
    clearChat() {
      wx.showModal({
        title: '清空对话',
        content: '确定要清空所有消息吗？',
        success: (res) => {
          if (res.confirm) {
            this.setData({
              messages: [],
              threadId: '', // Reset thread for new conversation
            });
          }
        },
      });
    },
  },
});
