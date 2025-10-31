
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar, Stethoscope, BookOpen, Search } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

const specialtyColors = {
  Cardiology: "bg-red-100 text-red-700 border-red-200",
  Nephrology: "bg-blue-100 text-blue-700 border-blue-200", 
  Endocrinology: "bg-purple-100 text-purple-700 border-purple-200",
  Pulmonology: "bg-cyan-100 text-cyan-700 border-cyan-200",
  Gastroenterology: "bg-green-100 text-green-700 border-green-200",
  Rheumatology: "bg-orange-100 text-orange-700 border-orange-200",
  Infectious_Disease: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Hematology: "bg-pink-100 text-pink-700 border-pink-200",
  Critical_Care: "bg-indigo-100 text-indigo-700 border-indigo-200",
  General_Internal_Medicine: "bg-slate-100 text-slate-700 border-slate-200",
  Neurology: "bg-emerald-100 text-emerald-700 border-emerald-200"
};

export default function SearchResultCard({ study, isSelected, onSelect }) {
  const getDisplayDate = () => {
    if (!study.publication_date) return null;
    // Use new Date() for more lenient parsing than parseISO
    const date = new Date(study.publication_date);
    // Check if the parsed date is valid
    if (isNaN(date.getTime())) {
      // If the AI provides a non-standard date string, display it as-is to avoid crashing.
      return study.publication_date;
    }
    return format(date, "MMM d, yyyy");
  };
  
  return (
    <Card className={`medical-card transition-all duration-300 ${isSelected ? 'border-blue-500 shadow-md' : ''}`}>
      <div className="flex items-start p-6 gap-4">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelect}
          className="mt-1.5 h-5 w-5"
          aria-label={`Select study: ${study.title}`}
        />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge 
              variant="outline" 
              className={specialtyColors[study.specialty] || "bg-slate-100 text-slate-700"}
            >
              <Stethoscope className="w-3 h-3 mr-1" />
              {study.specialty?.replace(/_/g, ' ')}
            </Badge>
            <Badge variant="secondary">{study.study_type}</Badge>
            {study.publication_date && (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Calendar className="w-3 h-3" />
                <span>{getDisplayDate()}</span>
              </div>
            )}
          </div>
          <h3 className="text-lg font-semibold text-slate-900 leading-snug mb-2">
            {study.title}
          </h3>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-600 mb-4">
            <span>{study.journal}</span>
            <button
              onClick={() => {
                const searchQuery = encodeURIComponent(study.title);
                window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank');
              }}
              className="text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Search className="w-3 h-3" />
              <span className="text-xs">Search Google with exact title</span>
            </button>
          </div>
          
          <div className="space-y-3 text-sm text-slate-700">
            <p><strong>Summary:</strong> {study.summary}</p>
            {study.key_findings && <p><strong>Key Findings:</strong> {study.key_findings}</p>}
          </div>
        </div>
      </div>
    </Card>
  );
}

SearchResultCard.Skeleton = function SearchResultCardSkeleton() {
    return (
        <Card className="medical-card">
            <div className="flex items-start p-6 gap-4">
                <Skeleton className="h-5 w-5 mt-1.5" />
                <div className="flex-1 space-y-3">
                    <div className="flex gap-2">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-5 w-16" />
                    </div>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/4 mb-4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                </div>
            </div>
        </Card>
    )
}
