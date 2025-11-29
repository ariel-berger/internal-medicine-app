import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Award, Calendar, Users, MapPin, ChevronDown, ChevronUp,
  Stethoscope, TrendingUp, BookOpen, Star, ExternalLink, 
  Bookmark, Library, EyeOff, Eye, CheckCircle, MessageSquare,
  Crown, Target, BarChart3, MinusCircle, PlusCircle
} from "lucide-react";
import { format } from "date-fns";
import { MedicalArticle as MedicalArticleAPI } from '@/api/medicalArticles';
import { localClient } from '@/api/localClient';
import { User as UserEntity } from '@/api/entities';
// Discussion feature removed
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  Neurology: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Other: "bg-gray-100 text-gray-700 border-gray-200"
};

const studyTypeColors = {
  RCT: "bg-emerald-100 text-emerald-700",
  "Meta-analysis": "bg-blue-100 text-blue-700",
  Review: "bg-purple-100 text-purple-700",
  Observational: "bg-orange-100 text-orange-700",
  "Case-Control": "bg-cyan-100 text-cyan-700",
  Cohort: "bg-pink-100 text-pink-700",
  "Case Report": "bg-slate-100 text-slate-700 border-slate-200",
  "Journal Article": "bg-blue-100 text-blue-700",
  "Systematic Review": "bg-purple-100 text-purple-700"
};

