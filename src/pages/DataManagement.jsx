import React, { useState, useEffect } from 'react';
import { Study } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Trash2, AlertTriangle, Loader, CheckCircle, Search, Shield } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { User } from '@/api/entities';

const SUPER_ADMIN_EMAIL = "medicortex-owner@berri.ai";

export default function DataManagement() {
  const [studies, setStudies] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);
  const [deletingId, setDeletingId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const fetchUserAndStudies = async () => {
      setIsLoading(true);
      try {
        const user = await User.me();
        setCurrentUser(user);
        
        // Only load studies if the user is the super admin
        if (user.email === SUPER_ADMIN_EMAIL) {
          await loadStudies();
        }
      } catch (error) {
        console.error("Error fetching user:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUserAndStudies();
  }, []);

  const loadStudies = async () => {
    try {
      const studiesData = await Study.list('-created_date');
      setStudies(studiesData);
    } catch (error) {
      console.error("Error loading studies:", error);
    }
  };

  const handleDelete = async (studyId) => {
    if (window.confirm('Are you sure you want to delete this study? This action cannot be undone.')) {
      setDeletingId(studyId);
      try {
        await Study.delete(studyId);
        setStudies(prevStudies => prevStudies.filter(s => s.id !== studyId));
      } catch (error) {
        console.error(`Error deleting study ${studyId}:`, error);
        alert('Failed to delete the study. Please try again.');
      } finally {
        setDeletingId(null);
      }
    }
  };

  const handleDeleteAll = async () => {
    const confirmationText = 'DELETE ALL';
    const userInput = prompt(`This will permanently delete all ${studies.length} studies from your database. This cannot be undone.\n\nTo confirm, type "${confirmationText}" and click OK.`);

    if (userInput === confirmationText) {
      setIsDeletingAll(true);
      setDeletedCount(0);
      const totalStudies = studies.length;

      for (let i = 0; i < studies.length; i++) {
        const study = studies[i];
        try {
          await Study.delete(study.id);
          setDeletedCount(prevCount => prevCount + 1);
        } catch (error) {
          console.error(`Failed to delete study ${study.id}:`, error);
        }
      }

      // Clear the studies list and reset states
      setStudies([]);
      setIsDeletingAll(false);
      setDeletedCount(0);
      
    } else if (userInput !== null) {
      alert('Confirmation text did not match. Deletion cancelled.');
    }
  };

  const filteredStudies = studies.filter(study => {
    if (!searchTerm) return true;
    const lowercasedTerm = searchTerm.toLowerCase();
    return (
      (study.title && study.title.toLowerCase().includes(lowercasedTerm)) ||
      (study.journal && study.journal.toLowerCase().includes(lowercasedTerm))
    );
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <Loader className="w-8 h-8 mx-auto animate-spin text-slate-400" />
        <p className="mt-4 text-slate-500">Verifying access...</p>
      </div>
    );
  }

  if (!currentUser || currentUser.email !== SUPER_ADMIN_EMAIL) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto text-center">
          <Shield className="w-16 h-16 mx-auto text-slate-400 mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-600">You do not have permission to access this page. This feature is restricted to the Super Admin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">Data Management</h1>
          <p className="text-slate-600 text-lg">Permanently delete studies to re-import them with the latest AI improvements.</p>
        </div>

        {/* DELETE ALL STUDIES SECTION */}
        <Card className="medical-card mb-8">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Delete All Studies
            </CardTitle>
            <CardDescription>Use this option to clear your entire study database before re-importing.</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive" className="mb-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Warning: Permanent Action</AlertTitle>
              <AlertDescription>
                Deleting studies is irreversible. All associated data, including comments and library status, will be lost.
              </AlertDescription>
            </Alert>
            
            {isDeletingAll ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" />
                  <p>Deleting studies... {deletedCount} of {studies.length} processed.</p>
                </div>
                <Progress value={(deletedCount / Math.max(studies.length, 1)) * 100} className="w-full" />
              </div>
            ) : (
              <Button 
                variant="destructive" 
                onClick={handleDeleteAll}
                disabled={isLoading || studies.length === 0}
                size="lg"
                className="bg-red-600 hover:bg-red-700"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete All {studies.length > 0 ? `(${studies.length})` : ''} Studies
              </Button>
            )}
          </CardContent>
        </Card>

        {/* INDIVIDUAL DELETE SECTION */}
        <Card className="medical-card">
          <CardHeader>
            <CardTitle>Delete Individual Studies</CardTitle>
            <CardDescription>Delete specific studies one by one. Use the search to find a specific study.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search by title or journal..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {filteredStudies.length === 0 ? (
              searchTerm ? (
                <p className="text-slate-500 text-center py-8">No studies match your search.</p>
              ) : (
                <p className="text-slate-500 text-center py-8">No studies available for deletion.</p>
              )
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {filteredStudies.map((study) => (
                  <div key={study.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-md hover:bg-slate-100 transition-colors">
                    <div className="flex-1 pr-4">
                      <p className="text-sm font-medium text-slate-800 truncate">{study.title}</p>
                      <p className="text-xs text-slate-500">{study.journal}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(study.id)}
                      disabled={deletingId === study.id}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                    >
                      {deletingId === study.id ? (
                        <Loader className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}