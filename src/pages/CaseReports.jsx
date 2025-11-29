
import React, { useState, useEffect, useMemo } from 'react';
import { User } from '@/api/entities';
import { UserStudyStatus } from '@/api/entities';
import { MedicalArticle } from '@/api/medicalArticles';
import { getStatusMap as getArticleStatusMap, setStatus as setArticleStatus } from '@/api/articleStatuses';
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { format, getYear, getMonth } from 'date-fns';

import MedicalArticleGrid from '../components/dashboard/MedicalArticleGrid';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

const SPECIALTIES = [
  "Cardiology", "Nephrology", "Endocrinology", "Pulmonology", 
  "Gastroenterology", "Rheumatology", "Infectious diseases", 
  "Hematology", "Critical_Care", "General_Internal_Medicine", "Neurology",
  "Geriatrics", "Oncology"
];

// Normalize specialty/category strings to a common comparable form
const normalizeSpecialty = (value) =>
  (value || '').toString().trim().toLowerCase().replace(/\s+/g, '_');

// Check if an article is a case report
const isCaseReport = (article) => {
  if (!article.article_type && !article.publication_type) return false;
  const articleType = (article.article_type || article.publication_type || '').toLowerCase();
  return articleType.includes('case report') || articleType.includes('case reports');
};

