import { Component, OnInit } from '@angular/core';
import { AIConciergeService } from '../../services/ai-concierge.service';

@Component({
  selector: 'app-ai-concierge',
  templateUrl: './ai-concierge.component.html',
  styleUrls: ['./ai-concierge.component.scss']
})
export class AIConciergeComponent implements OnInit {
  messages: { role: string, content: string }[] = [];
  userInput: string = '';
  isLoading: boolean = false;
  isMinimized: boolean = false;

  constructor(private aiConciergeService: AIConciergeService) {}

  ngOnInit(): void {
    this.messages.push({
      role: 'assistant',
      content: "Hello! I'm your AI Concierge. How can I help you today?"
    });
  }

  async sendMessage() {
    if (this.userInput.trim() === '' || this.isLoading) return;

    const userMessage = this.userInput;
    this.messages.push({ role: 'user', content: userMessage });
    this.userInput = '';
    this.scrollToBottom();
    this.isLoading = true;

    try {
      const response = await this.aiConciergeService.sendMessage(userMessage).toPromise();
      this.messages.push({ 
        role: 'assistant', 
        content: response?.message ?? 'Sorry, I received an empty response.' 
      });
    } catch (error) {
      console.error('Error sending message:', error);
      this.messages.push({ 
        role: 'assistant', 
        content: 'Sorry, there was an error processing your request.' 
      });
    } finally {
      this.isLoading = false;
      this.scrollToBottom();
    }
  }

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
  }

  private scrollToBottom() {
    setTimeout(() => {
      const chatMessages = document.querySelector('.chat-messages');
      if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    });
  }
}
