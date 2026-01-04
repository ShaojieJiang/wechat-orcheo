// chat.ts
interface IMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

Component({
  data: {
    messages: [] as IMessage[],
    inputValue: '',
    isLoading: false,
    scrollToView: '',
  },

  lifetimes: {
    attached() {
      // Add welcome message
      this.addMessage('assistant', 'Hello! How can I help you today?');
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

    // Handle input change
    onInputChange(e: WechatMiniprogram.Input) {
      this.setData({
        inputValue: e.detail.value,
      });
    },

    // Handle send message
    onSendMessage() {
      const content = this.data.inputValue.trim();
      if (!content || this.data.isLoading) return;

      // Add user message
      this.addMessage('user', content);

      // Clear input
      this.setData({
        inputValue: '',
        isLoading: true,
      });

      // Simulate AI response (replace with actual API call)
      this.simulateResponse(content);
    },

    // Simulate AI response - replace this with actual API integration
    simulateResponse(userMessage: string) {
      // Simulated delay for demo purposes
      setTimeout(() => {
        const responses = [
          "I understand you're asking about that. Let me help you with more information.",
          "That's a great question! Here's what I can tell you...",
          "I'd be happy to assist you with that. Based on what you've shared...",
          "Thanks for your message. Here's my response to your query.",
        ];

        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        this.addMessage('assistant', `${randomResponse}\n\nYou said: "${userMessage}"`);

        this.setData({
          isLoading: false,
        });
      }, 1000);
    },

    // Handle keyboard confirm (enter key)
    onConfirm() {
      this.onSendMessage();
    },

    // Clear chat history
    clearChat() {
      wx.showModal({
        title: 'Clear Chat',
        content: 'Are you sure you want to clear all messages?',
        success: (res) => {
          if (res.confirm) {
            this.setData({
              messages: [],
            });
            this.addMessage('assistant', 'Chat cleared. How can I help you?');
          }
        },
      });
    },
  },
});
