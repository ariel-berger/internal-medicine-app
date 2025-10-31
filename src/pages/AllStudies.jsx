
import React, { useState, useEffect, useMemo } from 'react';
import { Study } from '@/api/entities';
import { User } from '@/api/entities';
import { UserStudyStatus } from '@/api/entities';
import { Comment } from '@/api/entities';
import { MedicalArticle } from '@/api/medicalArticles';
import { getStatusMap as getArticleStatusMap, setStatus as setArticleStatus } from '@/api/articleStatuses';
import { Input } from "@/components/ui/input";
import { Search, SlidersHorizontal } from "lucide-react";
import { format, getYear, getMonth, startOfMonth, endOfMonth, parseISO } from 'date-fns';

import StudyGrid from '../components/dashboard/StudyGrid';
import MedicalArticleGrid from '../components/dashboard/MedicalArticleGrid';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [isMajor, setIsMajor] = useState(false);
  const [isKey, setIsKey] = useState(false);
  const [monthYear, setMonthYear] = useState('all');

  useEffect(() => {
    onFilterChange({
      specialties: selectedSpecialties,
      isMajor,
      isKey,
      monthYear
    });
  }, [selectedSpecialties, isMajor, isKey, monthYear, onFilterChange]);

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
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
        <div className="flex items-center space-x-2">
          <Checkbox id="major-journal" checked={isMajor} onCheckedChange={setIsMajor} />
          <Label htmlFor="major-journal">Major Journal</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox id="key-study" checked={isKey} onCheckedChange={setIsKey} />
          <Label htmlFor="key-study">Key Study</Label>
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
  const [commentCounts, setCommentCounts] = useState({});
  const [users, setUsers] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    specialties: new Set(SPECIALTIES),
    isMajor: false,
    isKey: false,
    monthYear: 'all'
  });

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const currentUser = await User.me();
      
      // Load medical articles (all relevant articles)
      const medicalArticlesData = await MedicalArticle.getRelevantArticles({ 
        limit: 100, // Get more articles for the all studies page
        sort: 'ranking_score' 
      });
      setMedicalArticles(medicalArticlesData);

      // Load persisted article statuses from localStorage
      setArticleStatuses(getArticleStatusMap());

      const [studies, statuses, comments] = await Promise.all([
        Study.list('-publication_date'),
        currentUser ? UserStudyStatus.filter({ created_by: currentUser.email }) : [],
        Comment.list()
      ]);
      setAllStudies(studies);
      setUserStatuses(new Map(statuses.map(s => [s.study_id, s])));
      setCommentCounts(comments.reduce((acc, comment) => {
        acc[comment.study_id] = (acc[comment.study_id] || 0) + 1;
        return acc;
      }, {}));

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

  const handleCommentAdded = (studyId) => {
    setCommentCounts(prev => ({...prev, [studyId]: (prev[studyId] || 0) + 1}));
  };

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
    return allStudies.filter(study => {
      const { specialties, isMajor, isKey, monthYear } = filters;
      
      const searchTermMatch = !searchTerm ||
        (study.title && study.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (study.journal && study.journal.toLowerCase().includes(searchTerm.toLowerCase()));

      const normalizedSelected = new Set(Array.from(specialties).map(normalizeSpecialty));
      const specialtyMatch = study.specialties && study.specialties.some(s => normalizedSelected.has(normalizeSpecialty(s)));
      const majorMatch = !isMajor || study.is_major_journal || study.impact_factor >= 25;
      const keyMatch = !isKey || study.is_important_to_read;
      
      let dateMatch = true;
      if (monthYear !== 'all') {
        if (!study.publication_date) dateMatch = false;
        else {
          const [year, month] = monthYear.split('-').map(Number);
          const studyDate = parseISO(study.publication_date);
          dateMatch = getYear(studyDate) === year && getMonth(studyDate) === month;
        }
      }

      return searchTermMatch && specialtyMatch && majorMatch && keyMatch && dateMatch;
    });
  }, [allStudies, searchTerm, filters]);

  const filteredArticles = useMemo(() => {
    return medicalArticles.filter(article => {
      const { specialties, isMajor, isKey, monthYear } = filters;
      
      const searchTermMatch = !searchTerm ||
        (article.title && article.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (article.journal && article.journal.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (article.medical_category && article.medical_category.toLowerCase().includes(searchTerm.toLowerCase()));

      const normalizedSelected = new Set(Array.from(specialties).map(normalizeSpecialty));
      const specialtyMatch = article.medical_category && normalizedSelected.has(normalizeSpecialty(article.medical_category));
      const majorMatch = !isMajor || article.isMajorJournal();
      const keyMatch = !isKey || article.ranking_score >= 7; // High ranking score = key study
      
      let dateMatch = true;
      if (monthYear !== 'all') {
        if (!article.publication_date) dateMatch = false;
        else {
          const [year, month] = monthYear.split('-').map(Number);
          const articleDate = new Date(article.publication_date);
          dateMatch = getYear(articleDate) === year && getMonth(articleDate) === month;
        }
      }

      return searchTermMatch && specialtyMatch && majorMatch && keyMatch && dateMatch;
    });
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
          onCommentAdded={handleCommentAdded}
          commentCounts={commentCounts}
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
            onCommentAdded={handleCommentAdded}
            commentCounts={commentCounts}
          />
        </div>
      )}
    </div>
  );
}
