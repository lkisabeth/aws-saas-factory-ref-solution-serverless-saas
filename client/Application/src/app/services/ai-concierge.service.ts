import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

interface AIResponseBody {
  message: string;
  threadId?: string;
}

interface APIGatewayResponse {
  statusCode: number;
  body: string;
}

@Injectable({
  providedIn: 'root'
})
export class AIConciergeService {
  private baseUrl = `${localStorage.getItem('apiGatewayUrl')}/ai-concierge`;
  private currentThreadId: string | null = null;

  constructor(private http: HttpClient) {}

  sendMessage(message: string): Observable<AIResponseBody> {
    const payload = {
      message,
      threadId: this.currentThreadId
    };

    return this.http.post<APIGatewayResponse>(this.baseUrl, payload)
      .pipe(
        map(response => {
          if (!response.body) {
            throw new Error('Empty response body');
          }
          const parsed = typeof response.body === 'string' 
            ? JSON.parse(response.body) 
            : response.body;
          
          // Store the thread ID for subsequent messages
          if (parsed.threadId) {
            this.currentThreadId = parsed.threadId;
          }
          
          return parsed;
        }),
        catchError(error => {
          console.error('Error in AI service:', error);
          return throwError(() => new Error('Failed to get AI response'));
        })
      );
  }
}