function CaseReportsFilters({ onFilterChange, monthYearOptions }) {
  const [selectedSpecialties, setSelectedSpecialties] = useState(new Set(SPECIALTIES));
  const [monthYear, setMonthYear] = useState('all');

  useEffect(() => {
    onFilterChange({
      specialties: selectedSpecialties,
      monthYear
    });
  }, [selectedSpecialties, monthYear, onFilterChange]);

  const handleSelectSpecialty = (specialty) => {
    if (specialty === '__ALL__') {
      setSelectedSpecialties(new Set(SPECIALTIES));
    } else {
      // Single-select behavior: show only the chosen specialty
      setSelectedSpecialties(new Set([specialty]));
    }
  };

  return (
    <Card className="professional-card p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
        <div>
          <Label className="text-sm font-semibold text-slate-700">Specialty</Label>
          <Select onValueChange={handleSelectSpecialty}>
             <SelectTrigger className="w-full mt-1">
              <SelectValue placeholder="Filter by specialty..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__ALL__">All Specialties</SelectItem>
              {SPECIALTIES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-sm font-semibold text-slate-700">Date Published</Label>
          <Select value={monthYear} onValueChange={setMonthYear}>
            <SelectTrigger className="w-full mt-1">
              <SelectValue placeholder="All time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              {monthYearOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </Card>
  );
}

export default function CaseReports() {
  const [medicalArticles, setMedicalArticles] = useState([]);
  const [articleStatuses, setArticleStatuses] = useState(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [filters, setFilters] = useState({
    specialties: new Set(SPECIALTIES),
    monthYear: 'all'
  });

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const currentUser = await User.me();
      setCurrentUser(currentUser);
      
      // Load all medical articles (we'll filter for case reports on the frontend)
      const medicalArticlesData = await MedicalArticle.getRelevantArticles({ 
        limit: 1000, // Get a large number to ensure we get all case reports
        sort: 'publication_date' // Backend sorts by publication_date DESC
      });
      
      // Filter to only case reports
      const caseReports = medicalArticlesData.filter(isCaseReport);
      console.log(`Total articles loaded: ${medicalArticlesData.length}`);
      console.log(`Case reports found: ${caseReports.length}`);
      console.log('All case reports:', caseReports.map(a => ({
        id: a.id,
        title: a.title?.substring(0, 50),
        article_type: a.article_type,
        publication_type: a.publication_type
      })));
      
      // Check which articles are NOT case reports but might be
      const nonCaseReports = medicalArticlesData.filter(a => !isCaseReport(a));
      const suspicious = nonCaseReports.filter(a => 
        (a.article_type && a.article_type.toLowerCase().includes('case')) ||
        (a.publication_type && a.publication_type.toLowerCase().includes('case'))
      );
      if (suspicious.length > 0) {
        console.log('Articles that might be case reports but were filtered out:', suspicious.map(a => ({
          id: a.id,
          title: a.title?.substring(0, 50),
          article_type: a.article_type,
          publication_type: a.publication_type
        })));
      }
      
      setMedicalArticles(caseReports);

      // Load article statuses: merge backend statuses with local storage for backward compatibility
      const localArticleStatuses = getArticleStatusMap();
      let backendArticleStatuses = new Map();
      
      if (currentUser) {
        try {
          const userStatuses = await UserStudyStatus.filter({ created_by: currentUser.email }, "-created_date");
          backendArticleStatuses = new Map(
            userStatuses
              .filter(s => s.article_id) // Filter for medical article statuses
              .map(s => [s.article_id, s])
          );
        } catch (e) {
          console.error("Failed to load article statuses from backend:", e);
        }
      }
      
      // Merge with local (backend takes precedence)
      const mergedArticleStatuses = new Map(localArticleStatuses);
      for (const [articleId, status] of backendArticleStatuses) {
        mergedArticleStatuses.set(articleId, status);
      }
      setArticleStatuses(mergedArticleStatuses);
    } catch(e) {
      console.error("Error loading case reports data", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleArticleStatusChange = async (articleId, newStatusRecord) => {
    // Update local storage for backward compatibility
    if (newStatusRecord) {
      setArticleStatus(articleId, newStatusRecord.status);
    } else {
      setArticleStatus(articleId, null);
    }
    
    // Also save to backend for cross-user trending
    try {
      const existingStatus = articleStatuses.get(articleId);
      if (newStatusRecord) {
        if (existingStatus && existingStatus.id) {
          // Update existing backend record
          try {
            const updatedRecord = await UserStudyStatus.update(existingStatus.id, { status: newStatusRecord.status });
            setArticleStatuses(prevMap => {
              const newMap = new Map(prevMap);
              newMap.set(articleId, updatedRecord);
              return newMap;
            });
          } catch (e) {
            console.log("Failed to update in backend, trying to create:", e);
            // If update fails, try creating
            try {
              const newRecord = await UserStudyStatus.create({ article_id: articleId, status: newStatusRecord.status });
              setArticleStatuses(prevMap => {
                const newMap = new Map(prevMap);
                newMap.set(articleId, newRecord);
                return newMap;
              });
            } catch (createError) {
              console.error("Failed to create in backend:", createError);
              // Still update local state even if backend fails
              setArticleStatuses(prevMap => {
                const newMap = new Map(prevMap);
                newMap.set(articleId, newStatusRecord);
                return newMap;
              });
            }
          }
        } else {
          // Create new backend record
          try {
            const newRecord = await UserStudyStatus.create({ article_id: articleId, status: newStatusRecord.status });
            setArticleStatuses(prevMap => {
              const newMap = new Map(prevMap);
              newMap.set(articleId, newRecord);
              return newMap;
            });
          } catch (e) {
            console.error("Failed to create in backend:", e);
            // Still update local state even if backend fails
            setArticleStatuses(prevMap => {
              const newMap = new Map(prevMap);
              newMap.set(articleId, newStatusRecord);
              return newMap;
            });
          }
        }
      } else {
        // Remove status
        if (existingStatus && existingStatus.id) {
          try {
            await UserStudyStatus.delete(existingStatus.id);
          } catch (e) {
            console.log("Failed to delete from backend (may not exist):", e);
          }
        }
        setArticleStatuses(prevMap => {
          const newMap = new Map(prevMap);
          newMap.delete(articleId);
          return newMap;
        });
      }
    } catch (e) {
      console.error("Error updating article status in backend:", e);
      // Still update local state even if backend fails
      setArticleStatuses(prevMap => {
        const newMap = new Map(prevMap);
        if (newStatusRecord) {
          newMap.set(articleId, newStatusRecord);
        } else {
          newMap.delete(articleId);
        }
        return newMap;
      });
    }
  };

  const handleArticleUpdate = (updatedArticle) => {
    setMedicalArticles(prev => prev.map(a => (a.id === updatedArticle.id ? updatedArticle : a)));
  };

  const monthYearOptions = useMemo(() => {
    const options = new Map();
    
    // Add options from case reports
    medicalArticles.forEach(article => {
      if (!article.publication_date) return;
      const date = new Date(article.publication_date);
      const year = getYear(date);
      const month = getMonth(date);
      const key = `${year}-${month}`;
      if (!options.has(key)) {
        options.set(key, {
          value: key,
          label: format(date, 'MMMM yyyy'),
          date: date
        });
      }
    });
    
    return Array.from(options.values()).sort((a,b) => b.date - a.date);
  }, [medicalArticles]);

  const filteredArticles = useMemo(() => {
    return medicalArticles.filter(article => {
      const { specialties, monthYear } = filters;
      
      const searchTermMatch = !searchTerm ||
        (article.title && article.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (article.journal && article.journal.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (article.medical_category && article.medical_category.toLowerCase().includes(searchTerm.toLowerCase()));

      const normalizedSelected = new Set(Array.from(specialties).map(normalizeSpecialty));
      // Handle special cases: "General medicine" should match "General_Internal_Medicine"
      // Also handle "Other" category - if it's not in the list, include it anyway
      let articleCategory = article.medical_category;
      if (articleCategory === 'General medicine') {
        articleCategory = 'General_Internal_Medicine';
      }
      // If no category or category is "Other" and not in specialties list, show it
      // Otherwise, check if it matches selected specialties
      const specialtyMatch = !articleCategory || 
                            articleCategory === 'Other' ||
                            normalizedSelected.has(normalizeSpecialty(articleCategory));
      
      let dateMatch = true;
      if (monthYear !== 'all') {
        if (!article.publication_date) dateMatch = false;
        else {
          const [year, month] = monthYear.split('-').map(Number);
          const articleDate = new Date(article.publication_date);
          dateMatch = getYear(articleDate) === year && getMonth(articleDate) === month;
        }
      }

      return searchTermMatch && specialtyMatch && dateMatch;
    }).sort((a, b) => {
      // Sort by publication_date descending
      const dateA = a.publication_date ? new Date(a.publication_date).getTime() : 0;
      const dateB = b.publication_date ? new Date(b.publication_date).getTime() : 0;
      return dateB - dateA;
    });
  }, [medicalArticles, searchTerm, filters]);


  return (
    <div className="space-y-6">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h1 className="text-3xl font-bold text-slate-900">Case Reports</h1>
            <p className="text-slate-600 mt-1">Browse and filter case reports from medical literature.</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search case reports..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 professional-card"
          />
        </div>
       </div>

      <CaseReportsFilters onFilterChange={setFilters} monthYearOptions={monthYearOptions} />

      {/* Case Reports Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">
            Case Reports ({filteredArticles.length})
          </h2>
          <p className="text-sm text-slate-600">
            Sorted by publication date (newest first)
          </p>
        </div>
        <MedicalArticleGrid
          articles={filteredArticles}
          isLoading={isLoading}
          statusMap={articleStatuses}
          onStatusChange={handleArticleStatusChange}
          isAdmin={currentUser?.role === 'admin'}
          isSenior={currentUser?.role === 'senior'}
          onArticleUpdate={handleArticleUpdate}
          hideScore={true}
          hidePublicationType={true}
        />
      </div>
    </div>
  );
}

