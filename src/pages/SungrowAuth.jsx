import React, { useState, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, CheckCircle, Loader } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function SungrowAuth() {
  const [status, setStatus] = useState('loading'); // loading, success, error
  const [message, setMessage] = useState('');
  const [psListCount, setPsListCount] = useState(0);

  useEffect(() => {
    const handleAuth = async () => {
      try {
        // Get code from URL
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        if (!code) {
          setStatus('error');
          setMessage('No authorization code found in URL');
          return;
        }

        // Call backend function to exchange code for token
        const response = await base44.functions.invoke('sungrowOAuthCallback', { code });

        if (response.data?.success) {
          setPsListCount(response.data.auth_ps_list?.length || 0);
          setStatus('success');
          setMessage('Successfully connected to Sungrow!');
          
          // Clear the code from URL
          window.history.replaceState({}, document.title, createPageUrl('SungrowAuth'));
        } else {
          setStatus('error');
          setMessage(response.data?.error || 'Failed to exchange authorization code');
        }
      } catch (err) {
        setStatus('error');
        setMessage(err.message || 'An error occurred during authentication');
        console.error('Auth error:', err);
      }
    };

    handleAuth();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4" dir="rtl">
      <Card className="w-full max-w-md p-6 border border-slate-200 bg-white">
        {status === 'loading' && (
          <div className="text-center space-y-4">
            <Loader className="w-8 h-8 text-blue-500 mx-auto animate-spin" />
            <h2 className="text-lg font-bold text-slate-800">מחבר לחשבון Sungrow...</h2>
            <p className="text-sm text-slate-500">אנא המתן בזמן שאנו משלימים את התחברות</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center space-y-4">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
            <h2 className="text-lg font-bold text-slate-800">התחברות בוצעה בהצלחה!</h2>
            <p className="text-sm text-slate-600">
              חיברנו {psListCount} תחנות ייצור לדאשבורד שלך
            </p>
            <div className="pt-2 space-y-2">
              <Link to={createPageUrl('Dashboard')}>
                <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                  חזור לדאשבורד
                </Button>
              </Link>
              <Link to={createPageUrl('SiteManager')}>
                <Button variant="outline" className="w-full">
                  לעורך האתרים
                </Button>
              </Link>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-lg font-bold text-slate-800">שגיאה בהתחברות</h2>
            <p className="text-sm text-slate-600">{message}</p>
            <div className="pt-2 space-y-2">
              <Link to={createPageUrl('Dashboard')}>
                <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white">
                  חזור לדאשבורד
                </Button>
              </Link>
              <a href="https://www.isolarcloud.com" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full">
                  עזרה בחשבון Sungrow
                </Button>
              </a>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}