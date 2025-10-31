
import React, { useState, useEffect } from "react";
import { Study } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Save, BookOpen, Plus, Upload, Loader } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InvokeLLM } from "@/api/integrations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import SingleStudyForm from "../components/studies/SingleStudyForm";
import BulkStudyImport from "../components/studies/BulkStudyImport";

export default function AddStudy() {
  const navigate = useNavigate();
  const [success, setSuccess] = useState(false);

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(createPageUrl("Dashboard"))}
            className="hover:bg-slate-100"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Add Studies</h1>
            <p className="text-slate-600 mt-1">Add clinical studies to your dashboard</p>
          </div>
        </div>

        {success && (
          <Alert className="mb-6 bg-emerald-50 border-emerald-200">
            <BookOpen className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-emerald-800">
              Studies added successfully! Redirecting to dashboard...
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="single" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="single" className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Single Study
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Bulk Import
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="single">
            <SingleStudyForm onSuccess={() => {
              setSuccess(true);
              setTimeout(() => navigate(createPageUrl("Dashboard")), 1500);
            }} />
          </TabsContent>
          
          <TabsContent value="bulk">
            <BulkStudyImport onSuccess={() => {
              setSuccess(true);
              setTimeout(() => navigate(createPageUrl("Dashboard")), 1500);
            }} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
