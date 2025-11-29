import React, { useState, useEffect } from "react";
import { User } from "@/api/entities";
import { localClient } from "@/api/localClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Crown, Download, Loader, CheckCircle, AlertCircle, Activity, Shield
} from "lucide-react";

export default function AdminDashboard() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [systemStats, setSystemStats] = useState(null);
  
  // Fetching state
  const [fetchStartDate, setFetchStartDate] = useState('');
  const [fetchEndDate, setFetchEndDate] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [fetchStatus, setFetchStatus] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentUserData = await User.me();
      if (currentUserData.role !== 'admin') {
        window.location.href = '/dashboard';
        return;
      }
      setCurrentUser(currentUserData);

      const stats = await localClient.getAdminSystemStats();
      setSystemStats(stats);

    } catch (error) {
      console.error('Error loading admin data:', error);
    }
    setIsLoading(false);
  };

  const handleFetchArticles = async () => {
    if (!fetchStartDate || !fetchEndDate) {
      setFetchStatus({
        type: 'error',
        message: 'Please provide both start and end dates'
      });
      return;
    }

    // Validate date format
    const dateRegex = /^\d{4}\/\d{2}\/\d{2}$/;
    if (!dateRegex.test(fetchStartDate) || !dateRegex.test(fetchEndDate)) {
      setFetchStatus({
        type: 'error',
        message: 'Invalid date format. Please use YYYY/MM/DD format (e.g., 2025/01/01)'
      });
      return;
    }

    // Validate date range
    try {
      const start = new Date(fetchStartDate.replace(/\//g, '-'));
      const end = new Date(fetchEndDate.replace(/\//g, '-'));
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('Invalid date');
      }
      
      if (start > end) {
        setFetchStatus({
          type: 'error',
          message: 'Start date must be before or equal to end date'
        });
        return;
      }

      const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      if (daysDiff > 365) {
        setFetchStatus({
          type: 'error',
          message: 'Date range cannot exceed 365 days'
        });
        return;
      }
    } catch (error) {
      setFetchStatus({
        type: 'error',
        message: 'Invalid date format. Please use YYYY/MM/DD format'
      });
      return;
    }

    setIsFetching(true);
    setFetchStatus(null);

    try {
      const response = await localClient.fetchArticlesByDate(fetchStartDate, fetchEndDate);
      
      setFetchStatus({
        type: 'success',
        message: response.message || `Article processing started for date range ${fetchStartDate} to ${fetchEndDate}. This may take several minutes.`
      });

      // Clear the form after successful submission
      setTimeout(() => {
        setFetchStartDate('');
        setFetchEndDate('');
        setFetchStatus(null);
      }, 5000);
    } catch (error) {
      setFetchStatus({
        type: 'error',
        message: error.message || 'Failed to start article processing. Please try again.'
      });
    } finally {
      setIsFetching(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-200 rounded w-1/4"></div>
            <div className="h-64 bg-slate-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto text-center">
          <Shield className="w-16 h-16 mx-auto text-slate-400 mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-600">You need admin privileges to access this dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3">
              <Crown className="w-8 h-8 text-amber-500" />
              Admin Dashboard
            </h1>
            <p className="text-slate-600">Platform analytics and management</p>
          </div>
          <Badge className="bg-amber-100 text-amber-800 px-3 py-1">
            Admin Access
          </Badge>
        </div>

        {/* System Stats */}
        <Card className="mb-8">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-600" />
                    System Statistics
                </CardTitle>
                <CardDescription>Overview of user activity and article engagement</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Metric</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Last 7 Days</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow>
                            <TableCell className="font-medium">Active Users (defined by login)</TableCell>
                            <TableCell>{systemStats?.total?.distinct_users || 0}</TableCell>
                            <TableCell>{systemStats?.last_7_days?.distinct_users || 0}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell className="font-medium">Logins</TableCell>
                            <TableCell>{systemStats?.total?.logins || 0}</TableCell>
                            <TableCell>{systemStats?.last_7_days?.logins || 0}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell className="font-medium">Articles Added</TableCell>
                            <TableCell>{systemStats?.total?.articles_added || 0}</TableCell>
                            <TableCell>{systemStats?.last_7_days?.articles_added || 0}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell className="font-medium">Articles Marked as Read</TableCell>
                            <TableCell>{systemStats?.total?.articles_read || 0}</TableCell>
                            <TableCell>{systemStats?.last_7_days?.articles_read || 0}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell className="font-medium">Article Link Clicks</TableCell>
                            <TableCell>{systemStats?.total?.article_clicks || 0}</TableCell>
                            <TableCell>{systemStats?.last_7_days?.article_clicks || 0}</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

        {/* Fetch Section */}
        <Card className="medical-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5 text-blue-600" />
              Fetch & Classify Articles from PubMed
            </CardTitle>
            <CardDescription>
              Fetch and classify the latest articles from PubMed using a custom date range. Processing runs in the background and may take several minutes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date (YYYY/MM/DD)</Label>
                <Input
                  id="start-date"
                  type="text"
                  placeholder="2025/01/01"
                  value={fetchStartDate}
                  onChange={(e) => setFetchStartDate(e.target.value)}
                  disabled={isFetching}
                  pattern="\d{4}/\d{2}/\d{2}"
                />
                <p className="text-xs text-slate-500">Format: YYYY/MM/DD (e.g., 2025/01/01)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">End Date (YYYY/MM/DD)</Label>
                <Input
                  id="end-date"
                  type="text"
                  placeholder="2025/01/07"
                  value={fetchEndDate}
                  onChange={(e) => setFetchEndDate(e.target.value)}
                  disabled={isFetching}
                  pattern="\d{4}/\d{2}/\d{2}"
                />
                <p className="text-xs text-slate-500">Format: YYYY/MM/DD (e.g., 2025/01/07)</p>
              </div>
            </div>

            {fetchStatus && (
              <Alert variant={fetchStatus.type === 'error' ? 'destructive' : 'default'}>
                {fetchStatus.type === 'error' ? (
                  <AlertCircle className="h-4 w-4" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                <AlertDescription>{fetchStatus.message}</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleFetchArticles}
              disabled={isFetching || !fetchStartDate || !fetchEndDate}
              className="w-full md:w-auto"
            >
              {isFetching ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Fetch & Classify Articles
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
