import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Award, TrendingUp, BookOpen, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function StatsOverview({ studies, isLoading }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array(4).fill(0).map((_, i) => (
          <Card key={i} className="medical-card">
            <CardContent className="p-6">
              <Skeleton className="h-12 w-12 rounded-xl mb-4" />
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-6 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const majorJournalCount = studies.filter(s => s.is_major_journal).length;
  const highImpactCount = studies.filter(s => s.impact_factor >= 10).length;
  const avgImpactFactor = studies.length > 0 
    ? (studies.reduce((sum, s) => sum + (s.impact_factor || 0), 0) / studies.length).toFixed(1)
    : 0;
  const topSpecialty = getTopSpecialty(studies);

  function getTopSpecialty(studies) {
    const specialtyCounts = {};
    studies.forEach(study => {
      specialtyCounts[study.specialty] = (specialtyCounts[study.specialty] || 0) + 1;
    });
    return Object.keys(specialtyCounts).reduce((a, b) => specialtyCounts[a] > specialtyCounts[b] ? a : b, '');
  }

  const stats = [
    {
      title: "Total Studies",
      value: studies.length,
      icon: BookOpen,
      color: "bg-blue-500",
      badge: "Active"
    },
    {
      title: "Major Journals",
      value: majorJournalCount,
      icon: Award,
      color: "bg-emerald-500",
      badge: "NEJM, JAMA, etc."
    },
    {
      title: "High Impact",
      value: highImpactCount,
      icon: TrendingUp,
      color: "bg-purple-500",
      badge: "IF ≥ 10"
    },
    {
      title: "Avg Impact Factor",
      value: avgImpactFactor,
      icon: Star,
      color: "bg-amber-500",
      badge: topSpecialty.replace(/_/g, ' ')
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => (
        <Card key={index} className="medical-card hover:shadow-lg transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">{stat.title}</p>
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                {stat.badge && (
                  <Badge variant="secondary" className="mt-2 text-xs bg-slate-100 text-slate-600">
                    {stat.badge}
                  </Badge>
                )}
              </div>
              <div className={`p-3 rounded-xl ${stat.color} bg-opacity-10`}>
                <stat.icon className={`w-6 h-6 ${stat.color.replace('bg-', 'text-')}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}