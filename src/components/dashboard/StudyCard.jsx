
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Award, Calendar, Users, MapPin, ChevronDown, ChevronUp,
  Stethoscope, TrendingUp, BookOpen, Star, ExternalLink, User, MessageSquare, Send, Crown,
  Bookmark, Library, Trash2, Book, CheckCircle, EyeOff, Eye
} from "lucide-react";
import { format } from "date-fns";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UserStudyStatus } from "@/api/entities";
import { Skeleton } from '@/components/ui/skeleton';
import { User as UserEntity } from '@/api/entities'; // Renamed to avoid conflict with lucide-react User
import { Study } from '@/api/entities';
import { MedicalArticle } from '@/api/medicalArticles';
import { setStatus as setArticleStatus } from '@/api/articleStatuses';
import { formatAbstract } from '@/utils/formatAbstract.jsx';

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

const studyTypeColors = {
  RCT: "bg-emerald-100 text-emerald-700",
  "Meta-analysis": "bg-blue-100 text-blue-700",
  Review: "bg-purple-100 text-purple-700",
  Observational: "bg-orange-100 text-orange-700",
  "Case-Control": "bg-cyan-100 text-cyan-700",
  Cohort: "bg-pink-100 text-pink-700",
  "Case Report": "bg-slate-100 text-slate-700 border-slate-200"
};

