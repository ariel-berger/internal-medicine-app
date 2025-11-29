
import React, { useState, useEffect, useMemo } from 'react';
import { Study } from '@/api/entities';
import { User } from '@/api/entities';
import { UserStudyStatus } from '@/api/entities';
// Comments feature removed
import { MedicalArticle } from '@/api/medicalArticles';
import { getStatusMap as getArticleStatusMap, setStatus as setArticleStatus } from '@/api/articleStatuses';
import { Input } from "@/components/ui/input";
import { Search, SlidersHorizontal } from "lucide-react";
import { format, getYear, getMonth, startOfMonth, endOfMonth, parseISO } from 'date-fns';

import StudyGrid from '../components/dashboard/StudyGrid';
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

function AllStudiesFilters({ onFilterChange, monthYearOptions }) {
  const [selectedSpecialties, setSelectedSpecialties] = useState(new Set(SPECIALTIES));
  const [monthYear, setMonthYear] = useState('all');
  const [sortBy, setSortBy] = useState('score');

  useEffect(() => {
    onFilterChange({
      specialties: selectedSpecialties,
      monthYear,
      sortBy
    });
  }, [selectedSpecialties, monthYear, sortBy, onFilterChange]);

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
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
        <div>
          <Label className="text-sm font-semibold text-slate-700">Sort By</Label>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full mt-1">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">By Score</SelectItem>
              <SelectItem value="newest">Newest to Oldest</SelectItem>
              <SelectItem value="oldest">Oldest to Newest</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </Card>
  );
}

