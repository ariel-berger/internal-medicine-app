
import React, { useState, useEffect, useMemo } from "react";
import { Study } from "@/api/entities";
import { User } from "@/api/entities";
import { UserStudyStatus } from "@/api/entities";
// Comments feature removed
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
import MedicalArticleGrid from "../components/dashboard/MedicalArticleGrid";
import TopStudies from "../components/dashboard/TopStudies";

export default function Dashboard() {
  const [studies, setStudies] = useState([]);
  const [medicalArticles, setMedicalArticles] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState({});
  const [userStatuses, setUserStatuses] = useState(new Map());
  const [articleStatuses, setArticleStatuses] = useState(new Map());
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [topThreeStudies, setTopThreeStudies] = useState([]);
  // Comments feature removed
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
        setCurrentUser(currentUser);
        console.log("Current user:", currentUser?.email || "Not logged in");
      } catch (e) {
        console.log("User not logged in, continuing without user data");
      }
      
      // Load medical articles (all relevant articles by ranking score, excluding hidden ones for dashboard)
      console.log("Loading medical articles...");
      let medicalArticlesData = [];
      try {
        medicalArticlesData = await MedicalArticle.getRelevantArticles({ 
          limit: 50, 
          sort: 'ranking_score',
          excludeHidden: true  // Exclude hidden articles from dashboard
        });
        console.log("Loaded medical articles:", medicalArticlesData.length);
        console.log("First article sample:", medicalArticlesData[0]);
        setMedicalArticles(medicalArticlesData);
      } catch (e) {
        console.error("Failed to load medical articles:", e);
        // If user is not logged in, try to load without authentication
        if (e.message.includes('401') || e.message.includes('403')) {
          console.log("User not authenticated, medical articles require login");
          setMedicalArticles([]);
          medicalArticlesData = [];
        } else {
          throw e;
        }
      }

      // Load other data in parallel, but handle errors gracefully
      const [
        studiesData,
        currentUserStatusesData,
        allStatusesData,
      ] = await Promise.allSettled([
          Study.list("-publication_date", 10), // Fetch only the 10 most recent studies
          currentUser ? UserStudyStatus.filter({ created_by: currentUser.email }, "-created_date") : Promise.resolve([]),
          UserStudyStatus.list("-created_date"),
      ]);

      // Handle the results
      const studies = studiesData.status === 'fulfilled' ? studiesData.value : [];
      const userStatuses = currentUserStatusesData.status === 'fulfilled' ? currentUserStatusesData.value : [];
      const allStatuses = allStatusesData.status === 'fulfilled' ? allStatusesData.value : [];
      // Comments removed

      console.log("Loaded studies:", studies.length);
      console.log("Loaded user statuses:", userStatuses.length);
      console.log("Loaded all statuses:", allStatuses.length);
      console.log("Sample status record:", allStatuses[0]);
      console.log("Statuses with article_id:", allStatuses.filter(s => s.article_id).length);
      console.log("Statuses with study_id:", allStatuses.filter(s => s.study_id).length);
      // console.log("Loaded comments:", comments.length);

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
      
      // Load article statuses: merge backend statuses with local storage for backward compatibility
      const localArticleStatuses = getArticleStatusMap();
      const backendArticleStatuses = new Map(
        userStatuses
          .filter(s => s.article_id) // Filter for medical article statuses
          .map(s => [s.article_id, s])
      );
      
      // Sync localStorage data to backend (one-time migration)
      // This ensures data persists across deployments
      if (currentUser && localArticleStatuses.size > 0) {
        const syncPromises = [];
        for (const [articleId, localStatus] of localArticleStatuses) {
          // Only sync if not already in backend
          if (!backendArticleStatuses.has(articleId) && localStatus?.status) {
            syncPromises.push(
              UserStudyStatus.create({ 
                article_id: articleId, 
                status: localStatus.status 
              }).catch(e => {
                console.log(`Failed to sync article ${articleId} to backend:`, e);
                return null;
              })
            );
          }
        }
        if (syncPromises.length > 0) {
          console.log(`Syncing ${syncPromises.length} article statuses from localStorage to backend...`);
          const syncedStatuses = await Promise.allSettled(syncPromises);
          const successful = syncedStatuses.filter(s => s.status === 'fulfilled' && s.value).length;
          console.log(`Successfully synced ${successful} article statuses to backend`);
          
          // Reload user statuses after sync
          try {
            const updatedUserStatuses = await UserStudyStatus.filter({ created_by: currentUser.email }, "-created_date");
            const updatedBackendArticleStatuses = new Map(
              updatedUserStatuses
                .filter(s => s.article_id)
                .map(s => [s.article_id, s])
            );
            // Merge with local (backend takes precedence now)
            const mergedArticleStatuses = new Map(localArticleStatuses);
            for (const [articleId, status] of updatedBackendArticleStatuses) {
              mergedArticleStatuses.set(articleId, status);
            }
            setArticleStatuses(mergedArticleStatuses);
          } catch (e) {
            console.error("Failed to reload statuses after sync:", e);
            // Fallback to original merge
            const mergedArticleStatuses = new Map(localArticleStatuses);
            for (const [articleId, status] of backendArticleStatuses) {
              mergedArticleStatuses.set(articleId, status);
            }
            setArticleStatuses(mergedArticleStatuses);
          }
        } else {
          // No sync needed, just merge
          const mergedArticleStatuses = new Map(localArticleStatuses);
          for (const [articleId, status] of backendArticleStatuses) {
            mergedArticleStatuses.set(articleId, status);
          }
          setArticleStatuses(mergedArticleStatuses);
        }
      } else {
        // No user or no local data, just merge
        const mergedArticleStatuses = new Map(localArticleStatuses);
        for (const [articleId, status] of backendArticleStatuses) {
          mergedArticleStatuses.set(articleId, status);
        }
        setArticleStatuses(mergedArticleStatuses);
      }

      // Comments removed

      // Count library additions (both "read" and "want_to_read" statuses) for both studies and articles
      const libraryCounts = allStatuses
        .filter(s => s.status === 'read' || s.status === 'want_to_read')
        .reduce((acc, s) => {
          // Count by study_id for regular studies
          if (s.study_id) {
            acc[`study_${s.study_id}`] = (acc[`study_${s.study_id}`] || 0) + 1;
          }
          // Count by article_id for medical articles
          if (s.article_id) {
            acc[`article_${s.article_id}`] = (acc[`article_${s.article_id}`] || 0) + 1;
          }
          return acc;
        }, {});
      
      console.log("Library counts:", libraryCounts);
      console.log("Article counts:", Object.keys(libraryCounts).filter(k => k.startsWith('article_')).length);
      console.log("Study counts:", Object.keys(libraryCounts).filter(k => k.startsWith('study_')).length);

      // Fetch all studies for mapping
      let allStudiesForTrending = [];
      try {
        allStudiesForTrending = await Study.list(); // Fetch all to map trending IDs
      } catch (e) {
        console.log("Failed to load all studies for trending:", e);
      }
      const studyMap = new Map(allStudiesForTrending.map(s => [s.id, s]));
      
      // Create a map of medical articles by ID
      const articleMap = new Map(medicalArticlesData.map(a => [a.id, a]));

      // Combine studies and articles with their library counts
      const trendingItems = [];
      
      // Add regular studies
      Object.entries(libraryCounts)
        .filter(([key]) => key.startsWith('study_'))
        .forEach(([key, count]) => {
          const studyId = parseInt(key.replace('study_', ''));
          const study = studyMap.get(studyId);
          if (study) {
            trendingItems.push({
              ...study,
              libraryCount: count,
              isMedicalArticle: false
            });
          }
        });
      
      // Add medical articles
      Object.entries(libraryCounts)
        .filter(([key]) => key.startsWith('article_'))
        .forEach(([key, count]) => {
          const articleId = parseInt(key.replace('article_', ''));
          const article = articleMap.get(articleId);
          if (article) {
            // Convert article to study format for compatibility
            trendingItems.push({
              ...article,
              title: article.title,
              url: article.url || article.doi ? `https://doi.org/${article.doi}` : null,
              libraryCount: count,
              isMedicalArticle: true
            });
          }
        });

      // Sort by library count (descending) and take top 2
      // Prioritize articles (medical articles) over regular studies if counts are equal
      const topTwo = trendingItems
        .sort((a, b) => {
          // First sort by library count
          if (b.libraryCount !== a.libraryCount) {
            return b.libraryCount - a.libraryCount;
          }
          // If counts are equal, prioritize medical articles
          if (a.isMedicalArticle !== b.isMedicalArticle) {
            return a.isMedicalArticle ? -1 : 1;
          }
          return 0;
        })
        .slice(0, 2)
        .map(item => ({
          ...item,
          readCount: item.libraryCount // Keep readCount for backward compatibility with TopStudies component
        }));

      console.log("Top two trending items:", topTwo);
      setTopThreeStudies(topTwo);

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
  
  // Comments removed

  const handleArticleUpdate = (updatedArticle) => {
    setMedicalArticles(prev => prev.map(a => (a.id === updatedArticle.id ? { ...a, ...updatedArticle } : a)));
  };

  const sortedArticles = useMemo(() => {
    const getScore = (item) => (typeof item.ranking_score === 'number' ? item.ranking_score : -Infinity);
    const key = [];
    const nonKey = [];
    for (const a of medicalArticles) {
      (a.is_key_study ? key : nonKey).push(a);
    }
    key.sort((a, b) => getScore(b) - getScore(a));
    nonKey.sort((a, b) => getScore(b) - getScore(a));
    return [...key, ...nonKey];
  }, [medicalArticles]);

  const handleStudyUpdate = (updatedStudy) => {
    if (updatedStudy?.isMedicalArticle) {
      setMedicalArticles(prevArticles =>
        prevArticles.map(a => (a.id === updatedStudy.id ? { ...a, is_key_study: updatedStudy.is_important_to_read } : a))
      );
    } else {
      setStudies(prevStudies =>
        prevStudies.map(s => (s.id === updatedStudy.id ? updatedStudy : s))
      );
    }
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
          is_important_to_read: article.is_key_study === true,
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

  const filteredStudies = useMemo(() => {
    return allStudies.filter(study => {
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
  }, [allStudies, searchTerm, monthYear]);

  console.log("Filtered studies:", filteredStudies.length, "Search term:", searchTerm);

  // Get filtered medical articles from filteredStudies
  const filteredAndSortedArticles = useMemo(() => {
    // Extract only medical articles from filteredStudies
    const filteredMedicalArticles = filteredStudies
      .filter(study => study.isMedicalArticle === true)
      .map(study => study.originalArticle || study); // Use original article if available
    
    const getScore = (item) => (typeof item.ranking_score === 'number' ? item.ranking_score : -Infinity);
    const key = [];
    const nonKey = [];
    for (const a of filteredMedicalArticles) {
      (a.is_key_study ? key : nonKey).push(a);
    }
    key.sort((a, b) => getScore(b) - getScore(a));
    nonKey.sort((a, b) => getScore(b) - getScore(a));
    return [...key, ...nonKey];
  }, [filteredStudies]);

  const topTenArticles = useMemo(() => filteredAndSortedArticles.slice(0, 10), [filteredAndSortedArticles]);

  // Reorder: key studies first (by score desc), then others (by score desc), take top 10
  const topTenByScore = useMemo(() => {
    const getScore = (item) => (typeof item.ranking_score === 'number' ? item.ranking_score : -Infinity);
    const key = [];
    const nonKey = [];
    for (const s of filteredStudies) {
      (s.is_important_to_read ? key : nonKey).push(s);
    }
    key.sort((a, b) => getScore(b) - getScore(a));
    nonKey.sort((a, b) => getScore(b) - getScore(a));
    return [...key, ...nonKey].slice(0, 10);
  }, [filteredStudies]);

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
                Top Medical Articles
              </h2>
              <div className="flex items-center gap-4">
                <div className="text-sm text-slate-600">
                  Key studies first, then by score
                </div>
                <Link to="/allstudies">
                  <Button variant="outline" className="w-full sm:w-auto">
                    <span>View All Studies</span>
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
            <MedicalArticleGrid
              articles={topTenArticles}
              isLoading={isLoading}
              statusMap={articleStatuses}
              onStatusChange={handleArticleStatusChange}
              isAdmin={currentUser?.role === 'admin'}
              onArticleUpdate={handleArticleUpdate}
            />
          </div>
        )}
      </div>
    </div>
  );
}
