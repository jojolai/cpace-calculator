'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { formatCurrency, formatPercentage, cn } from '@/lib/utils';
import { AnalysisResult, LineItemAnalysis, EligibilityCategory } from '@/types';

interface ResultsTableProps {
  result: AnalysisResult;
}

const categoryColors: Record<EligibilityCategory, string> = {
  hvac: 'bg-blue-500',
  solar_renewable: 'bg-yellow-500',
  lighting: 'bg-amber-500',
  building_envelope: 'bg-green-500',
  water_efficiency: 'bg-cyan-500',
  ev_charging: 'bg-purple-500',
  energy_storage: 'bg-indigo-500',
  electrical: 'bg-orange-500',
  plumbing: 'bg-teal-500',
  not_eligible: 'bg-gray-500',
};

const categoryLabels: Record<EligibilityCategory, string> = {
  hvac: 'HVAC',
  solar_renewable: 'Solar/Renewable',
  lighting: 'Lighting',
  building_envelope: 'Building Envelope',
  water_efficiency: 'Water Efficiency',
  ev_charging: 'EV Charging',
  energy_storage: 'Energy Storage',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  not_eligible: 'Not Eligible',
};

function CategoryBadge({ category }: { category: EligibilityCategory }) {
  return (
    <Badge className={cn('text-white', categoryColors[category])}>
      {categoryLabels[category]}
    </Badge>
  );
}

export function ResultsTable({ result }: ResultsTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<'original' | 'amount' | 'eligible' | 'category'>('original');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const toggleRow = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const sortedItems = [...result.lineItems].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'original':
        // Preserve original row order from spreadsheet
        comparison = a.rowIndex - b.rowIndex;
        break;
      case 'amount':
        comparison = a.originalAmount - b.originalAmount;
        break;
      case 'eligible':
        comparison = a.eligibleAmount - b.eligibleAmount;
        break;
      case 'category':
        comparison = a.eligibilityCategory.localeCompare(b.eligibilityCategory);
        break;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const handleSort = (column: 'original' | 'amount' | 'eligible' | 'category') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder(column === 'original' ? 'asc' : 'desc');
    }
  };

  const exportToCSV = () => {
    const headers = ['Description', 'Original Amount', 'Eligible Amount', 'Category', 'Percentage', 'Reasoning'];
    const rows = result.lineItems.map((item) => [
      item.description,
      item.originalAmount,
      item.eligibleAmount,
      categoryLabels[item.eligibilityCategory],
      formatPercentage(item.eligibilityPercentage),
      item.reasoning,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
      '',
      `Total Original,${result.totalOriginal}`,
      `Total Eligible,${result.totalEligible}`,
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pace-analysis.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Calculate category breakdown
  const categoryBreakdown = result.lineItems.reduce(
    (acc, item) => {
      if (!acc[item.eligibilityCategory]) {
        acc[item.eligibilityCategory] = { count: 0, total: 0, eligible: 0 };
      }
      acc[item.eligibilityCategory].count++;
      acc[item.eligibilityCategory].total += item.originalAmount;
      acc[item.eligibilityCategory].eligible += item.eligibleAmount;
      return acc;
    },
    {} as Record<EligibilityCategory, { count: number; total: number; eligible: number }>
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Project Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(result.totalOriginal)}</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700">
              PACE Eligible Amount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-700">
              {formatCurrency(result.totalEligible)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Eligibility Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatPercentage(result.totalEligible / result.totalOriginal)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Category Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.entries(categoryBreakdown).map(([category, data]) => (
              <div
                key={category}
                className="p-3 rounded-lg bg-muted/50 text-center"
              >
                <CategoryBadge category={category as EligibilityCategory} />
                <p className="text-lg font-semibold mt-2">{data.count} items</p>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(data.eligible)} eligible
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Line Items Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Line Item Details</CardTitle>
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th
                    className="text-left p-2 cursor-pointer hover:bg-muted/50 w-12"
                    onClick={() => handleSort('original')}
                    title="Sort by original spreadsheet order"
                  >
                    <div className="flex items-center gap-1">
                      #
                      {sortBy === 'original' &&
                        (sortOrder === 'asc' ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        ))}
                    </div>
                  </th>
                  <th className="text-left p-2">Description</th>
                  <th
                    className="text-right p-2 cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('amount')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Original
                      {sortBy === 'amount' &&
                        (sortOrder === 'asc' ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        ))}
                    </div>
                  </th>
                  <th
                    className="text-right p-2 cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('eligible')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Eligible
                      {sortBy === 'eligible' &&
                        (sortOrder === 'asc' ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        ))}
                    </div>
                  </th>
                  <th
                    className="text-center p-2 cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('category')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Category
                      {sortBy === 'category' &&
                        (sortOrder === 'asc' ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        ))}
                    </div>
                  </th>
                  <th className="text-center p-2">Rate</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item, index) => (
                  <>
                    <tr
                      key={index}
                      className={cn(
                        'border-b hover:bg-muted/50 cursor-pointer',
                        item.eligibilityCategory === 'not_eligible' && 'opacity-60'
                      )}
                      onClick={() => toggleRow(index)}
                    >
                      <td className="p-2 text-muted-foreground text-sm">
                        {item.rowIndex + 1}
                      </td>
                      <td className="p-2 max-w-[300px] truncate" title={item.description}>
                        {item.description}
                      </td>
                      <td className="text-right p-2 font-mono">
                        {formatCurrency(item.originalAmount)}
                      </td>
                      <td className="text-right p-2 font-mono text-green-600">
                        {formatCurrency(item.eligibleAmount)}
                      </td>
                      <td className="text-center p-2">
                        <CategoryBadge category={item.eligibilityCategory} />
                      </td>
                      <td className="text-center p-2">
                        {formatPercentage(item.eligibilityPercentage)}
                      </td>
                      <td className="p-2">
                        {expandedRows.has(index) ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </td>
                    </tr>
                    {expandedRows.has(index) && (
                      <tr key={`${index}-expanded`} className="bg-muted/30">
                        <td colSpan={7} className="p-4">
                          <div className="text-sm">
                            <p className="font-medium mb-1">Reasoning:</p>
                            <p className="text-muted-foreground">{item.reasoning}</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td className="p-2"></td>
                  <td className="p-2">Total ({result.lineItems.length} items)</td>
                  <td className="text-right p-2 font-mono">
                    {formatCurrency(result.totalOriginal)}
                  </td>
                  <td className="text-right p-2 font-mono text-green-600">
                    {formatCurrency(result.totalEligible)}
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      {result.summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Analysis Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{result.summary}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
