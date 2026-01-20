# CPACE Financing Calculator

A web application that analyzes Excel files containing project cost breakdowns and estimates which line items qualify for Commercial Property Assessed Clean Energy (CPACE) financing.

## Features

- **Excel File Upload**: Drag & drop or browse to upload .xlsx/.xls files
- **AI-Powered Analysis**: Uses GPT-4 with function calling to understand and analyze spreadsheet structure
- **Smart Column Detection**: Automatically identifies description and amount columns
- **Clarifying Questions**: Agent asks for user input when spreadsheet structure is ambiguous
- **Line-by-Line Results**: Shows eligibility category, percentage, and reasoning for each item
- **Export to CSV**: Download analysis results for further use

## CPACE Eligibility Criteria

### 100% Eligible
- HVAC systems (heating, ventilation, air conditioning, chillers, boilers)
- Solar/Renewable energy (solar panels, wind, geothermal)
- LED lighting and lighting controls
- Building envelope (insulation, windows, roofing, doors)
- Water efficiency (low-flow fixtures, recycling systems)
- EV charging infrastructure
- Energy storage systems

### Partially Eligible
- General electrical work: 50%
- Plumbing (with water-efficient fixtures): 75%

### Not Eligible
- Furniture, cosmetic improvements
- Landscaping (non-irrigation)
- General maintenance and repairs

## Setup

### Prerequisites
- Node.js 18+
- OpenAI API key

### Installation

```bash
# Clone the repository
cd cpace-calculator

# Install dependencies
npm install

# Create environment file
cp .env.local.example .env.local

# Add your OpenAI API key to .env.local
# OPENAI_API_KEY=your-api-key-here

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Deployment to Vercel

1. Push this repository to GitHub
2. Go to [vercel.com](https://vercel.com) and import the repository
3. Add environment variable:
   - `OPENAI_API_KEY`: Your OpenAI API key
4. Deploy

## Project Structure

```
cpace-calculator/
├── app/
│   ├── api/
│   │   ├── upload/route.ts    # Excel file upload endpoint
│   │   └── analyze/route.ts   # AI analysis streaming endpoint
│   ├── layout.tsx
│   ├── page.tsx               # Main application page
│   └── globals.css
├── components/
│   ├── ui/                    # Base UI components
│   ├── file-upload.tsx        # File upload component
│   ├── chat-interface.tsx     # Agent message display
│   ├── clarification-prompt.tsx
│   └── results-table.tsx      # Results display
├── lib/
│   ├── excel-parser.ts        # xlsx parsing utilities
│   ├── openai-agent.ts        # AI agent with tools
│   ├── pace-criteria.ts       # Eligibility rules
│   └── utils.ts
└── types/
    └── index.ts
```

## How It Works

1. User uploads an Excel file containing project cost breakdown
2. The file is parsed and stored in memory
3. An AI agent is invoked with access to tools:
   - `get_sheet_names`: List available sheets
   - `get_sheet_structure`: View headers and sample rows
   - `get_column_data`: Inspect column values
   - `find_likely_columns`: Auto-detect relevant columns
   - `ask_user`: Request clarification from user
   - `analyze_line_items`: Classify items for PACE eligibility
   - `submit_results`: Finalize and return results
4. The agent explores the file structure and identifies the correct columns
5. If ambiguous, the agent asks the user for clarification
6. Each line item is classified against CPACE criteria
7. Results are displayed with eligibility breakdown

## License

MIT
