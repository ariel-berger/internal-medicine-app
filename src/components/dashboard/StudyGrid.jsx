
import React from 'react';
import { Skeleton } from "@/components/ui/skeleton";
import StudyCard from "./StudyCard";

export default function StudyGrid({ studies, isLoading, users, statusMap, onStatusChange, onStudyUpdate }) {
  if (isLoading) {
    return (
      <div className="grid gap-6">
        {Array(6).fill(0).map((_, i) => (
          <div key={i} className="medical-card p-6 rounded-xl">
            <div className="flex gap-4">
              <div className="flex-1 space-y-3">
                <Skeleton className="h-6 w-3/4" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-24" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <Skeleton className="h-12 w-12 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (studies.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 0 01-2-2V5a2 0 012-2h5.586a1 0 01.707.293l5.414 5.414a1 0 01.293.707V19a2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-900 mb-2">No studies found</h3>
        <p className="text-slate-500">Try adjusting your filters or add some studies to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {studies.map((study) => (
        <StudyCard 
          key={study.id} 
          study={study} 
          creator={users ? users[study.created_by] : undefined}
          statusRecord={statusMap?.get(study.id)}
          onStatusChange={onStatusChange}
          onStudyUpdate={onStudyUpdate}
        />
      ))}
    </div>
  );
}
