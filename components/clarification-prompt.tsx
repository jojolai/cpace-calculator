'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface ClarificationPromptProps {
  question: string;
  options?: string[];
  onAnswer: (answer: string) => void;
  isSubmitting: boolean;
}

export function ClarificationPrompt({
  question,
  options,
  onAnswer,
  isSubmitting,
}: ClarificationPromptProps) {
  const [customAnswer, setCustomAnswer] = useState('');

  const handleOptionClick = (option: string) => {
    onAnswer(option);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customAnswer.trim()) {
      onAnswer(customAnswer.trim());
    }
  };

  return (
    <Card className="border-primary/50 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          Question
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">{question}</p>

        {options && options.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {options.map((option, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleOptionClick(option)}
                disabled={isSubmitting}
              >
                {option}
              </Button>
            ))}
          </div>
        )}

        <form onSubmit={handleCustomSubmit} className="flex gap-2">
          <Input
            placeholder="Type your answer..."
            value={customAnswer}
            onChange={(e) => setCustomAnswer(e.target.value)}
            disabled={isSubmitting}
          />
          <Button type="submit" disabled={isSubmitting || !customAnswer.trim()}>
            {isSubmitting ? 'Sending...' : 'Send'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
