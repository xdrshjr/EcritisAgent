/**
 * ValidationResultPanel Component
 * Displays validation results for the uploaded document with elegant streaming UI
 * Shows structured JSON validation issues in a scrollable, beautiful format
 * Enhanced with modern, clean design and better visual hierarchy
 */

'use client';

import { useEffect, useRef } from 'react';
import { logger } from '@/lib/logger';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { formatChunkProgress } from '@/lib/documentUtils';
import type { ValidationResult, ValidationIssue } from './AIDocValidationContainer';

interface ValidationResultPanelProps {
  results?: ValidationResult[];
  isValidating?: boolean;
  currentChunk?: number;
  totalChunks?: number;
  selectedIssueId?: string | null;
  onIssueClick?: (issue: ValidationIssue) => void;
}

const ValidationResultPanel = ({ 
  results = [], 
  isValidating = false,
  currentChunk = 0,
  totalChunks = 0,
  selectedIssueId = null,
  onIssueClick,
}: ValidationResultPanelProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const resultsEndRef = useRef<HTMLDivElement>(null);
  const issueRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    logger.info('ValidationResultPanel component mounted', {
      spacingApproach: 'flex-gap',
      reason: 'Using flex with gap property to avoid global CSS margin reset (margin:0) override',
      prioritySpacing: '24px (gap-6)',
      issueSpacing: '12px (gap-3)',
    }, 'ValidationResultPanel');
  }, []);

  // Auto-scroll to bottom when new results arrive
  useEffect(() => {
    if (resultsEndRef.current && !selectedIssueId) {
      resultsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    
    // Log results update for debugging
    if (results.length > 0) {
      logger.debug('Validation results updated', {
        totalResults: results.length,
        totalIssues: results.reduce((sum, r) => sum + r.issues.length, 0),
      }, 'ValidationResultPanel');
    }
  }, [results, selectedIssueId]);

  // Scroll to selected issue when it changes
  useEffect(() => {
    if (selectedIssueId) {
      const issueElement = issueRefs.current.get(selectedIssueId);
      
      if (issueElement) {
        logger.info('Scrolling right validation panel to selected issue', { 
          issueId: selectedIssueId,
          totalIssuesInRefs: issueRefs.current.size,
        }, 'ValidationResultPanel');
        
        issueElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
        
        // Flash animation for visual feedback
        issueElement.style.animation = 'flash 0.5s ease-in-out';
        setTimeout(() => {
          issueElement.style.animation = '';
        }, 500);
        
        logger.success('Successfully scrolled to issue in right panel', {
          issueId: selectedIssueId,
        }, 'ValidationResultPanel');
      } else {
        logger.warn('Issue element not found in refs for scrolling', { 
          issueId: selectedIssueId,
          availableRefs: Array.from(issueRefs.current.keys()).slice(0, 5),
          totalRefs: issueRefs.current.size,
          note: 'Issue may be in collapsed section or not yet rendered',
        }, 'ValidationResultPanel');
      }
    }
  }, [selectedIssueId]);

  const hasResults = results.length > 0;
  const totalIssuesCount = results.reduce((sum, r) => sum + r.issues.length, 0);

  // Group all issues by severity across all results
  const groupedIssues = {
    high: [] as ValidationIssue[],
    medium: [] as ValidationIssue[],
    low: [] as ValidationIssue[],
  };

  // Collect all issues from all chunks and group by severity
  // This maintains the original issue order within each severity group
  // ensuring left-right panel synchronization works correctly
  results.forEach((result) => {
    result.issues.forEach((issue) => {
      groupedIssues[issue.severity].push(issue);
    });
  });

  // Count issues by severity
  const highCount = groupedIssues.high.length;
  const mediumCount = groupedIssues.medium.length;
  const lowCount = groupedIssues.low.length;

  // Check if there are any errors in results
  const hasErrors = results.some(r => r.error);

  // Verify issue ID uniqueness
  const allIssues = [...groupedIssues.high, ...groupedIssues.medium, ...groupedIssues.low];
  const allIssueIds = allIssues.map(iss => iss.id);
  const uniqueIssueIds = new Set(allIssueIds);
  const hasDuplicateIds = allIssueIds.length !== uniqueIssueIds.size;

  if (hasDuplicateIds) {
    const idCounts = new Map<string, number>();
    allIssueIds.forEach(id => idCounts.set(id, (idCounts.get(id) || 0) + 1));
    const duplicates = Array.from(idCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([id, count]) => ({ id, count }));
    
    logger.error('Duplicate issue IDs found in display panel!', {
      duplicates,
      totalIssues: allIssueIds.length,
      uniqueIssues: uniqueIssueIds.size,
    }, 'ValidationResultPanel');
  }

  logger.debug('Grouped validation issues by severity for display', {
    highCount,
    mediumCount,
    lowCount,
    totalIssuesCount,
    resultsCount: results.length,
    uniqueIssueIds: uniqueIssueIds.size,
    allIdsUnique: !hasDuplicateIds,
    spacingConfig: {
      betweenPriorities: '24px (flex gap-6)',
      betweenIssues: '12px (flex gap-3)',
      note: 'Using flex gap instead of space-y to avoid global margin reset override',
    },
    note: 'Issues maintain original order within severity groups for left-right sync',
  }, 'ValidationResultPanel');

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Enhanced Header with Modern Design */}
      {/* Enhanced Content Area - Scrollable with Better Spacing */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 validation-results-scrollbar">
        {!hasResults && !isValidating && (
          // Enhanced Empty State with Modern Design
          <div className="h-full flex items-center justify-center p-6">
            <div className="text-center max-w-lg">
              <div className="relative w-24 h-24 mx-auto mb-8">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-2xl blur-xl" />
                <div className="relative w-24 h-24 bg-card border border-border rounded-2xl flex items-center justify-center shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <path d="M9 15h6" />
                    <path d="M12 18v-6" />
                  </svg>
                </div>
              </div>
              
              <h3 className="text-2xl font-bold text-foreground mb-3 tracking-tight">
                {dict.docValidation.readyForValidation}
              </h3>
              <p className="text-base text-muted-foreground mb-8 leading-relaxed">
                {dict.docValidation.validationPlaceholder}
              </p>
              
              <div className="bg-gradient-to-br from-card to-card/50 border border-border rounded-xl p-6 shadow-sm text-left">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {dict.docValidation.aiPoweredAnalysis}
                  </p>
                </div>
                
                <div className="grid gap-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50 hover:bg-background transition-colors">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{dict.docValidation.grammarSpelling}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{dict.docValidation.grammarSpellingDesc}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50 hover:bg-background transition-colors">
                    <div className="w-2 h-2 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{dict.docValidation.wordUsageVocabulary}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{dict.docValidation.wordUsageVocabularyDesc}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50 hover:bg-background transition-colors">
                    <div className="w-2 h-2 rounded-full bg-secondary mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{dict.docValidation.punctuationCorrectness}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{dict.docValidation.punctuationCorrectnessDesc}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50 hover:bg-background transition-colors">
                    <div className="w-2 h-2 rounded-full bg-chart-4 mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{dict.docValidation.logicalConsistency}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{dict.docValidation.logicalConsistencyDesc}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {(hasResults || isValidating) && (
          // Enhanced Results Container with Modern Card Design
          <div className="space-y-5">
            {/* Enhanced Error Messages */}
            {hasErrors && (
              <div className="bg-gradient-to-r from-red-50 to-red-50/50 border border-red-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-bold text-red-900 mb-2">{dict.docValidation.validationErrors}</h4>
                    <div className="space-y-2">
                      {results.filter(r => r.error).map((result, idx) => (
                        <div key={`error-${idx}`} className="bg-card/60 rounded-lg p-3 border border-red-200">
                          <p className="text-sm font-medium text-red-800">
                            <span className="font-bold">{dict.docValidation.section} {result.chunkIndex + 1}:</span> {result.error}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Enhanced Container with All Issues Grouped by Severity */}
            {totalIssuesCount > 0 && (
              <div className="bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                {/* Enhanced Container Header with Summary Statistics */}
                <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-muted/40 to-muted/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-foreground mb-1">
                        {dict.docValidation.detectedIssues}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {totalIssuesCount} {totalIssuesCount === 1 ? dict.docValidation.issue : dict.docValidation.issues} {dict.docValidation.requiringAttention}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {highCount > 0 && (
                        <div className="px-3 py-1.5 bg-gradient-to-br from-red-50 to-red-100 text-red-800 text-xs font-bold rounded-lg border border-red-200 shadow-sm">
                          <span className="block text-[10px] text-red-600 mb-0.5">HIGH</span>
                          <span className="text-sm">{highCount}</span>
                        </div>
                      )}
                      {mediumCount > 0 && (
                        <div className="px-3 py-1.5 bg-gradient-to-br from-amber-50 to-amber-100 text-amber-800 text-xs font-bold rounded-lg border border-amber-200 shadow-sm">
                          <span className="block text-[10px] text-amber-600 mb-0.5">MEDIUM</span>
                          <span className="text-sm">{mediumCount}</span>
                        </div>
                      )}
                      {lowCount > 0 && (
                        <div className="px-3 py-1.5 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-800 text-xs font-bold rounded-lg border border-blue-200 shadow-sm">
                          <span className="block text-[10px] text-blue-600 mb-0.5">LOW</span>
                          <span className="text-sm">{lowCount}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Enhanced Container Content - Issues Grouped by Severity */}
                <div className="p-6 flex flex-col gap-6">
                  {/* High Priority Issues Section */}
                  {highCount > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3 pb-2">
                        <div className="flex items-center gap-2 flex-1">
                          <div className="w-1.5 h-8 bg-gradient-to-b from-red-500 to-red-600 rounded-full shadow-sm" />
                          <div>
                            <h4 className="text-base font-bold text-red-900 leading-tight">
                              {dict.docValidation.highPriority}
                            </h4>
                            <p className="text-xs text-red-700 mt-0.5">
                              {highCount} {highCount === 1 ? dict.docValidation.issue : dict.docValidation.issues} {dict.docValidation.requiringImmediateAttention}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3">
                        {groupedIssues.high.map((issue, idx) => (
                          <IssueCard 
                            key={issue.id || `high-issue-${idx}`} 
                            issue={issue}
                            isSelected={selectedIssueId === issue.id}
                            onClick={() => onIssueClick?.(issue)}
                            issueRefs={issueRefs}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Medium Priority Issues Section */}
                  {mediumCount > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3 pb-2">
                        <div className="flex items-center gap-2 flex-1">
                          <div className="w-1.5 h-8 bg-gradient-to-b from-amber-500 to-amber-600 rounded-full shadow-sm" />
                          <div>
                            <h4 className="text-base font-bold text-amber-900 leading-tight">
                              {dict.docValidation.mediumPriority}
                            </h4>
                            <p className="text-xs text-amber-700 mt-0.5">
                              {mediumCount} {mediumCount === 1 ? dict.docValidation.issue : dict.docValidation.issues} {dict.docValidation.toConsider}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3">
                        {groupedIssues.medium.map((issue, idx) => (
                          <IssueCard 
                            key={issue.id || `medium-issue-${idx}`} 
                            issue={issue}
                            isSelected={selectedIssueId === issue.id}
                            onClick={() => onIssueClick?.(issue)}
                            issueRefs={issueRefs}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Low Priority Issues Section */}
                  {lowCount > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3 pb-2">
                        <div className="flex items-center gap-2 flex-1">
                          <div className="w-1.5 h-8 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full shadow-sm" />
                          <div>
                            <h4 className="text-base font-bold text-blue-900 leading-tight">
                              {dict.docValidation.lowPriority}
                            </h4>
                            <p className="text-xs text-blue-700 mt-0.5">
                              {lowCount} {lowCount === 1 ? dict.docValidation.suggestion : dict.docValidation.suggestions} {dict.docValidation.forImprovement}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3">
                        {groupedIssues.low.map((issue, idx) => (
                          <IssueCard 
                            key={issue.id || `low-issue-${idx}`} 
                            issue={issue}
                            isSelected={selectedIssueId === issue.id}
                            onClick={() => onIssueClick?.(issue)}
                            issueRefs={issueRefs}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Enhanced No Issues Found - Success Message */}
            {hasResults && totalIssuesCount === 0 && !hasErrors && !isValidating && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-300 rounded-xl p-8 shadow-sm">
                <div className="flex flex-col items-center text-center">
                  <div className="relative w-20 h-20 mb-6">
                    <div className="absolute inset-0 bg-green-500/20 rounded-full animate-pulse" />
                    <div className="relative w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </div>
                  </div>
                  
                  <h3 className="text-2xl font-bold text-green-900 mb-3">
                    {dict.docValidation.noIssuesFound}
                  </h3>
                  <p className="text-base text-green-800 leading-relaxed max-w-md">
                    {dict.docValidation.documentWellWritten}
                  </p>
                  
                  <div className="mt-6 flex items-center gap-2 px-4 py-2 bg-card/60 rounded-lg border border-green-200">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                    </svg>
                    <span className="text-sm font-medium text-green-800">{dict.docValidation.documentValidationComplete}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Enhanced Loading Indicator for Current Chunk */}
            {isValidating && (
              <div className="bg-gradient-to-br from-card to-card/50 border border-border rounded-xl p-6 shadow-lg">
                <div className="flex items-center gap-1">
                  <div className="relative w-12 h-12 flex-shrink-0">
                    <div className="absolute inset-0 border border-primary/20 rounded-full" />
                    <div className="absolute inset-0 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <div className="absolute inset-2 bg-primary/10 rounded-full animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-foreground mb-1">
                      {dict.docValidation.validating}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatChunkProgress(currentChunk, totalChunks, dict.docValidation.chunkProgress)}
                    </p>
                    <div className="mt-3 w-full bg-muted/50 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-primary to-accent h-full rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${totalChunks > 0 ? (currentChunk / totalChunks) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={resultsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
};


// Enhanced Issue Card Component - Modern, elegant display of individual validation issues
const IssueCard = ({ 
  issue, 
  isSelected = false, 
  onClick,
  issueRefs,
}: { 
  issue: ValidationIssue;
  isSelected?: boolean;
  onClick?: () => void;
  issueRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
}) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const severityConfig = {
    high: {
      bgColor: 'bg-gradient-to-br from-red-50 to-red-50/50',
      borderColor: 'border-l-red-500',
      iconBgColor: 'bg-red-100',
      iconColor: 'text-red-600',
      textColor: 'text-red-900',
      labelBg: 'bg-red-100',
      labelText: 'text-red-700',
      label: 'High',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
    },
    medium: {
      bgColor: 'bg-gradient-to-br from-amber-50 to-amber-50/50',
      borderColor: 'border-l-amber-500',
      iconBgColor: 'bg-amber-100',
      iconColor: 'text-amber-600',
      textColor: 'text-amber-900',
      labelBg: 'bg-amber-100',
      labelText: 'text-amber-700',
      label: 'Medium',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
    low: {
      bgColor: 'bg-gradient-to-br from-blue-50 to-blue-50/50',
      borderColor: 'border-l-blue-500',
      iconBgColor: 'bg-blue-100',
      iconColor: 'text-blue-600',
      textColor: 'text-blue-900',
      labelBg: 'bg-blue-100',
      labelText: 'text-blue-700',
      label: 'Low',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      ),
    },
  };

  const categoryConfig = {
    Grammar: { 
      label: dict.docValidation.categoryGrammar, 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7V4h16v3" />
          <path d="M9 20h6" />
          <path d="M12 4v16" />
        </svg>
      )
    },
    WordUsage: { 
      label: dict.docValidation.categoryWordUsage,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      )
    },
    Punctuation: { 
      label: dict.docValidation.categoryPunctuation,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      )
    },
    Logic: { 
      label: dict.docValidation.categoryLogic,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      )
    },
  };

  const severity = severityConfig[issue.severity];
  const category = categoryConfig[issue.category];

  return (
    <div 
      ref={(el) => {
        if (el) {
          issueRefs.current.set(issue.id, el);
        }
      }}
      onClick={() => {
        logger.info('Issue card clicked', { issueId: issue.id, category: issue.category, severity: issue.severity }, 'IssueCard');
        onClick?.();
      }}
      className={`group relative bg-card border-l ${severity.borderColor} rounded-lg shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden ${
        isSelected ? 'ring-2 ring-primary shadow-lg scale-[1.02]' : ''
      }`}
      style={{
        animation: isSelected ? 'pulse 0.5s ease-in-out' : 'none',
      }}
    >
      <div className={`absolute inset-0 ${severity.bgColor} opacity-50`} />
      
      <div className="relative px-4 pt-5 pb-4">
        {/* Issue Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-9 h-9 rounded-lg ${severity.iconBgColor} flex items-center justify-center flex-shrink-0 shadow-sm`}>
            <div className={severity.iconColor}>
              {severity.icon}
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-md ${severity.labelBg} ${severity.labelText} border border-current/20`}>
                {category.icon}
                <span>{category.label}</span>
              </div>
              {issue.lineNumber && (
                <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted/50 text-muted-foreground text-xs font-medium rounded">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span>{locale === 'zh' ? `${dict.docValidation.line} ${issue.lineNumber} 行` : `${dict.docValidation.line} ${issue.lineNumber}`}</span>
                </div>
              )}
            </div>
            
            {/* Issue Description */}
            <h5 className={`text-sm font-bold ${severity.textColor} leading-relaxed mb-3`}>
              {issue.issue}
            </h5>
          </div>
        </div>
        
        {/* Content Sections */}
        <div className="space-y-3 ml-12">
          {/* Original Text */}
          {issue.originalText && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                {dict.docValidation.originalText}
              </p>
              <div className="bg-card border border-border rounded-lg p-3 shadow-sm">
                <code className="text-xs text-foreground font-mono leading-relaxed break-words">
                  {issue.originalText}
                </code>
              </div>
            </div>
          )}
          
          {/* Location */}
          {issue.location && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                {dict.docValidation.location}
              </p>
              <p className="text-xs text-foreground/80 italic leading-relaxed">
                {issue.location}
              </p>
            </div>
          )}
          
          {/* Suggestion */}
          {issue.suggestion && (
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-3 shadow-sm">
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-md bg-green-100 flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-green-900 mb-1 uppercase tracking-wide">
                    {dict.docValidation.suggestedFix}
                  </p>
                  <p className="text-sm text-green-800 leading-relaxed font-medium">
                    {issue.suggestion}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Hover Indicator */}
      <div className="absolute top-0 right-0 w-2 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
    </div>
  );
};

export default ValidationResultPanel;

