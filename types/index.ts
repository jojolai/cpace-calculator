// Excel data types
export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
  sampleRows: Record<string, unknown>[];
}

export interface ParsedWorkbook {
  id: string;
  filename: string;
  sheets: ParsedSheet[];
}

// PACE eligibility types
export type EligibilityCategory =
  | 'hvac'
  | 'solar_renewable'
  | 'lighting'
  | 'building_envelope'
  | 'water_efficiency'
  | 'ev_charging'
  | 'energy_storage'
  | 'electrical'
  | 'plumbing'
  | 'not_eligible';

export interface PaceEligibility {
  category: EligibilityCategory;
  percentage: number;
  description: string;
}

export interface LineItemAnalysis {
  rowIndex: number;
  description: string;
  originalAmount: number;
  eligibleAmount: number;
  eligibilityCategory: EligibilityCategory;
  eligibilityPercentage: number;
  reasoning: string;
}

export interface AnalysisResult {
  lineItems: LineItemAnalysis[];
  totalOriginal: number;
  totalEligible: number;
  summary: string;
}

// Chat/Agent types
export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user' | 'system';
  content: string;
  timestamp: Date;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  options?: string[];
  answered: boolean;
  answer?: string;
}

export interface AgentState {
  status: 'idle' | 'analyzing' | 'waiting_for_user' | 'complete' | 'error';
  messages: ChatMessage[];
  currentQuestion?: ClarificationQuestion;
  result?: AnalysisResult;
  error?: string;
}

// API types
export interface UploadResponse {
  success: boolean;
  workbook?: ParsedWorkbook;
  error?: string;
}

export interface AnalyzeRequest {
  workbookId: string;
  userResponse?: {
    questionId: string;
    answer: string;
  };
}

export interface AnalyzeStreamEvent {
  type: 'message' | 'question' | 'result' | 'error' | 'done';
  data: ChatMessage | ClarificationQuestion | AnalysisResult | { error: string } | null;
}
