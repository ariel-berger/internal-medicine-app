import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp } from 'lucide-react';

export default function TopStudies({ studies, isLoading }) {
  if (isLoading) {
    return (
      <Card className="professional-card">
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-3/4" />
        </CardHeader>
        <CardContent className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="professional-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-slate-800">
          <TrendingUp className="w-5 h-5 text-slate-500" />
          <span>Trending Studies</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {studies.length === 0 ? (
          <p className="text-sm text-slate-500">No reading data available yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {studies.map((study) => (
              <a
                key={study.id}
                href={study.url || `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(study.title)}`}
                target="_blank"
                rel="noopener noreferrer"
                title={study.title}
                className="text-sm font-medium text-slate-700 p-2 bg-slate-100 hover:bg-slate-200 rounded-md transition-all duration-200 leading-snug truncate border border-slate-200"
              >
                {study.title}
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}