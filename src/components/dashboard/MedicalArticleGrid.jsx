import React from 'react';
import MedicalArticleCard from './MedicalArticleCard';
import { Skeleton } from '@/components/ui/skeleton';

export default function MedicalArticleGrid({ 
  articles, 
  isLoading, 
  statusMap, 
  onStatusChange, 
  isAdmin = false,
  onArticleUpdate,
  hideScore = false,
  hideTags = false,
  hidePublicationType = false
}) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        {[...Array(5)].map((_, index) => (
          <div key={index} className="professional-card rounded-xl p-6">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-6 w-24" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                  <Skeleton className="h-6 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
                <div className="flex items-center gap-1">
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 w-8" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!articles || articles.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-slate-500 mb-4">
          <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-900 mb-2">No relevant articles found</h3>
        <p className="text-slate-500">There are no medical articles marked as relevant at the moment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {articles.map((article) => (
        <MedicalArticleCard
          key={article.id}
          article={article}
          statusRecord={statusMap.get(article.id)}
          onStatusChange={onStatusChange}
          isAdmin={isAdmin}
          onArticleUpdate={onArticleUpdate}
          hideScore={hideScore}
          hideTags={hideTags}
          hidePublicationType={hidePublicationType}
        />
      ))}
    </div>
  );
}
