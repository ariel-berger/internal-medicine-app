import React, { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { MedicalArticle as MedicalArticleAPI } from '@/api/medicalArticles';

export default function ArticleDiscussion({ articleId, onCountChange }) {
  const [comments, setComments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const updateComments = (next) => {
    setComments(next);
    onCountChange && onCountChange(next.length);
  };

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    MedicalArticleAPI.getComments(articleId)
      .then((data) => {
        if (cancelled) return;
        updateComments(data);
        setError(null);
      })
      .catch((e) => {
        console.error('Failed to load comments', e);
        if (!cancelled) setError('Could not load comments. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  const handlePost = async () => {
    const content = draft.trim();
    if (!content || isPosting) return;
    setIsPosting(true);
    try {
      const comment = await MedicalArticleAPI.addComment(articleId, content);
      updateComments([...comments, comment]);
      setDraft('');
      setError(null);
    } catch (e) {
      console.error('Failed to add comment', e);
      setError('Could not post your comment. Please try again.');
    } finally {
      setIsPosting(false);
    }
  };

  const handleDelete = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return;
    setDeletingId(commentId);
    try {
      await MedicalArticleAPI.deleteComment(commentId);
      updateComments(comments.filter((c) => c.id !== commentId));
      setError(null);
    } catch (e) {
      console.error('Failed to delete comment', e);
      setError('Could not delete the comment. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handlePost();
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading comments...
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-slate-500">No comments yet. Start the discussion.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li key={comment.id} className="bg-white border border-slate-200 rounded-md p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm min-w-0">
                  <span className="font-semibold text-slate-800">{comment.author_name}</span>
                  {comment.created_date && (
                    <span className="text-slate-500 ml-2 text-xs">
                      {format(new Date(comment.created_date), 'MMM d, yyyy, HH:mm')}
                    </span>
                  )}
                </div>
                {comment.can_delete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(comment.id)}
                    disabled={deletingId === comment.id}
                    className="h-7 w-7 -mt-1 -mr-1 text-slate-400 hover:text-red-600 flex-shrink-0"
                    title="Delete comment"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <p className="text-slate-700 text-sm mt-1 whitespace-pre-wrap break-words">{comment.content}</p>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a comment..."
          rows={3}
          maxLength={5000}
          className="bg-white"
        />
        <div className="flex justify-end">
          <Button onClick={handlePost} disabled={!draft.trim() || isPosting} size="sm">
            {isPosting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Post
          </Button>
        </div>
      </div>
    </div>
  );
}
