
import React, { useState, useEffect } from "react";
import { Study } from "@/api/entities";
import { Comment } from "@/api/entities";
import { User } from "@/api/entities";
import { InvokeLLM } from "@/api/integrations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, Users, MessageSquare, TrendingUp, BookOpen,
  Crown, Calendar, Award, Hand, Shield
} from "lucide-react";
import { format, subDays, isAfter, parseISO } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function AdminDashboard() {
  const [currentUser, setCurrentUser] = useState(null);
  const [studies, setStudies] = useState([]);
  const [comments, setComments] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [analytics, setAnalytics] = useState({});
  const [highYieldCount, setHighYieldCount] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [currentUserData, studiesData, commentsData, usersData] = await Promise.all([
        User.me(),
        Study.list(), // Reverted to standard call
        Comment.list("-created_date"),
        User.list()
      ]);

      // Check if user is admin
      if (currentUserData.role !== 'admin') {
        // Redirect non-admin users
        window.location.href = '/dashboard';
        return;
      }

      setCurrentUser(currentUserData);
      setStudies(studiesData);
      setComments(commentsData);
      setUsers(usersData);

      // Calculate analytics
      calculateAnalytics(studiesData, commentsData, usersData);

      // Calculate high yield studies
      if (studiesData.length > 0) {
        calculateHighYieldCount(studiesData);
      }

    } catch (error) {
      console.error('Error loading admin data:', error);
    }
    setIsLoading(false);
  };

  const calculateHighYieldCount = async (studiesData) => {
    try {
      const studyData = studiesData.map(study => ({
        id: study.id,
        title: study.title,
        journal: study.journal,
        summary: study.summary || '',
        key_findings: study.key_findings || '',
        specialty: study.specialty,
        study_type: study.study_type,
        is_major_journal: study.is_major_journal
      }));

      const result = await InvokeLLM({
        prompt: `
        You are an expert internal medicine physician. Your task is to identify "high-yield" studies for hospital practice from the list below.

        KEY INSTRUCTIONS:
        1.  **Check for Rare Diseases:** Use the internet to check the prevalence of the condition studied.
            -   **EXCLUDE** if prevalence is less than 1 in 100,000.
            -   **Example to EXCLUDE:** A study on "Autoimmune Pulmonary Alveolar Proteinosis" is for a rare disease and is NOT high-yield for a general internist.

        2.  **Focus on Inpatient & Acute Care:**
            -   **INCLUDE:** Common inpatient conditions (Pneumonia, Sepsis, Heart Failure), new acute care guidelines, major trials for acute MI or stroke.
            -   **EXCLUDE:** Chronic outpatient management (e.g., stable rheumatoid arthritis), elective procedures, highly specialized treatments not used on a general ward.

        For each study, determine if it's "high_yield" (true/false).

        Studies to analyze: ${JSON.stringify(studyData)}
        `,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            filtered_studies: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  high_yield: { type: "boolean" },
                  reasoning: { type: "string" }
                },
                required: ["id", "high_yield"]
              }
            }
          },
          required: ["filtered_studies"]
        }
      });

      const highYieldStudies = result.filtered_studies.filter(item => item.high_yield);
      setHighYieldCount(highYieldStudies.length);

    } catch (error) {
      console.error('High-yield calculation failed:', error);
      setHighYieldCount(0);
    }
  };

  const calculateAnalytics = (studiesData, commentsData, usersData) => {
    // Studies by user
    const studiesByUser = {};
    studiesData.forEach(study => {
      const user = study.created_by || 'Unknown';
      studiesByUser[user] = (studiesByUser[user] || 0) + 1;
    });

    // Studies with discussions
    const studyDiscussions = {};
    commentsData.forEach(comment => {
      studyDiscussions[comment.study_id] = (studyDiscussions[comment.study_id] || 0) + 1;
    });
    const studiesWithDiscussions = Object.keys(studyDiscussions).length;

    // Recent activity (last 30 days)
    const thirtyDaysAgo = subDays(new Date(), 30);
    const recentStudies = studiesData.filter(study => {
      if (!study.created_date) return false;
      try {
        return isAfter(new Date(study.created_date), thirtyDaysAgo);
      } catch (e) {
        return false;
      }
    });

    // Specialty distribution
    const specialtyCount = {};
    studiesData.forEach(study => {
      if (study.specialty) {
        specialtyCount[study.specialty] = (specialtyCount[study.specialty] || 0) + 1;
      }
    });

    // Study type distribution
    const studyTypeCount = {};
    studiesData.forEach(study => {
      if (study.study_type) {
        studyTypeCount[study.study_type] = (studyTypeCount[study.study_type] || 0) + 1;
      }
    });

    // Major journal studies
    const majorJournalStudies = studiesData.filter(study => study.is_major_journal).length;

    // High impact studies (IF >= 10)
    const highImpactStudies = studiesData.filter(study => study.impact_factor >= 10).length;

    setAnalytics({
      totalStudies: studiesData.length,
      studiesByUser,
      studiesWithDiscussions,
      totalComments: commentsData.length,
      recentStudies: recentStudies.length,
      specialtyDistribution: Object.entries(specialtyCount).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value })),
      studyTypeDistribution: Object.entries(studyTypeCount).map(([name, value]) => ({ name, value })),
      topContributors: Object.entries(studiesByUser).sort(([,a], [,b]) => b - a).slice(0, 5),
      majorJournalStudies,
      highImpactStudies,
      totalUsers: usersData.length,
      discussionRate: studiesData.length > 0 ? Math.round((studiesWithDiscussions / studiesData.length) * 100) : 0
    });
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-200 rounded w-1/4"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {Array(4).fill(0).map((_, i) => (
                <div key={i} className="h-32 bg-slate-200 rounded"></div>
              ))}
            </div>
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

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16'];

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3">
              <Crown className="w-8 h-8 text-amber-500" />
              Admin Dashboard
            </h1>
            <p className="text-slate-600">Platform analytics and user activity overview</p>
          </div>
          <Badge className="bg-amber-100 text-amber-800 px-3 py-1">
            Admin Access
          </Badge>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <Card className="medical-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Total Studies</p>
                  <p className="text-3xl font-bold text-slate-900">{analytics.totalStudies}</p>
                  <p className="text-xs text-slate-500 mt-1">{analytics.recentStudies} added this month</p>
                </div>
                <BookOpen className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="medical-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Active Users</p>
                  <p className="text-3xl font-bold text-slate-900">{analytics.totalUsers}</p>
                  <p className="text-xs text-slate-500 mt-1">Platform contributors</p>
                </div>
                <Users className="w-8 h-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="medical-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Discussions</p>
                  <p className="text-3xl font-bold text-slate-900">{analytics.studiesWithDiscussions}</p>
                  <p className="text-xs text-slate-500 mt-1">{analytics.discussionRate}% engagement rate</p>
                </div>
                <MessageSquare className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="medical-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">High Impact</p>
                  <p className="text-3xl font-bold text-slate-900">{analytics.highImpactStudies}</p>
                  <p className="text-xs text-slate-500 mt-1">IF ≥ 10</p>
                </div>
                <Award className="w-8 h-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="medical-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">High Yield</p>
                  <p className="text-3xl font-bold text-slate-900">
                    {highYieldCount !== null ? highYieldCount : '...'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Hospital relevant</p>
                </div>
                <Hand className="w-8 h-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Top Contributors */}
          <Card className="medical-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Top Contributors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics.topContributors?.map(([email, count], index) => (
                  <div key={email} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="w-6 h-6 rounded-full flex items-center justify-center text-xs">
                        {index + 1}
                      </Badge>
                      <span className="text-sm font-medium">{email.split('@')[0]}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${(count / analytics.totalStudies) * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-slate-600 w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Study Types */}
          <Card className="medical-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                Study Types
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={analytics.studyTypeDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {analytics.studyTypeDistribution?.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Specialty Distribution */}
        <Card className="medical-card mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hand className="w-5 h-5 text-blue-600" />
              Studies by Medical Specialty
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.specialtyDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  fontSize={12}
                />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Additional Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="medical-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" />
                Quality Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Major Journals</span>
                <Badge className="bg-amber-100 text-amber-800">{analytics.majorJournalStudies}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">High Impact (IF≥10)</span>
                <Badge className="bg-emerald-100 text-emerald-800">{analytics.highImpactStudies}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Discussion Rate</span>
                <Badge variant="outline">{analytics.discussionRate}%</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="medical-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-500" />
                Engagement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Total Comments</span>
                <Badge className="bg-purple-100 text-purple-800">{analytics.totalComments}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Studies with Comments</span>
                <Badge variant="outline">{analytics.studiesWithDiscussions}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Avg Comments/Study</span>
                <Badge variant="outline">
                  {analytics.totalStudies > 0 ? (analytics.totalComments / analytics.totalStudies).toFixed(1) : '0'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="medical-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-500" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Studies This Month</span>
                <Badge className="bg-blue-100 text-blue-800">{analytics.recentStudies}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Active Contributors</span>
                <Badge variant="outline">{analytics.topContributors?.length || 0}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Growth Rate</span>
                <Badge variant="outline">
                  {analytics.totalStudies > 0 ? Math.round((analytics.recentStudies / analytics.totalStudies) * 100) : 0}%
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
