
import React, { useState, useEffect, useMemo } from 'react';
import { User } from '@/api/entities';
import { Study } from '@/api/entities';
import { UserStudyStatus } from '@/api/entities';
import { MedicalArticle } from '@/api/medicalArticles';
import { getStatusMap as getArticleStatusMap, setStatus as setArticleStatus } from '@/api/articleStatuses';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Book, Bookmark, Search, CheckCircle, Stethoscope, BookOpen } from 'lucide-react';
import StudyGrid from '../components/dashboard/StudyGrid';
import MedicalArticleGrid from '../components/dashboard/MedicalArticleGrid';
import { subDays, isAfter } from 'date-fns';

export default function MyLibrary() {
  const [user, setUser] = useState(null);
  const [studies, setStudies] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [articles, setArticles] = useState([]);
  const [articleStatuses, setArticleStatuses] = useState(new Map());
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [personalStats, setPersonalStats] = useState({ readThisMonth: 0, topSpecialty: '' });

  useEffect(() => {
    loadLibraryData();
  }, []);

  const loadLibraryData = async () => {
    setIsLoading(true);
    try {
      const currentUser = await User.me();
      setUser(currentUser);

      const [userStatuses, allStudies, relevantArticles] = await Promise.all([
        UserStudyStatus.filter({ created_by: currentUser.email }),
        Study.list('-publication_date'),
        MedicalArticle.getRelevantArticles({ limit: 200, sort: 'ranking_score' })
      ]);
      
      const statusMap = new Map(userStatuses.map(s => [s.study_id, s]));
      const libraryStudyIds = new Set(userStatuses.map(s => s.study_id));
      const libraryStudies = allStudies.filter(study => libraryStudyIds.has(study.id));
      
      // Calculate personal reading stats
      const readStatuses = userStatuses.filter(s => s.status === 'read');
      const thirtyDaysAgo = subDays(new Date(), 30);
      
      const readThisMonth = readStatuses.filter(s => {
        if (!s.updated_date) return false;
        try {
          return isAfter(new Date(s.updated_date), thirtyDaysAgo);
        } catch (e) {
          return false;
        }
      }).length;

      const readStudyIds = readStatuses.map(s => s.study_id);
      const readStudiesList = allStudies.filter(study => readStudyIds.includes(study.id));
      const specialtyCount = {};
      
      readStudiesList.forEach(study => {
        if (study.specialties && study.specialties.length > 0) {
          study.specialties.forEach(specialty => {
            specialtyCount[specialty] = (specialtyCount[specialty] || 0) + 1;
          });
        }
      });
      
      let topSpecialty = '';
      const specialtyEntries = Object.entries(specialtyCount);
      if (specialtyEntries.length > 0) {
        topSpecialty = specialtyEntries.reduce((a, b) => 
          a[1] > b[1] ? a : b
        )[0];
      }

      setPersonalStats({ 
        readThisMonth, 
        topSpecialty: topSpecialty.replace(/_/g, ' ') 
      });

      libraryStudies.sort((a, b) => {
        const dateA = a.publication_date ? new Date(a.publication_date) : null;
        const dateB = b.publication_date ? new Date(b.publication_date) : null;
        if (dateB === null) return -1;
        if (dateA === null) return 1;
        return dateB.getTime() - dateA.getTime();
      });

      setStatuses(statusMap);
      setStudies(libraryStudies);

      // Load medical article statuses from backend (filter by article_id)
      const backendArticleStatuses = new Map(
        userStatuses
          .filter(s => s.article_id) // Filter for medical article statuses
          .map(s => [s.article_id, s])
      );
      
      // Load from localStorage for backward compatibility and migration
      const localArticleStatuses = getArticleStatusMap();
      
      // Sync localStorage data to backend (one-time migration)
      if (localArticleStatuses.size > 0) {
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
          await Promise.allSettled(syncPromises);
          
          // Reload user statuses after sync
          try {
            const updatedUserStatuses = await UserStudyStatus.filter({ created_by: currentUser.email });
            const updatedBackendArticleStatuses = new Map(
              updatedUserStatuses
                .filter(s => s.article_id)
                .map(s => [s.article_id, s])
            );
            setArticleStatuses(updatedBackendArticleStatuses);
          } catch (e) {
            console.error("Failed to reload statuses after sync:", e);
            // Fallback to original backend statuses
            setArticleStatuses(backendArticleStatuses);
          }
        } else {
          // No sync needed, use backend statuses
          setArticleStatuses(backendArticleStatuses);
        }
      } else {
        // No local storage, use backend statuses
        setArticleStatuses(backendArticleStatuses);
      }
      
      setArticles(relevantArticles);
    } catch (error) {
      console.error("Error loading library data:", error);
    }
    setIsLoading(false);
  };
  
  const handleStatusChange = () => {
    loadLibraryData();
  };

  const handleArticleStatusChange = async (articleId, newStatusRecord) => {
    // Update local storage for backward compatibility
    if (newStatusRecord) {
      setArticleStatus(articleId, newStatusRecord.status);
    } else {
      setArticleStatus(articleId, null);
    }
    
    // Save to backend for cross-device sync
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
            setArticleStatuses(prevMap => {
              const newMap = new Map(prevMap);
              newMap.delete(articleId);
              return newMap;
            });
          } catch (e) {
            console.log("Failed to delete from backend (may not exist):", e);
            // Still update local state
            setArticleStatuses(prevMap => {
              const newMap = new Map(prevMap);
              newMap.delete(articleId);
              return newMap;
            });
          }
        } else {
          // No backend record, just update local state
          setArticleStatuses(prevMap => {
            const newMap = new Map(prevMap);
            newMap.delete(articleId);
            return newMap;
          });
        }
      }
    } catch (error) {
      console.error("Error updating article status:", error);
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

  const handleStudyUpdate = (updatedStudy) => {
    setStudies(prevStudies => 
      prevStudies.map(s => (s.id === updatedStudy.id ? updatedStudy : s))
    );
  };

  const filteredStudies = studies.filter(study => {
    if (!searchTerm) return true;
    const lowercasedTerm = searchTerm.toLowerCase();
    return (
      (study.title && study.title.toLowerCase().includes(lowercasedTerm)) ||
      (study.journal && study.journal.toLowerCase().includes(lowercasedTerm)) ||
      (study.summary && study.summary.toLowerCase().includes(lowercasedTerm)) ||
      (study.key_findings && study.key_findings.toLowerCase().includes(lowercasedTerm))
    );
  });

  const wantToReadStudies = filteredStudies.filter(s => statuses.get(s.id)?.status === 'want_to_read');
  const readStudies = filteredStudies.filter(s => statuses.get(s.id)?.status === 'read');

  const [wantToReadArticles, readArticles] = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = (a) => !term ||
      (a.title && a.title.toLowerCase().includes(term)) ||
      (a.journal && a.journal.toLowerCase().includes(term));

    const want = articles.filter(a => articleStatuses.get(a.id)?.status === 'want_to_read' && matchesSearch(a));
    const readA = articles.filter(a => articleStatuses.get(a.id)?.status === 'read' && matchesSearch(a));
    return [want, readA];
  }, [articles, articleStatuses, searchTerm]);

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">My Library</h1>
          <p className="text-slate-600 text-lg">Your personal collection of saved and read studies.</p>
           {(personalStats.readThisMonth > 0 || personalStats.topSpecialty) && (
              <div className="flex flex-wrap gap-4 mt-4">
                {personalStats.readThisMonth > 0 && (
                  <div className="flex items-center gap-2 text-sm bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full">
                    <BookOpen className="w-4 h-4" />
                    <span>{personalStats.readThisMonth} studies read this month</span>
                  </div>
                )}
                {personalStats.topSpecialty && (
                  <div className="flex items-center gap-2 text-sm bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full">
                    <Stethoscope className="w-4 h-4" />
                    <span>Leading focus: {personalStats.topSpecialty}</span>
                  </div>
                )}
              </div>
            )}
        </div>
        
        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input 
            placeholder="Search your library..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 professional-card"
          />
        </div>

        {wantToReadStudies.length > 0 || readStudies.length > 0 ? (
          <Tabs defaultValue={wantToReadStudies.length > 0 ? "want_to_read" : "read"} className="w-full">
            <TabsList className="grid w-full grid-cols-2 md:w-96">
              <TabsTrigger value="want_to_read" className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-slate-600" />
                Want to Read ({wantToReadStudies.length})
              </TabsTrigger>
              <TabsTrigger value="read" className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                Read ({readStudies.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="want_to_read" className="mt-6">
              {wantToReadStudies.length > 0 ? (
                <StudyGrid 
                  studies={wantToReadStudies} 
                  isLoading={isLoading} 
                  users={{}}
                  statusMap={statuses}
                  onStatusChange={handleStatusChange}
                  onStudyUpdate={handleStudyUpdate}
                />
              ) : null}
            </TabsContent>
            <TabsContent value="read" className="mt-6">
              {readStudies.length > 0 ? (
                <StudyGrid 
                  studies={readStudies} 
                  isLoading={isLoading} 
                  users={{}}
                  statusMap={statuses}
                  onStatusChange={handleStatusChange}
                  onStudyUpdate={handleStudyUpdate}
                />
              ) : null}
            </TabsContent>
          </Tabs>
        ) : null}

        {/* Saved Medical Articles */}
        <div className="mt-12 space-y-6">
          <h2 className="text-2xl font-semibold text-slate-900">Saved Medical Articles</h2>
          <div className="space-y-10">
            <div>
              <h3 className="text-lg font-medium text-slate-800 mb-3">Want to Read ({wantToReadArticles.length})</h3>
              <MedicalArticleGrid
                articles={wantToReadArticles}
                isLoading={isLoading}
                statusMap={articleStatuses}
                onStatusChange={handleArticleStatusChange}
                commentCounts={{}}
              />
            </div>
            <div>
              <h3 className="text-lg font-medium text-slate-800 mb-3">Read ({readArticles.length})</h3>
              <MedicalArticleGrid
                articles={readArticles}
                isLoading={isLoading}
                statusMap={articleStatuses}
                onStatusChange={handleArticleStatusChange}
                commentCounts={{}}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
