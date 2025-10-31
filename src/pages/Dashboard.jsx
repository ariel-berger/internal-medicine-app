
import React, { useState, useEffect, useMemo } from "react";
import { Study } from "@/api/entities";
import { User } from "@/api/entities";
import { UserStudyStatus } from "@/api/entities";
import { Comment } from "@/api/entities";
import { MedicalArticle } from "@/api/medicalArticles";
import { getStatusMap as getArticleStatusMap, setStatus as setArticleStatus } from "@/api/articleStatuses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { BookOpen, Search, ArrowRight, TrendingUp } from "lucide-react";
import { parseISO, getYear, getMonth, format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

import StudyGrid from "../components/dashboard/StudyGrid";
import TopStudies from "../components/dashboard/TopStudies";

export default function Dashboard() {
  const [studies, setStudies] = useState([]);
  const [medicalArticles, setMedicalArticles] = useState([]);
  const [users, setUsers] = useState({});
  const [userStatuses, setUserStatuses] = useState(new Map());
  const [articleStatuses, setArticleStatuses] = useState(new Map());
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [topThreeStudies, setTopThreeStudies] = useState([]);
  const [commentCounts, setCommentCounts] = useState({});
  const [monthYear, setMonthYear] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      console.log("Loading dashboard data...");
      
      // Try to get current user, but don't fail if not logged in
      let currentUser = null;
      try {
        currentUser = await User.me();
        console.log("Current user:", currentUser?.email || "Not logged in");
      } catch (e) {
        console.log("User not logged in, continuing without user data");
      }
      
      // Load medical articles (all relevant articles by ranking score)
      console.log("Loading medical articles...");
      try {
        const medicalArticlesData = await MedicalArticle.getRelevantArticles({ 
          limit: 50, 
          sort: 'ranking_score' 
        });
        console.log("Loaded medical articles:", medicalArticlesData.length);
        console.log("First article sample:", medicalArticlesData[0]);
        setMedicalArticles(medicalArticlesData);
        // Load persisted article statuses for dashboard
        setArticleStatuses(getArticleStatusMap());
      } catch (e) {
        console.error("Failed to load medical articles:", e);
        // If user is not logged in, try to load without authentication
        if (e.message.includes('401') || e.message.includes('403')) {
          console.log("User not authenticated, medical articles require login");
          setMedicalArticles([]);
        } else {
          throw e;
        }
      }

      // Load other data in parallel, but handle errors gracefully
      const [
        studiesData,
        currentUserStatusesData,
        allStatusesData,
        allCommentsData,
      ] = await Promise.allSettled([
          Study.list("-publication_date", 10), // Fetch only the 10 most recent studies
          currentUser ? UserStudyStatus.filter({ created_by: currentUser.email }, "-created_date") : Promise.resolve([]),
          UserStudyStatus.list("-created_date"),
          Comment.list(),
      ]);

      // Handle the results
      const studies = studiesData.status === 'fulfilled' ? studiesData.value : [];
      const userStatuses = currentUserStatusesData.status === 'fulfilled' ? currentUserStatusesData.value : [];
      const allStatuses = allStatusesData.status === 'fulfilled' ? allStatusesData.value : [];
      const comments = allCommentsData.status === 'fulfilled' ? allCommentsData.value : [];

      console.log("Loaded studies:", studies.length);
      console.log("Loaded user statuses:", userStatuses.length);
      console.log("Loaded all statuses:", allStatuses.length);
      console.log("Loaded comments:", comments.length);

      let usersData = [];
      if (currentUser && currentUser.role === 'admin') {
          try {
            usersData = await User.list();
          } catch (e) {
            console.log("Failed to load users:", e);
          }
      }

      const userMap = usersData.reduce((map, user) => {
          map[user.email] = user;
          return map;
      }, {});

      const statusMap = new Map(userStatuses.map(s => [s.study_id, s]));

      const commentCountMap = comments.reduce((acc, comment) => {
        acc[comment.study_id] = (acc[comment.study_id] || 0) + 1;
        return acc;
      }, {});
      setCommentCounts(commentCountMap);

      const readCounts = allStatuses
        .filter(s => s.status === 'read')
        .reduce((acc, s) => {
          acc[s.study_id] = (acc[s.study_id] || 0) + 1;
          return acc;
        }, {});

      let allStudiesForTrending = [];
      try {
        allStudiesForTrending = await Study.list(); // Fetch all to map trending IDs
      } catch (e) {
        console.log("Failed to load all studies for trending:", e);
      }
      const studyMap = new Map(allStudiesForTrending.map(s => [s.id, s]));

      const topThree = Object.entries(readCounts)
        .sort(([, countA], [, countB]) => countB - countA)
        .slice(0, 3) // Reduce to top 3
        .map(([studyId, count]) => ({
          ...studyMap.get(studyId),
          readCount: count
        }))
        .filter(Boolean);

      setTopThreeStudies(topThree);

      // Custom sort for dashboard: Key > Major > Recent
      studies.sort((a, b) => {
        const isAImportant = a.is_important_to_read;
        const isBImportant = b.is_important_to_read;

        const isAMajor = a.is_major_journal || a.impact_factor >= 25;
        const isBMajor = b.is_major_journal || b.impact_factor >= 25;

        // Key studies first
        if (isAImportant !== isBImportant) {
          return isAImportant ? -1 : 1;
        }

        // Then major journals
        if (isAMajor !== isBMajor) {
          return isAMajor ? -1 : 1;
        }
        
        // Otherwise, keep the default sort (by publication date from API)
        return 0;
      });

      setStudies(studies);
      setUsers(userMap);
      setUserStatuses(statusMap);
      
      console.log("Dashboard data loading completed successfully");
    } catch (e) {
      console.error("Error loading data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = (studyId, newStatusRecord) => {
    setUserStatuses(prevMap => {
      const newMap = new Map(prevMap);
      if (newStatusRecord) {
        newMap.set(studyId, newStatusRecord);
      } else {
        newMap.delete(studyId);
      }
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
    setCommentCounts(prevCounts => ({
      ...prevCounts,
      [studyId]: (prevCounts[studyId] || 0) + 1
    }));
  };

  const handleStudyUpdate = (updatedStudy) => {
    setStudies(prevStudies =>
      prevStudies.map(s => (s.id === updatedStudy.id ? updatedStudy : s))
    );
  };
  
  // Combine medical articles and regular studies for unified display
  const allStudies = useMemo(() => {
    console.log("Combining studies - Medical articles:", medicalArticles.length, "Regular studies:", studies.length);
    
    // Convert medical articles to study format for unified display
    const articlesAsStudies = medicalArticles.map(article => {
      try {
        return {
          ...article,
          // Map article fields to study fields for compatibility
          specialties: article.medical_category ? [article.medical_category] : [],
          is_important_to_read: article.ranking_score >= 7, // High ranking = key study
          is_major_journal: article.ranking_score >= 8, // Use ranking score directly instead of method
          impact_factor: article.ranking_score, // Use ranking score as impact factor
          study_type: article.article_type || 'Journal Article',
          key_findings: article.clinical_bottom_line,
          summary: article.abstract,
          primary_endpoint: null, // avoid repeating the clinical bottom line in the Abstract section
          // Keep original article fields
          isMedicalArticle: true,
          originalArticle: article
        };
      } catch (error) {
        console.error('Error mapping article:', article, error);
        return null;
      }
    }).filter(Boolean); // Remove any null entries

    // Combine with regular studies
    const combined = [...articlesAsStudies, ...studies];
    console.log("Combined studies total:", combined.length);
    return combined;
  }, [medicalArticles, studies]);

  const monthYearOptions = useMemo(() => {
    const options = new Map();
    allStudies.forEach(item => {
      const pubDate = item.publication_date;
      if (!pubDate) return;
      const date = item.isMedicalArticle ? new Date(pubDate) : parseISO(pubDate);
      const year = getYear(date);
      const month = getMonth(date);
      const key = `${year}-${month}`;
      if (!options.has(key)) {
        options.set(key, {
          value: key,
          label: format(date, 'MMMM yyyy'),
          date
        });
      }
    });
    return Array.from(options.values()).sort((a, b) => b.date - a.date);
  }, [allStudies]);

  const filteredStudies = allStudies.filter(study => {
    const lowercasedTerm = searchTerm.toLowerCase();

    const searchMatch = !searchTerm || (
      (study.title && study.title.toLowerCase().includes(lowercasedTerm)) ||
      (study.journal && study.journal.toLowerCase().includes(lowercasedTerm)) ||
      (study.medical_category && study.medical_category.toLowerCase().includes(lowercasedTerm))
    );

    let dateMatch = true;
    if (monthYear !== 'all') {
      if (!study.publication_date) dateMatch = false;
      else {
        const [y, m] = monthYear.split('-').map(Number);
        const date = study.isMedicalArticle ? new Date(study.publication_date) : parseISO(study.publication_date);
        dateMatch = getYear(date) === y && getMonth(date) === m;
      }
    }

    return searchMatch && dateMatch;
  });

  console.log("Filtered studies:", filteredStudies.length, "Search term:", searchTerm);

  // Check if user is logged in by checking if we have a token
  const isLoggedIn = localStorage.getItem('auth_token') !== null;

  console.log("Dashboard render - isLoggedIn:", isLoggedIn, "isLoading:", isLoading, "medicalArticles:", medicalArticles.length, "studies:", studies.length);
  console.log("Medical articles data:", medicalArticles);
  console.log("Studies data:", studies);

  // Merge study and article statuses so StudyGrid shows correct state for both
  const unifiedStatusMap = useMemo(() => {
    const merged = new Map();
    // Article statuses first to avoid accidental overwrite if ids collide
    for (const [k, v] of articleStatuses) merged.set(k, v);
    for (const [k, v] of userStatuses) merged.set(k, v);
    return merged;
  }, [articleStatuses, userStatuses]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">
      <div className="lg:col-span-1 space-y-6 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
        <TopStudies studies={topThreeStudies} isLoading={isLoading} />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search studies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 professional-card"
          />
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

      <div className="lg:col-span-3">
        {isLoading ? (
          <div className="professional-card rounded-xl p-8 text-center">
            <div className="text-lg">Loading dashboard...</div>
          </div>
        ) : !isLoggedIn ? (
          <div className="professional-card rounded-xl p-8 text-center">
            <div className="space-y-4">
              <div className="text-6xl">🔐</div>
              <h2 className="text-2xl font-bold text-slate-900">Login Required</h2>
              <p className="text-slate-600 max-w-md mx-auto">
                To view the latest medical studies and articles, please log in to your account.
              </p>
              <div className="flex gap-4 justify-center">
                <Link to="/login">
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    Login
                  </Button>
                </Link>
                <Link to="/login">
                  <Button variant="outline">
                    Register
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="professional-card rounded-xl p-4 lg:p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <h2 className="text-lg lg:text-xl font-bold text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-slate-600" />
                Latest Studies
              </h2>
              <div className="flex items-center gap-4">
                <div className="text-sm text-slate-600">
                  Ranked by clinical relevance
                </div>
                <Link to="/allstudies">
                  <Button variant="outline" className="w-full sm:w-auto">
                    <span>View All Studies</span>
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
            <StudyGrid studies={filteredStudies} isLoading={isLoading} users={users} statusMap={unifiedStatusMap} onStatusChange={(id, rec) => {
              // Route status changes for medical articles to local store; studies to backend
              const isArticle = medicalArticles.some(a => a.id === id);
              if (isArticle) handleArticleStatusChange(id, rec);
              else handleStatusChange(id, rec);
            }} onStudyUpdate={handleStudyUpdate} onCommentAdded={handleCommentAdded} commentCounts={commentCounts} />
          </div>
        )}
      </div>
    </div>
  );
}