function ReadingStatusManager({ article, statusRecord, onStatusChange }) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleSetStatus = async (newStatus) => {
    setIsUpdating(true);
    try {
      // For now, we'll just simulate the status change
      // In a real implementation, you'd want to store this in a separate user_article_status table
      console.log(`Setting status ${newStatus} for article ${article.id}`);
      onStatusChange(article.id, { status: newStatus });
    } catch(e) {
      console.error("Failed to update status", e)
    } finally {
      setIsUpdating(false);
    }
  };

  const statusType = statusRecord?.status;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="text-slate-500 hover:text-blue-600 data-[state=open]:bg-blue-50 data-[state=open]:text-blue-600" disabled={isUpdating}>
          {statusType === 'read' && <BookOpen className="w-4 h-4 text-emerald-600" />}
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
          <BookOpen className={`w-4 h-4 mr-2 ${statusType === 'read' ? 'text-emerald-600' : ''}`} />
          <span>Mark as Read</span>
        </DropdownMenuItem>
        {statusRecord && (
          <DropdownMenuItem onClick={() => onStatusChange(article.id, null)} className="text-red-600">
            <span>Remove from Library</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function MedicalArticleCard({ article, statusRecord, onStatusChange, isAdmin = false, isSenior = false, onArticleUpdate, hideScore = false, hideTags = false, hidePublicationType = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isUpdatingImportance, setIsUpdatingImportance] = useState(false);
  const [isUpdatingHidden, setIsUpdatingHidden] = useState(false);

  const handleTrackClick = (type) => {
    if (article.id) {
      localClient.trackArticleClick(article.id, type).catch(e => console.error("Tracking failed", e));
    }
  };

  const parseTags = (tags) => {
    if (!tags) return [];
    if (Array.isArray(tags)) return tags.filter(Boolean);
    if (typeof tags === 'string') {
      // Try JSON parse first
      try {
        const parsed = JSON.parse(tags);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch (_) {}
      // Fallback: strip brackets and quotes, then split by comma
      return tags
        .replace(/^\s*\[/, '')
        .replace(/\]\s*$/, '')
        .split(',')
        .map(t => t.trim().replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, ''))
        .filter(Boolean);
    }
    return [];
  };

  // Render a collapsed version if isCollapsed is true
  if (isCollapsed) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex items-center justify-between gap-3 overflow-hidden">
        <span className="text-xs text-slate-500 italic truncate flex-1 min-w-0">
          Hidden: {article.title}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(false)}
          className="text-blue-600 hover:text-blue-800 flex-shrink-0 h-6 px-2 text-xs"
          title="Show this article"
        >
          <Eye className="w-3 h-3 mr-1" />
          Show
        </Button>
      </div>
    );
  }

  const isMajor = typeof article?.isMajorJournal === 'function'
    ? article.isMajorJournal()
    : (typeof article?.ranking_score === 'number' && article.ranking_score >= 8);
  const specialty = typeof article?.getSpecialty === 'function'
    ? article.getSpecialty()
    : (article?.medical_category ? article.medical_category.replace(/_/g, ' ') : null);
  const publicationType = article.publication_type;
  const formattedPubDate = typeof article?.getFormattedPublicationDate === 'function'
    ? article.getFormattedPublicationDate()
    : (article?.publication_date ? new Date(article.publication_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : null);

  return (
    <Card className="professional-card">
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {/* Ranking Score Badge */}
                {!hideScore && article.ranking_score && (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-semibold">
                    <Star className="w-3 h-3 mr-1.5 fill-amber-400 text-amber-600" />
                    Score: {article.ranking_score}
                  </Badge>
                )}
                {article.is_key_study && (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-semibold">
                    <Star className="w-3 h-3 mr-1.5 fill-amber-400 text-amber-600" />
                    Key Study
                  </Badge>
                )}
                
                {/* Major Journal Badge */}
                {isMajor && (
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-semibold">
                    <Award className="w-3 h-3 mr-1" />
                    Major Journal
                  </Badge>
                )}
                
                {/* Specialty Badge */}
                {specialty && (
                  <Badge 
                    variant="outline" 
                    className={specialtyColors[specialty] || "bg-slate-100 text-slate-700"}
                  >
                    <Stethoscope className="w-3 h-3 mr-1" />
                    {specialty}
                  </Badge>
                )}
                
                {/* Publication Type Badge (hide if default 'Journal Article' or missing, or if hidePublicationType is true) */}
                {!hidePublicationType && publicationType && publicationType !== 'Journal Article' && (
                  <Badge 
                    variant="outline"
                    className={studyTypeColors[publicationType] || "bg-slate-100 text-slate-700"}
                  >
                    {publicationType}
                  </Badge>
                )}
              </div>
              
              <h3 className="text-lg font-semibold text-slate-900 leading-snug mb-2">
                {article.title}
              </h3>
              
              <div className="flex flex-wrap items-center text-sm text-slate-600 gap-x-4 gap-y-1">
                {article.url ? (
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => { e.stopPropagation(); handleTrackClick('pubmed'); }}
                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>PubMed</span>
                  </a>
                ) : (
                  <a
                    href={`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(article.title)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => { e.stopPropagation(); handleTrackClick('pubmed'); }}
                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Search PubMed</span>
                  </a>
                )}
                
                {article.doi && (
                  <a
                    href={`https://doi.org/${article.doi}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => { e.stopPropagation(); handleTrackClick('doi'); }}
                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>DOI</span>
                  </a>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              {/* Hide button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsCollapsed(true)}
                className="text-slate-400 hover:text-slate-600"
                title="Hide this article"
              >
                <EyeOff className="w-4 h-4" />
              </Button>
              {(isAdmin || isSenior) && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      if (isUpdatingImportance) return;
                      setIsUpdatingImportance(true);
                      try {
                        const next = !article.is_key_study;
                        await MedicalArticleAPI.setKeyStudy(article.id, next);
                        onArticleUpdate && onArticleUpdate({ ...article, is_key_study: next });
                      } catch (e) {
                        console.error('Failed to toggle key study', e);
                      } finally {
                        setIsUpdatingImportance(false);
                      }
                    }}
                    disabled={isUpdatingImportance}
                    className="text-slate-500 hover:text-amber-500"
                    title={article.is_key_study ? 'Unmark as Key Study' : 'Mark as Key Study'}
                  >
                    <Star className={`w-4 h-4 transition-all ${article.is_key_study ? 'text-amber-400 fill-amber-400' : ''}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      if (isUpdatingHidden) return;
                      setIsUpdatingHidden(true);
                      try {
                        const next = !article.hidden_from_dashboard;
                        await MedicalArticleAPI.setHiddenFromDashboard(article.id, next);
                        onArticleUpdate && onArticleUpdate({ ...article, hidden_from_dashboard: next });
                      } catch (e) {
                        console.error('Failed to toggle hidden from dashboard', e);
                      } finally {
                        setIsUpdatingHidden(false);
                      }
                    }}
                    disabled={isUpdatingHidden}
                    className="text-slate-500 hover:text-red-500"
                    title={article.hidden_from_dashboard ? 'Show on Dashboard' : 'Hide from Dashboard'}
                  >
                    {article.hidden_from_dashboard ? (
                      <PlusCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <MinusCircle className="w-4 h-4 text-red-500" />
                    )}
                  </Button>
                </>
              )}
              
              {onStatusChange && <ReadingStatusManager article={article} statusRecord={statusRecord} onStatusChange={onStatusChange} />}
            </div>
          </div>

          {/* Article Info */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
            {article.journal && (
              <div className="flex items-center gap-1">
                <BookOpen className="w-4 h-4" />
                <span>{article.journal}</span>
              </div>
            )}
            
            {article.participants && (
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{article.participants}</span>
              </div>
            )}
            
            {formattedPubDate && (
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>{formattedPubDate}</span>
              </div>
            )}
            
            {article.pmid && (
              <div className="flex items-center gap-1">
                <Target className="w-4 h-4" />
                <span>PMID: {article.pmid}</span>
              </div>
            )}
          </div>

          {/* Clinical Bottom Line - always visible if it exists */}
          {article.clinical_bottom_line && (
            <div className="mt-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-slate-600" />
                  Clinical Bottom Line
                </h4>
                <p className="text-slate-700 leading-relaxed">{article.clinical_bottom_line}</p>
              </div>
            </div>
          )}

          {/* Show/Hide Abstract Button */}
          {article.abstract && (
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
          {isOpen && article.abstract && (
            <div className="text-slate-700 pt-2">
              {formatAbstract(article.abstract)}
            </div>
          )}

          {/* Tags */}
          {article.tags && (
            <div className="flex flex-wrap gap-2">
              {parseTags(article.tags).map((tag, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {tag.trim()}
                </Badge>
              ))}
            </div>
          )}

          {/* Discussion Section */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
            <div>
              {statusRecord?.status === 'read' && (
                <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold text-sm py-1 px-3 flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" />
                  Read
                </Badge>
              )}
              {statusRecord?.status === 'want_to_read' && (
                <Badge className="bg-blue-100 text-blue-800 border border-blue-200 font-semibold text-sm py-1 px-3">Want to Read</Badge>
              )}
            </div>
            
            {/* Discussion removed */}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
