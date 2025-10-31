import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Award, Calendar, Users, MapPin, ChevronDown, ChevronUp,
  Stethoscope, TrendingUp, BookOpen, Star, ExternalLink, 
  Bookmark, Library, EyeOff, Eye, CheckCircle, MessageSquare,
  Crown, Target, BarChart3
} from "lucide-react";
import { format } from "date-fns";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
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

export default function MedicalArticleCard({ article, statusRecord, onStatusChange, onCommentAdded, commentCount = 0 }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

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

  const isMajor = article.isMajorJournal();
  const specialty = article.getSpecialty();
  const publicationType = article.publication_type;
  
  const displayCommentCount = commentCount > 5 ? "5+" : commentCount;

  return (
    <Card className="professional-card">
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {/* Ranking Score Badge */}
                {article.ranking_score && (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-semibold">
                    <Star className="w-3 h-3 mr-1.5 fill-amber-400 text-amber-600" />
                    Score: {article.ranking_score}
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
                
                {/* Publication Type Badge (hide if default 'Journal Article' or missing) */}
                {publicationType && publicationType !== 'Journal Article' && (
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
                    onClick={(e) => e.stopPropagation()}
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
                    onClick={(e) => e.stopPropagation()}
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
                    onClick={(e) => e.stopPropagation()}
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
            
            {article.publication_date && (
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>{article.getFormattedPublicationDate()}</span>
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
              {article.tags.split(',').map((tag, index) => (
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
            
            <HoverCard>
              <HoverCardTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 text-slate-600 hover:text-slate-900 px-2">
                  <MessageSquare className="w-4 h-4" />
                  <span>Discuss</span>
                  {commentCount > 0 && (
                    <Badge variant="secondary" className="px-1.5">{displayCommentCount}</Badge>
                  )}
                </Button>
              </HoverCardTrigger>
              <HoverCardContent className="w-[90vw] max-w-sm" side="top" align="end">
                <div className="flex flex-col h-full max-h-[50vh]">
                  <div className="space-y-1 mb-4">
                    <h4 className="font-semibold">Discussion</h4>
                    <p className="text-sm text-muted-foreground">
                      Share your thoughts on this article.
                    </p>
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto pr-2 pb-2">
                    <p className="text-sm text-slate-500 text-center py-4">Discussion feature coming soon!</p>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
