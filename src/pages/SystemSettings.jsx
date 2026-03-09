import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import AssumptionsSettings from "../components/site/AssumptionsSettings";
import ApiConnectionsTab from "../components/settings/ApiConnectionsTab";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Save, BarChart2, Zap } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function SystemSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [settings, setSettings] = useState({
    monthly_production_percentages: {},
    orientation_kwh_per_kwp: {}
  });

  // Fetch the single global settings record
  const { data: existingSettings, isLoading } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: async () => {
      const result = await base44.entities.SystemSettings.list();
      return result[0] || null;
    }
  });

  // Update local state when data loads
  useEffect(() => {
    if (existingSettings) {
      setSettings({
        monthly_production_percentages: existingSettings.monthly_production_percentages || {},
        orientation_kwh_per_kwp: existingSettings.orientation_kwh_per_kwp || {}
      });
    }
  }, [existingSettings]);

  // Mutation to save settings (create or update)
  const saveMutation = useMutation({
    mutationFn: async (newSettings) => {
      if (existingSettings?.id) {
        return await base44.entities.SystemSettings.update(existingSettings.id, newSettings);
      } else {
        return await base44.entities.SystemSettings.create({
          name: "Global Settings",
          ...newSettings
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['systemSettings']);
      toast({
        title: "הגדרות נשמרו",
        description: "הנחות היסוד עודכנו בהצלחה עבור כל המערכות",
      });
    },
    onError: (error) => {
      toast({
        title: "שגיאה בשמירה",
        description: "לא ניתן היה לשמור את ההגדרות: " + error.message,
        variant: "destructive"
      });
    }
  });

  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    saveMutation.mutate(settings);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">הגדרות מערכת</h1>
          <p className="text-slate-500 mt-1">ניהול הנחות יסוד, פרמטרים גלובליים וחיבורי API</p>
        </div>
      </div>

      <Tabs defaultValue="assumptions" dir="rtl">
        <TabsList className="mb-4">
          <TabsTrigger value="assumptions" className="gap-2">
            <BarChart2 className="w-4 h-4" /> הנחות יסוד
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-2">
            <Zap className="w-4 h-4" /> חיבורי API
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assumptions">
          <div className="flex justify-end mb-4">
            <Button 
              onClick={handleSave} 
              disabled={saveMutation.isPending}
              className="bg-green-600 hover:bg-green-700 gap-2"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              שמור שינויים
            </Button>
          </div>
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>הנחות יסוד גלובליות</CardTitle>
              <CardDescription>
                הערכים כאן ישמשו כברירת מחדל לחישובי ייצור בכל המערכות, אלא אם הוגדר אחרת ברמת האתר.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AssumptionsSettings
                monthlyProductionPercentages={settings.monthly_production_percentages}
                orientationKwhPerKwp={settings.orientation_kwh_per_kwp}
                onChange={handleChange}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api">
          <ApiConnectionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}