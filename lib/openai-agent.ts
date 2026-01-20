import OpenAI from 'openai';
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import {
  ParsedWorkbook,
  LineItemAnalysis,
  AnalysisResult,
  ClarificationQuestion,
  EligibilityCategory,
} from '@/types';
import {
  getSheetNames,
  getSheetByName,
  getSheetStructure,
  getColumnData,
  findNumericColumns,
  findDescriptionColumns,
  findAmountColumns,
  isAggregateRow,
} from './excel-parser';
import { classifyLineItem, getEligibilityInfo, calculateEligibleAmount, PACE_ELIGIBILITY } from './pace-criteria';
import { generateId } from './utils';

// Lazy initialization of OpenAI client to avoid build-time errors
let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

// Tool definitions for the agent
const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_sheet_names',
      description: 'Get the names of all sheets in the uploaded Excel workbook',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_sheet_structure',
      description: 'Get the column headers and sample rows from a specific sheet to understand its structure',
      parameters: {
        type: 'object',
        properties: {
          sheet_name: {
            type: 'string',
            description: 'The name of the sheet to examine',
          },
        },
        required: ['sheet_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_column_data',
      description: 'Get all values from a specific column in a sheet',
      parameters: {
        type: 'object',
        properties: {
          sheet_name: {
            type: 'string',
            description: 'The name of the sheet',
          },
          column_name: {
            type: 'string',
            description: 'The name of the column to retrieve',
          },
        },
        required: ['sheet_name', 'column_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_likely_columns',
      description: 'Automatically detect columns that likely contain descriptions, amounts, and numeric values',
      parameters: {
        type: 'object',
        properties: {
          sheet_name: {
            type: 'string',
            description: 'The name of the sheet to analyze',
          },
        },
        required: ['sheet_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: 'Ask the user a clarifying question when you need more information to proceed. Use this when the Excel structure is ambiguous or you need user confirmation on which columns to use.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The question to ask the user',
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of choices for the user to select from',
          },
        },
        required: ['question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_line_items',
      description: 'Analyze and classify line items for PACE eligibility. Call this after you have identified the correct description and amount columns.',
      parameters: {
        type: 'object',
        properties: {
          sheet_name: {
            type: 'string',
            description: 'The name of the sheet containing the line items',
          },
          description_column: {
            type: 'string',
            description: 'The column containing item descriptions',
          },
          amount_column: {
            type: 'string',
            description: 'The column containing the total/amount values',
          },
        },
        required: ['sheet_name', 'description_column', 'amount_column'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_results',
      description: 'Submit the final analysis results. Call this when you have completed the analysis and want to present the results to the user.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'A brief summary of the analysis',
          },
        },
        required: ['summary'],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a CPACE (Commercial Property Assessed Clean Energy) financing analyst assistant. Your job is to analyze Excel files containing project cost breakdowns and determine which line items are eligible for PACE financing.

## CPACE Eligibility Criteria

The following categories are eligible for PACE financing:

**100% Eligible:**
- HVAC: Heating, ventilation, air conditioning systems, chillers, boilers, heat pumps
- Solar/Renewable: Solar panels, wind turbines, geothermal systems
- Lighting: LED lighting, lighting controls, energy-efficient fixtures
- Building Envelope: Insulation, windows, roofing, doors, air sealing
- Water Efficiency: Low-flow fixtures, water recycling, efficient irrigation
- EV Charging: Electric vehicle charging stations
- Energy Storage: Battery systems, thermal storage

**Partially Eligible:**
- General Electrical (50%): Wiring, panels, switchgear if supporting efficiency measures
- Plumbing (75%): If water-efficient fixtures are being installed

**Not Eligible:**
- Furniture, cosmetic improvements, landscaping (non-irrigation)
- General maintenance, repairs, cleaning
- Security systems, fire alarms (unless part of building automation)
- Elevators, kitchen equipment

## Your Process

1. First, explore the Excel file structure using the available tools
2. Identify which sheet contains the cost breakdown
3. Find the columns that contain:
   - Line item descriptions
   - Total amounts/costs
4. If the structure is ambiguous (multiple possible columns), ask the user for clarification
5. Once you have identified the correct columns, analyze each line item
6. Classify each item into the appropriate PACE category
7. Calculate the eligible amount based on the category percentage
8. Submit the final results

Be conversational and explain what you're doing as you work through the analysis.`;

// In-memory storage for analysis state
interface AnalysisState {
  workbook: ParsedWorkbook;
  messages: ChatCompletionMessageParam[];
  lineItems: LineItemAnalysis[];
  pendingQuestion: ClarificationQuestion | null;
}

const analysisStates = new Map<string, AnalysisState>();

export function initializeAnalysis(workbook: ParsedWorkbook): string {
  const analysisId = generateId();

  analysisStates.set(analysisId, {
    workbook,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }],
    lineItems: [],
    pendingQuestion: null,
  });

  return analysisId;
}

export function getAnalysisState(analysisId: string): AnalysisState | undefined {
  return analysisStates.get(analysisId);
}

// Tool handlers
function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  state: AnalysisState
): { result: string; question?: ClarificationQuestion; lineItems?: LineItemAnalysis[] } {
  const { workbook } = state;

  switch (toolName) {
    case 'get_sheet_names': {
      const names = getSheetNames(workbook);
      return { result: JSON.stringify({ sheets: names }) };
    }

    case 'get_sheet_structure': {
      const sheetName = args.sheet_name as string;
      const sheet = getSheetByName(workbook, sheetName);
      if (!sheet) {
        return { result: JSON.stringify({ error: `Sheet "${sheetName}" not found` }) };
      }
      const structure = getSheetStructure(sheet);
      return { result: JSON.stringify(structure) };
    }

    case 'get_column_data': {
      const sheetName = args.sheet_name as string;
      const columnName = args.column_name as string;
      const sheet = getSheetByName(workbook, sheetName);
      if (!sheet) {
        return { result: JSON.stringify({ error: `Sheet "${sheetName}" not found` }) };
      }
      const data = getColumnData(sheet, columnName);
      // Limit to first 20 values for context window
      return { result: JSON.stringify({ column: columnName, values: data.slice(0, 20), total_rows: data.length }) };
    }

    case 'find_likely_columns': {
      const sheetName = args.sheet_name as string;
      const sheet = getSheetByName(workbook, sheetName);
      if (!sheet) {
        return { result: JSON.stringify({ error: `Sheet "${sheetName}" not found` }) };
      }
      return {
        result: JSON.stringify({
          numeric_columns: findNumericColumns(sheet),
          description_columns: findDescriptionColumns(sheet),
          amount_columns: findAmountColumns(sheet),
        }),
      };
    }

    case 'ask_user': {
      const question: ClarificationQuestion = {
        id: generateId(),
        question: args.question as string,
        options: args.options as string[] | undefined,
        answered: false,
      };
      state.pendingQuestion = question;
      return { result: 'WAITING_FOR_USER', question };
    }

    case 'analyze_line_items': {
      const sheetName = args.sheet_name as string;
      const descCol = args.description_column as string;
      const amountCol = args.amount_column as string;

      const sheet = getSheetByName(workbook, sheetName);
      if (!sheet) {
        return { result: JSON.stringify({ error: `Sheet "${sheetName}" not found` }) };
      }

      const lineItems: LineItemAnalysis[] = [];
      let totalOriginal = 0;
      let totalEligible = 0;

      let skippedAggregates = 0;

      for (let i = 0; i < sheet.rows.length; i++) {
        const row = sheet.rows[i];
        const description = String(row[descCol] || '');
        const amount = Number(row[amountCol]) || 0;

        // Skip empty rows and zero amounts
        if (!description || amount === 0) continue;

        // Skip subtotal, total, and section header rows to avoid double-counting
        if (isAggregateRow(description)) {
          skippedAggregates++;
          console.log(`[Agent] Skipping aggregate row: "${description}" ($${amount.toLocaleString()})`);
          continue;
        }

        const classification = classifyLineItem(description);
        const eligibility = getEligibilityInfo(classification.category);
        const eligibleAmount = calculateEligibleAmount(amount, classification.category);

        lineItems.push({
          rowIndex: i,
          description,
          originalAmount: amount,
          eligibleAmount,
          eligibilityCategory: classification.category,
          eligibilityPercentage: eligibility.percentage,
          reasoning: eligibility.description,
        });

        totalOriginal += amount;
        totalEligible += eligibleAmount;
      }

      state.lineItems = lineItems;

      console.log(`[Agent] Analysis complete: ${lineItems.length} line items, ${skippedAggregates} aggregate rows skipped`);

      return {
        result: JSON.stringify({
          total_items: lineItems.length,
          skipped_aggregate_rows: skippedAggregates,
          total_original: totalOriginal,
          total_eligible: totalEligible,
          eligibility_breakdown: Object.fromEntries(
            Object.keys(PACE_ELIGIBILITY).map((cat) => [
              cat,
              lineItems.filter((li) => li.eligibilityCategory === cat).length,
            ])
          ),
        }),
        lineItems,
      };
    }

    case 'submit_results': {
      const summary = args.summary as string;
      const { lineItems } = state;

      const totalOriginal = lineItems.reduce((sum, li) => sum + li.originalAmount, 0);
      const totalEligible = lineItems.reduce((sum, li) => sum + li.eligibleAmount, 0);

      return {
        result: JSON.stringify({
          status: 'complete',
          summary,
          total_original: totalOriginal,
          total_eligible: totalEligible,
          total_items: lineItems.length,
        }),
      };
    }

    default:
      return { result: JSON.stringify({ error: `Unknown tool: ${toolName}` }) };
  }
}

export interface AgentStreamEvent {
  type: 'message' | 'tool_call' | 'question' | 'result' | 'done' | 'error';
  content?: string;
  toolName?: string;
  question?: ClarificationQuestion;
  result?: AnalysisResult;
  error?: string;
}

export async function* runAgentLoop(
  analysisId: string,
  userMessage?: string
): AsyncGenerator<AgentStreamEvent> {
  console.log('[Agent] Starting agent loop for analysis:', analysisId);

  const state = analysisStates.get(analysisId);
  if (!state) {
    console.error('[Agent] Analysis state not found for ID:', analysisId);
    yield { type: 'error', error: 'Analysis session not found' };
    return;
  }

  console.log('[Agent] Found state with workbook:', state.workbook.filename);

  // If there's a user message (response to question), add it
  if (userMessage) {
    state.messages.push({ role: 'user', content: userMessage });
    state.pendingQuestion = null;
  } else if (state.messages.length === 1) {
    // Initial message to start analysis
    state.messages.push({
      role: 'user',
      content: `Please analyze the uploaded Excel file "${state.workbook.filename}" and identify which line items are eligible for CPACE financing. Start by exploring the file structure.`,
    });
  }

  console.log('[Agent] Messages count:', state.messages.length);

  // Agent loop
  let continueLoop = true;
  let loopCount = 0;
  const maxLoops = 20; // Safety limit

  while (continueLoop && loopCount < maxLoops) {
    loopCount++;
    console.log('[Agent] Loop iteration:', loopCount);

    try {
      console.log('[Agent] Calling OpenAI API...');
      const response = await getOpenAI().chat.completions.create({
        model: 'gpt-5.2',
        messages: state.messages,
        tools,
        tool_choice: 'auto',
      });

      console.log('[Agent] OpenAI response received');
      const message = response.choices[0].message;
      console.log('[Agent] Message content:', message.content?.substring(0, 100));
      console.log('[Agent] Tool calls:', message.tool_calls?.length || 0);

      // Add assistant message to history
      state.messages.push(message);

      // Yield the text content if any
      if (message.content) {
        console.log('[Agent] Yielding message event');
        yield { type: 'message', content: message.content };
      }

      // Process tool calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);

          yield { type: 'tool_call', toolName, content: `Using tool: ${toolName}` };

          const { result, question, lineItems } = handleToolCall(toolName, args, state);

          // Add tool result to messages
          state.messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });

          // If asking user a question, pause the loop
          if (question) {
            yield { type: 'question', question };
            continueLoop = false;
            break;
          }

          // If submitting results, we're done
          if (toolName === 'submit_results') {
            const totalOriginal = state.lineItems.reduce((sum, li) => sum + li.originalAmount, 0);
            const totalEligible = state.lineItems.reduce((sum, li) => sum + li.eligibleAmount, 0);

            yield {
              type: 'result',
              result: {
                lineItems: state.lineItems,
                totalOriginal,
                totalEligible,
                summary: args.summary as string,
              },
            };
            yield { type: 'done' };
            continueLoop = false;
            break;
          }
        }
      } else {
        // No tool calls and we have content - check if we should continue or if we're waiting
        if (response.choices[0].finish_reason === 'stop') {
          // Model finished without submitting results - might need to prompt it
          if (state.lineItems.length > 0) {
            // Analysis was done, prompt to submit
            state.messages.push({
              role: 'user',
              content: 'Please submit the final results using the submit_results tool.',
            });
          } else {
            // Something went wrong
            yield { type: 'done' };
            continueLoop = false;
          }
        }
      }
    } catch (error) {
      console.error('[Agent] Error in loop:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Agent] Yielding error event:', errorMessage);
      yield { type: 'error', error: errorMessage };
      continueLoop = false;
    }
  }

  if (loopCount >= maxLoops) {
    console.warn('[Agent] Max loops reached, ending analysis');
    yield { type: 'error', error: 'Analysis took too long. Please try with a simpler file.' };
  }

  console.log('[Agent] Agent loop ended');
}

export function clearAnalysis(analysisId: string): void {
  analysisStates.delete(analysisId);
}
