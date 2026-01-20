'use client';

import { useRef, useEffect } from 'react';
import { Bot, User, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Message {
  id: string;
  role: 'assistant' | 'user' | 'tool';
  content: string;
  toolName?: string;
}

interface ChatInterfaceProps {
  messages: Message[];
  isLoading: boolean;
}

export function ChatInterface({ messages, isLoading }: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className="border rounded-lg bg-muted/30">
      <div className="p-4 border-b bg-muted/50">
        <h3 className="font-semibold flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Analysis Progress
        </h3>
      </div>
      <div className="max-h-[400px] overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'flex gap-3',
              message.role === 'user' && 'flex-row-reverse'
            )}
          >
            <div
              className={cn(
                'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                message.role === 'assistant' && 'bg-primary text-primary-foreground',
                message.role === 'user' && 'bg-secondary text-secondary-foreground',
                message.role === 'tool' && 'bg-muted text-muted-foreground'
              )}
            >
              {message.role === 'assistant' && <Bot className="h-4 w-4" />}
              {message.role === 'user' && <User className="h-4 w-4" />}
              {message.role === 'tool' && <Wrench className="h-4 w-4" />}
            </div>
            <div
              className={cn(
                'flex-1 rounded-lg p-3 max-w-[80%]',
                message.role === 'assistant' && 'bg-card',
                message.role === 'user' && 'bg-primary text-primary-foreground ml-auto',
                message.role === 'tool' && 'bg-muted text-sm italic'
              )}
            >
              {message.toolName && (
                <span className="text-xs text-muted-foreground block mb-1">
                  {message.toolName}
                </span>
              )}
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
              <Bot className="h-4 w-4" />
            </div>
            <div className="bg-card rounded-lg p-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
