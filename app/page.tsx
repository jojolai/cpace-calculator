'use client';

import { useState, useCallback } from 'react';
import { Leaf, RefreshCw } from 'lucide-react';
import { FileUpload } from '@/components/file-upload';
import { ChatInterface, Message } from '@/components/chat-interface';
import { ClarificationPrompt } from '@/components/clarification-prompt';
import { ResultsTable } from '@/components/results-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AnalysisResult, ClarificationQuestion } from '@/types';
import { generateId } from '@/lib/utils';

type AppState = 'upload' | 'analyzing' | 'question' | 'complete' | 'error';

export default function Home() {
  const [state, setState] = useState<AppState>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<ClarificationQuestion | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);

  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file);
    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Upload failed');
      }

      setAnalysisId(data.analysisId);
      startAnalysis(data.analysisId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file');
      setState('error');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const startAnalysis = useCallback(async (id: string, userResponse?: string) => {
    setState('analyzing');
    let hasReceivedResult = false;
    let hasReceivedQuestion = false;

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: id, userResponse }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Analysis request failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            if (!data) continue;

            try {
              const event = JSON.parse(data);
              console.log('Received event:', event);

              switch (event.type) {
                case 'message':
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: generateId(),
                      role: 'assistant',
                      content: event.content,
                    },
                  ]);
                  break;

                case 'tool_call':
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: generateId(),
                      role: 'tool',
                      content: event.content,
                      toolName: event.toolName,
                    },
                  ]);
                  break;

                case 'question':
                  setCurrentQuestion(event.question);
                  setState('question');
                  hasReceivedQuestion = true;
                  break;

                case 'result':
                  setResult(event.result);
                  setState('complete');
                  hasReceivedResult = true;
                  break;

                case 'error':
                  console.error('Agent error:', event.error);
                  setError(event.error);
                  setState('error');
                  break;

                case 'done':
                  // Only set to complete if we haven't received a result or question
                  if (!hasReceivedResult && !hasReceivedQuestion) {
                    // This means analysis ended without results - show error
                    setError('Analysis completed without results. Please try again.');
                    setState('error');
                  }
                  break;
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', data, parseError);
            }
          }
        }
      }

      // After stream ends, check if we're still in analyzing state
      // This means no result/question/error was received
      setState((currentState) => {
        if (currentState === 'analyzing') {
          setError('Analysis stream ended unexpectedly. Please check your OpenAI API key and try again.');
          return 'error';
        }
        return currentState;
      });
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setState('error');
    }
  }, []);

  const handleAnswer = useCallback(
    async (answer: string) => {
      if (!analysisId) return;

      setIsSubmittingAnswer(true);
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: 'user',
          content: answer,
        },
      ]);
      setCurrentQuestion(null);

      await startAnalysis(analysisId, answer);
      setIsSubmittingAnswer(false);
    },
    [analysisId, startAnalysis]
  );

  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setAnalysisId(null);
    setMessages([]);
    setCurrentQuestion(null);
    setResult(null);
    setError(null);
    setState('upload');
  }, []);

  const handleClearFile = useCallback(() => {
    setSelectedFile(null);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-green-100 rounded-full">
              <Leaf className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">CPACE Financing Calculator</h1>
          </div>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Upload your project cost breakdown to analyze which line items qualify for Commercial
            Property Assessed Clean Energy (CPACE) financing.
          </p>
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Upload Section */}
          {(state === 'upload' || state === 'error') && (
            <Card>
              <CardHeader>
                <CardTitle>Upload Your Excel File</CardTitle>
                <CardDescription>
                  Upload a spreadsheet containing your project&apos;s cost breakdown with line item
                  descriptions and amounts.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FileUpload
                  onFileSelect={handleFileSelect}
                  isUploading={isUploading}
                  selectedFile={selectedFile}
                  onClear={handleClearFile}
                />
                {error && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    <p className="font-medium">Error</p>
                    <p className="text-sm">{error}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Analysis in Progress */}
          {(state === 'analyzing' || state === 'question') && (
            <>
              <ChatInterface messages={messages} isLoading={state === 'analyzing'} />

              {state === 'question' && currentQuestion && (
                <ClarificationPrompt
                  question={currentQuestion.question}
                  options={currentQuestion.options}
                  onAnswer={handleAnswer}
                  isSubmitting={isSubmittingAnswer}
                />
              )}
            </>
          )}

          {/* Results */}
          {state === 'complete' && result && (
            <>
              <div className="flex justify-end">
                <Button variant="outline" onClick={handleReset}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Analyze Another File
                </Button>
              </div>
              <ResultsTable result={result} />
            </>
          )}
        </div>

        {/* Info Section */}
        {state === 'upload' && (
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">100% Eligible</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <ul className="space-y-1">
                  <li>HVAC Systems</li>
                  <li>Solar & Renewable Energy</li>
                  <li>LED Lighting</li>
                  <li>Building Envelope</li>
                  <li>Water Efficiency</li>
                  <li>EV Charging</li>
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Partially Eligible</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <ul className="space-y-1">
                  <li>General Electrical (50%)</li>
                  <li>Plumbing with efficient fixtures (75%)</li>
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Not Eligible</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <ul className="space-y-1">
                  <li>Furniture</li>
                  <li>Cosmetic Improvements</li>
                  <li>Landscaping</li>
                  <li>General Maintenance</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 text-center text-sm text-muted-foreground">
          <p>
            This tool provides estimates based on standard CPACE eligibility criteria. Actual
            eligibility may vary by jurisdiction and project specifics.
          </p>
        </footer>
      </div>
    </div>
  );
}
