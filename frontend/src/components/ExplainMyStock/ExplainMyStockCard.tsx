import React from 'react';
import { StockExplanationResult } from '../../types/explanation';

interface Props {
  data: StockExplanationResult;
  mode: 'BEGINNER' | 'ADVANCED';
}

export const ExplainMyStockCard: React.FC<Props> = ({ data, mode }) => {
  const { beginnerSummary, advancedSummary, verifiedFacts, possibleInterpretations, sourceMode, generatedAt } = data;
  const summary = mode === 'BEGINNER' ? beginnerSummary : advancedSummary;

  return (
    <div className="space-y-4 p-4 rounded-2xl glass-card border border-slate-800">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">Explain My Stock</h3>
        <span className="text-xs font-mono text-slate-400">
          {sourceMode} • {new Date(generatedAt).toLocaleString()}
        </span>
      </div>
      <p className="text-sm text-slate-300">{summary}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {verifiedFacts.map((fact, idx) => (
          <div key={idx} className="p-2 bg-slate-900 rounded">
            <div className="text-xs text-slate-500">{fact.label}</div>
            <div className="text-sm font-mono text-white">{fact.value}</div>
            <div className="text-[10px] text-slate-400">{fact.timestamp}</div>
          </div>
        ))}
      </div>
      <div className="space-y-2 mt-2">
        {possibleInterpretations.map((intp, idx) => (
          <div key={idx} className="border-t border-slate-700 pt-2">
            <div className={`text-sm font-semibold ${intp.sentiment.toLowerCase()}`}>{intp.title}</div>
            <div className="text-xs text-slate-300">{intp.description}</div>
            <div className="text-[10px] text-slate-400">Confidence: {intp.confidence}</div>
          </div>
        ))}
      </div>
    </div>
  );
};