export default function AllStudies() {
  const [allStudies, setAllStudies] = useState([]);
  const [medicalArticles, setMedicalArticles] = useState([]);
  const [userStatuses, setUserStatuses] = useState(new Map());
  const [articleStatuses, setArticleStatuses] = useState(new Map());
  // Comments feature removed
  const [users, setUsers] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [filters, setFilters] = useState({
    specialties: new Set(SPECIALTIES),
    monthYear: 'all',
    sortBy: 'score'
  });

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const currentUser = await User.me();
      setCurrentUser(currentUser);
      
      // Load medical articles (all relevant articles)
      const medicalArticlesData = await MedicalArticle.getRelevantArticles({ 
        limit: 100, // Get more articles for the all studies page
        sort: 'ranking_score' 
      });
      // Filter out case reports from All Studies page
      const isCaseReport = (article) => {
        if (!article.article_type && !article.publication_type) return false;
        const articleType = (article.article_type || article.publication_type || '').toLowerCase();
        return articleType.includes('case report') || articleType.includes('case reports');
      };
      const filteredMedicalArticles = medicalArticlesData.filter(article => !isCaseReport(article));
      console.log("Loaded medical articles (excluding case reports):", filteredMedicalArticles.length, "out of", medicalArticlesData.length);
      setMedicalArticles(filteredMedicalArticles);

      // Load persisted article statuses from localStorage
      setArticleStatuses(getArticleStatusMap());

      const [studies, statuses] = await Promise.all([
        Study.list('-publication_date'),
        currentUser ? UserStudyStatus.filter({ created_by: currentUser.email }) : []
      ]);
      const normalizedStudies = studies.map(s => ({
        ...s,
        specialties: Array.isArray(s.specialties)
          ? s.specialties
          : (s.specialty ? [s.specialty] : [])
      }));
      setAllStudies(normalizedStudies);
      setUserStatuses(new Map(statuses.map(s => [s.study_id, s])));
      // Comments removed

      if (currentUser && currentUser.role === 'admin') {
        const usersData = await User.list();
        setUsers(usersData.reduce((map, user) => ({...map, [user.email]: user }), {}));
      }
    } catch(e) {
      console.error("Error loading all studies data", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStudyUpdate = (updatedStudy) => {
    setAllStudies(prev => prev.map(s => (s.id === updatedStudy.id ? updatedStudy : s)));
  };

  const handleStatusChange = (studyId, newStatusRecord) => {
    setUserStatuses(prevMap => {
      const newMap = new Map(prevMap);
      if (newStatusRecord) newMap.set(studyId, newStatusRecord);
      else newMap.delete(studyId);
      return newMap;
    });
  };

  const handleArticleStatusChange = (articleId, newStatusRecord) => {
    setArticleStatuses(prevMap => {
      const newMap = new Map(prevMap);
      if (newStatusRecord) {
        newMap.set(articleId, newStatusRecord);
        setArticleStatus(articleId, newStatusRecord.status);
      } else {
        newMap.delete(articleId);
        setArticleStatus(articleId, null);
      }
      return newMap;
    });
  };

  const handleArticleUpdate = (updatedArticle) => {
    setMedicalArticles(prev => prev.map(a => (a.id === updatedArticle.id ? updatedArticle : a)));
  };

  // Comments removed

  const monthYearOptions = useMemo(() => {
    const options = new Map();
    
    // Add options from regular studies
    allStudies.forEach(study => {
      if (!study.publication_date) return;
      const date = parseISO(study.publication_date);
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

    // Add options from medical articles
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
  }, [allStudies, medicalArticles]);

  const filteredStudies = useMemo(() => {
    let filtered = allStudies.filter(study => {
      const { specialties, monthYear } = filters;
      
      const searchTermMatch = !searchTerm ||
        (study.title && study.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (study.journal && study.journal.toLowerCase().includes(searchTerm.toLowerCase()));

      const normalizedSelected = new Set(Array.from(specialties).map(normalizeSpecialty));
      const studySpecialties = Array.isArray(study.specialties) ? study.specialties : (study.specialty ? [study.specialty] : []);
      const specialtyMatch = studySpecialties.length === 0 || studySpecialties.some(s => normalizedSelected.has(normalizeSpecialty(s)));
      
      let dateMatch = true;
      if (monthYear !== 'all') {
        if (!study.publication_date) dateMatch = false;
        else {
          const [year, month] = monthYear.split('-').map(Number);
          const studyDate = parseISO(study.publication_date);
          dateMatch = getYear(studyDate) === year && getMonth(studyDate) === month;
        }
      }

      return searchTermMatch && specialtyMatch && dateMatch;
    });

    // Apply sorting
    const { sortBy } = filters;
    if (sortBy === 'newest') {
      filtered.sort((a, b) => {
        if (!a.publication_date && !b.publication_date) return 0;
        if (!a.publication_date) return 1;
        if (!b.publication_date) return -1;
        return new Date(b.publication_date) - new Date(a.publication_date);
      });
    } else if (sortBy === 'oldest') {
      filtered.sort((a, b) => {
        if (!a.publication_date && !b.publication_date) return 0;
        if (!a.publication_date) return 1;
        if (!b.publication_date) return -1;
        return new Date(a.publication_date) - new Date(b.publication_date);
      });
    } else {
      // Default: by score (for studies without score, sort by date descending)
      filtered.sort((a, b) => {
        if (!a.publication_date && !b.publication_date) return 0;
        if (!a.publication_date) return 1;
        if (!b.publication_date) return -1;
        return new Date(b.publication_date) - new Date(a.publication_date);
      });
    }

    return filtered;
  }, [allStudies, searchTerm, filters]);

  const filteredArticles = useMemo(() => {
    let filtered = medicalArticles.filter(article => {
      const { specialties, monthYear } = filters;
      
      const searchTermMatch = !searchTerm ||
        (article.title && article.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (article.journal && article.journal.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (article.medical_category && article.medical_category.toLowerCase().includes(searchTerm.toLowerCase()));

      const normalizedSelected = new Set(Array.from(specialties).map(normalizeSpecialty));
      const specialtyMatch = article.medical_category && normalizedSelected.has(normalizeSpecialty(article.medical_category));
      
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
    });

    // Apply sorting
    const { sortBy } = filters;
    if (sortBy === 'newest') {
      filtered.sort((a, b) => {
        if (!a.publication_date && !b.publication_date) return 0;
        if (!a.publication_date) return 1;
        if (!b.publication_date) return -1;
        return new Date(b.publication_date) - new Date(a.publication_date);
      });
    } else if (sortBy === 'oldest') {
      filtered.sort((a, b) => {
        if (!a.publication_date && !b.publication_date) return 0;
        if (!a.publication_date) return 1;
        if (!b.publication_date) return -1;
        return new Date(a.publication_date) - new Date(b.publication_date);
      });
    } else {
      // Default: by score (ranking_score descending)
      filtered.sort((a, b) => {
        const scoreA = a.ranking_score || 0;
        const scoreB = b.ranking_score || 0;
        if (scoreA !== scoreB) {
          return scoreB - scoreA; // Higher score first
        }
        // If scores are equal, sort by date descending
        if (!a.publication_date && !b.publication_date) return 0;
        if (!a.publication_date) return 1;
        if (!b.publication_date) return -1;
        return new Date(b.publication_date) - new Date(a.publication_date);
      });
    }

    return filtered;
  }, [medicalArticles, searchTerm, filters]);


  return (
    <div className="space-y-6">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h1 className="text-3xl font-bold text-slate-900">All Studies</h1>
            <p className="text-slate-600 mt-1">Browse and filter the entire collection of clinical studies.</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search all studies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 professional-card"
          />
        </div>
       </div>

      <AllStudiesFilters onFilterChange={setFilters} monthYearOptions={monthYearOptions} />

      {/* Medical Articles Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">
            Medical Articles ({filteredArticles.length})
          </h2>
          <p className="text-sm text-slate-600">
            Clinically relevant articles ranked by importance
          </p>
        </div>
        <MedicalArticleGrid
          articles={filteredArticles}
          isLoading={isLoading}
          statusMap={articleStatuses}
          onStatusChange={handleArticleStatusChange}
          isAdmin={currentUser?.role === 'admin'}
          onArticleUpdate={handleArticleUpdate}
        />
      </div>

      {/* Regular Studies Section */}
      {filteredStudies.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">
              User Studies ({filteredStudies.length})
            </h2>
            <p className="text-sm text-slate-600">
              Studies added by users
            </p>
          </div>
          <StudyGrid
            studies={filteredStudies}
            isLoading={isLoading}
            users={users}
            statusMap={userStatuses}
            onStatusChange={handleStatusChange}
            onStudyUpdate={handleStudyUpdate}
          />
        </div>
      )}
    </div>
  );
}
