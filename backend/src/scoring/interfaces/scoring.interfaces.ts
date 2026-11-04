export interface CategoryScoreResult {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  weight: number;
  rawScore: number;
  maxPossibleScore: number;
  percentage: number; // 0.0 - 100.0
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  answeredQuestionsCount: number;
  visibleQuestionsCount: number;
}

export interface BenchmarkData {
  status: 'configured' | 'unconfigured';
  source?: string;
  segment?: string;
  geography?: string;
  effectiveDate?: string;
  industryAverageIndex?: number;
  variance?: number;
  message?: string;
}

export interface ScoringCalculationResult {
  overallScore: number;
  normalizedIndex: number; // 0.0 - 100.0
  maturityLevel: 'Foundational' | 'Emerging' | 'Advancing' | 'Optimized';
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  categoryScores: Record<string, CategoryScoreResult>;
  benchmarkComparison: BenchmarkData;
  calculatedAt: Date;
}
