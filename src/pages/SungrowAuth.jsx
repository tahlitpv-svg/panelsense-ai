import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function SungrowAuth() {
  const [status, setStatus] = useState('processing'); // processing | success | error
  const [message, setMessage] = useState('מעבד את ההרשאה מ-Sungrow...');

  useEffect(() => {
    handleOAuthCallback();
  }, []);

  async function handleOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const connectionId = urlParams.get('state') || localStorage.getItem('sungrow_oauth_connection_id');

    if (!code) {
      setStatus('error');
      setMessage('לא התקבל קוד הרשאה מ-Sungrow. נסה שוב.');
      return;
    }

    if (!connectionId) {
      setStatus('error');
      setMessage('לא נמצא מזהה חיבור. חזור להגדרות ונסה שוב.');
      return;
    }

    try {
      setMessage('מחליף את קוד ההרשאה ב-Access Token...');
      
      const response = await base44.functions.invoke('sungrowOAuthCallback', {
        code,
        connection_id: connectionId
      });

      const data = response.data;
      
      if (data?.success) {
        setStatus('success');
        setMessage(`ההרשאה הצליחה! ${data.has_refresh_token ? 'Token מתחדש נשמר.' : ''}`);
        localStorage.removeItem('sungrow_oauth_connection_id');
      } else {
        setStatus('error');
        setMessage(data?.error || 'שגיאה בהחלפת קוד ההרשאה');
      }
    } catch (e) {
      setStatus('error');
      setMessage(`שגיאה: ${e.message}`);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center pb-4">
          <div className="text-4xl mb-3">🌿</div>
          <CardTitle className="text-xl">
            {status === 'processing' ? 'מעבד הרשאת Sungrow...' : 
             status === 'success' ? 'ההרשאה הצליחה!' : 'שגיאה בהרשאה'}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {status === 'processing' && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-green-600" />
              <p className="text-slate-600">{message}</p>
            </div>
          )}
          
          {status === 'success' && (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle2 className="w-12 h-12 text-green-600" />
              <p className="text-green-700 font-medium">{message}</p>
              <p className="text-sm text-slate-500">
                כעת המערכת תשתמש ב-OAuth2 לסנכרון נתוני Sungrow ותוכל לגשת לנתונים מפורטים יותר.
              </p>
              <Button 
                onClick={() => window.location.href = createPageUrl('SiteManager')}
                className="mt-2 bg-green-600 hover:bg-green-700 gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                חזור להגדרות
              </Button>
            </div>
          )}
          
          {status === 'error' && (
            <div className="flex flex-col items-center gap-3">
              <XCircle className="w-12 h-12 text-red-500" />
              <p className="text-red-600">{message}</p>
              <Button 
                onClick={() => window.location.href = createPageUrl('SiteManager')}
                variant="outline"
                className="mt-2 gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                חזור להגדרות
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}