function ReadingStatusManager({ study, statusRecord, onStatusChange }) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleSetStatus = async (newStatus) => {
    setIsUpdating(true);
    try {
      if (study.isMedicalArticle) {
        // Persist locally for medical articles
        if (statusRecord && statusRecord.status === newStatus) {
          setArticleStatus(study.id, null);
          onStatusChange(study.id, null);
        } else {
          setArticleStatus(study.id, newStatus);
          onStatusChange(study.id, { status: newStatus });
        }
      } else {
        // Backend persistence for user-added studies
        if (statusRecord) {
          if (statusRecord.status === newStatus) {
            await UserStudyStatus.delete(statusRecord.id);
            onStatusChange(study.id, null);
          } else {
            const updatedRecord = await UserStudyStatus.update(statusRecord.id, { status: newStatus });
            onStatusChange(study.id, updatedRecord);
          }
        } else {
          const newRecord = await UserStudyStatus.create({ study_id: study.id, status: newStatus });
          onStatusChange(study.id, newRecord);
        }
      }
    } catch(e) {
      console.error("Failed to update status", e)
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveStatus = async () => {
    if (!statusRecord) return;
    setIsUpdating(true);
    try {
      if (study.isMedicalArticle) {
        setArticleStatus(study.id, null);
        onStatusChange(study.id, null);
      } else {
        await UserStudyStatus.delete(statusRecord.id);
        onStatusChange(study.id, null);
      }
    } catch (e) {
      console.error("Failed to remove status", e);
    } finally {
      setIsUpdating(false);
    }
  };

  const statusType = statusRecord?.status;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="text-slate-500 hover:text-blue-600 data-[state=open]:bg-blue-50 data-[state=open]:text-blue-600" disabled={isUpdating}>
          {statusType === 'read' && <Book className="w-4 h-4 text-emerald-600" />}
          {statusType === 'want_to_read' && <Bookmark className="w-4 h-4 text-blue-600" />}
          {!statusType && <Bookmark className="w-4 h-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleSetStatus('want_to_read')}>
          <Bookmark className={`w-4 h-4 mr-2 ${statusType === 'want_to_read' ? 'text-blue-600' : ''}`} />
          <span>Want to Read</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleSetStatus('read')}>
          <Book className={`w-4 h-4 mr-2 ${statusType === 'read' ? 'text-emerald-600' : ''}`} />
          <span>Mark as Read</span>
        </DropdownMenuItem>
        {statusRecord && (
          <DropdownMenuItem onClick={handleRemoveStatus} className="text-red-600">
            <Trash2 className="w-4 h-4 mr-2" />
            <span>Remove from Library</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


export default function StudyCard({ study, creator, statusRecord, onStatusChange, onStudyUpdate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false); // New state for collapsing
  const [currentUser, setCurrentUser] = useState(null);
  const [isUpdatingImportance, setIsUpdatingImportance] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
        try {
            const user = await UserEntity.me(); // Use UserEntity to avoid conflict
            setCurrentUser(user);
        } catch(e) {
            console.error("Failed to fetch current user", e);
        }
    };
    fetchUser();
  }, []);

  // Discussion removed

  const handleToggleImportant = async () => {
    if (!onStudyUpdate) return; // Guard against pages that don't support this
    
    setIsUpdatingImportance(true);
    try {
        const updatedImportantStatus = !study.is_important_to_read;
        if (study.isMedicalArticle) {
          await MedicalArticle.setKeyStudy(study.id, updatedImportantStatus);
        } else {
          await Study.update(study.id, { is_important_to_read: updatedImportantStatus });
        }
        const updatedStudyData = { ...study, is_important_to_read: updatedImportantStatus };
        onStudyUpdate(updatedStudyData);
    } catch(e) {
        console.error("Failed to update importance", e);
    } finally {
        setIsUpdatingImportance(false);
    }
  };

  // Render a collapsed version if isCollapsed is true
  if (isCollapsed) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex items-center justify-between gap-3 overflow-hidden">
        <span className="text-xs text-slate-500 italic truncate flex-1 min-w-0">
          Hidden: {study.title}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(false)}
          className="text-blue-600 hover:text-blue-800 flex-shrink-0 h-6 px-2 text-xs"
          title="Show this study"
        >
          <Eye className="w-3 h-3 mr-1" />
          Show
        </Button>
      </div>
    );
  }

  const isMajor = study.is_major_journal || study.impact_factor >= 25;
  
  // Discussion removed

  return (
    <Card className="professional-card">
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {/* Ranking Score Badge for Medical Articles */}
                {study.isMedicalArticle && study.ranking_score && (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-semibold">
                    <Star className="w-3 h-3 mr-1.5 fill-amber-400 text-amber-600" />
                    Score: {study.ranking_score}
                  </Badge>
                )}
                {study.is_important_to_read && (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-semibold">
                    <Star className="w-3 h-3 mr-1.5 fill-amber-400 text-amber-600" />
                    Key Study
                  </Badge>
                )}
                {isMajor && (
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-semibold">
                    <Award className="w-3 h-3 mr-1" />
                    Major Journal
                  </Badge>
                )}
                {study.specialties?.map(specialty => (
                  <Badge 
                    key={specialty}
                    variant="outline" 
                    className={specialtyColors[specialty] || "bg-slate-100 text-slate-700"}
                  >
                    <Stethoscope className="w-3 h-3 mr-1" />
                    {specialty?.replace(/_/g, ' ')}
                  </Badge>
                ))}
                {/* Study Type Badge (hide if default 'Journal Article' or missing) */}
                {study.study_type && study.study_type !== 'Journal Article' && (
                  <Badge 
                    variant="outline"
                    className={studyTypeColors[study.study_type] || "bg-slate-100 text-slate-700"}
                  >
                    {study.study_type}
                  </Badge>
                )}
              </div>
              <h3 className="text-lg font-semibold text-slate-900 leading-snug mb-2">
                {study.title}
              </h3>
              <div className="flex flex-wrap items-center text-sm text-slate-600 gap-x-4 gap-y-1">
                {study.url ? (
                  <a
                    href={study.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>PubMed</span>
                  </a>
                ) : (
                  <a
                    href={`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(study.title)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Search PubMed</span>
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
                {/* New Hide button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsCollapsed(true)}
                  className="text-slate-400 hover:text-slate-600"
                  title="Hide this study"
                >
                  <EyeOff className="w-4 h-4" />
                </Button>
                {currentUser?.role === 'admin' && (
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={handleToggleImportant}
                        disabled={isUpdatingImportance}
                        className="text-slate-500 hover:text-amber-500"
                        title={study.is_important_to_read ? 'Unmark as Key Study' : 'Mark as Key Study'}
                    >
                        <Star className={`w-4 h-4 transition-all ${study.is_important_to_read ? 'text-amber-400 fill-amber-400' : ''}`} />
                    </Button>
                )}
                {onStatusChange && <ReadingStatusManager study={study} statusRecord={statusRecord} onStatusChange={onStatusChange} />}
            </div>
          </div>

          {/* Study Info */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
            {study.country && (
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                <span>{study.country}</span>
              </div>
            )}
            {study.sample_size && (
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{study.sample_size.toLocaleString()} participants</span>
              </div>
            )}
            {study.number_of_trials && (
              <div className="flex items-center gap-1">
                <Library className="w-4 h-4" />
                <span>{study.number_of_trials} trials</span>
              </div>
            )}
            {study.publication_date && (
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>{format(new Date(study.publication_date), "MMM d, yyyy")}</span>
              </div>
            )}
            {study.isMedicalArticle && study.pmid && (
              <div className="flex items-center gap-1">
                <BookOpen className="w-4 h-4" />
                <span>PMID: {study.pmid}</span>
              </div>
            )}
          </div>

          {/* Key Findings - always visible if it exists */}
          {study.key_findings && (
            <div className="mt-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-slate-600" />
                  {study.isMedicalArticle ? 'Clinical Bottom Line' : 'Key Clinical Findings'}
                </h4>
                <p className="text-slate-700 leading-relaxed">{study.key_findings}</p>
              </div>
            </div>
          )}

          {/* Show/Hide Abstract Button */}
          {(study.summary || study.primary_endpoint) && (
            <div className="flex justify-start pt-4">
              <Button
                variant="ghost"
                onClick={() => setIsOpen(!isOpen)}
                className="justify-start p-0 h-auto text-blue-600 hover:text-blue-800"
              >
                <span className="font-medium flex items-center">
                  {isOpen ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
                  {isOpen ? 'Hide Abstract' : 'Show Abstract'}
                </span>
              </Button>
            </div>
          )}

          {/* Abstract - conditionally visible */}
          {isOpen && (study.summary || study.primary_endpoint) && (
            <div className="text-slate-700 pt-2">
              {study.primary_endpoint && (
                <div className="mb-4">
                  <span className="font-semibold text-blue-700 flex items-center gap-1 mb-1">
                    <BookOpen className="w-4 h-4" /> Primary Endpoint:
                  </span>
                  <p className="leading-relaxed">{study.primary_endpoint}</p>
                </div>
              )}
              {study.summary && (
                <div>
                  {formatAbstract(study.summary)}
                </div>
              )}
            </div>
          )}

          {/* Discussion removed */}
        </div>
      </CardContent>
    </Card>
  );
}
