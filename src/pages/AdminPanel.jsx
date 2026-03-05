import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Link as LinkIcon, Mail } from "lucide-react";
import { toast } from "sonner";

export default function AdminPanel() {
  const [inviteEmail, setInviteEmail] = useState('');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me()
  });

  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    enabled: user?.role === 'admin'
  });

  const { data: sites = [], isLoading: isLoadingSites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => base44.entities.Site.list(),
    enabled: user?.role === 'admin'
  });

  const updateSiteUser = useMutation({
    mutationFn: ({ siteId, email }) => base44.entities.Site.update(siteId, { assigned_user_email: email }),
    onSuccess: () => {
      queryClient.invalidateQueries(['sites']);
      toast.success("שיוך האתר עודכן בהצלחה");
    }
  });

  const updateUserRole = useMutation({
    mutationFn: ({ userId, role }) => base44.entities.User.update(userId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      toast.success("הרשאת משתמש עודכנה בהצלחה");
    }
  });

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail) return;
    try {
      await base44.users.inviteUser(inviteEmail, "user");
      toast.success("הזמנה נשלחה בהצלחה ל-" + inviteEmail);
      setInviteEmail('');
      queryClient.invalidateQueries(['users']);
    } catch (err) {
      toast.error("שגיאה בשליחת הזמנה");
    }
  };

  if (user?.role !== 'admin') {
    return <div className="p-8 text-center text-slate-500 font-medium">אין לך הרשאה לצפות בעמוד זה. עמוד זה מיועד למנהלי מערכת בלבד.</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ניהול לקוחות והרשאות</h1>
        <p className="text-slate-500 text-sm mt-1">כאן תוכל להזמין משתמשים חדשים ולשייך לכל לקוח את האתרים שלו.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Users / Invite */}
        <Card className="p-5 md:p-6 border border-slate-200 shadow-sm bg-white">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-4 text-slate-800">
            <Users className="w-5 h-5 text-green-600" /> משתמשים במערכת
          </h2>
          
          <form onSubmit={handleInvite} className="flex gap-2 mb-6">
            <Input 
              type="email" 
              placeholder="אימייל של הלקוח" 
              value={inviteEmail} 
              onChange={e => setInviteEmail(e.target.value)} 
              className="flex-1 bg-slate-50 border-slate-200"
              required
            />
            <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white shrink-0">
              <Mail className="w-4 h-4 mr-2 ml-2" /> הזמן לקוח
            </Button>
          </form>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {isLoadingUsers ? (
              <div className="text-center text-slate-400 py-8">טוען משתמשים...</div>
            ) : users.length === 0 ? (
              <div className="text-center text-slate-400 py-8">אין משתמשים במערכת</div>
            ) : (
              users.map(u => (
                <div key={u.id} className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 transition-colors rounded-xl border border-slate-200">
                  <div>
                    <div className="font-bold text-slate-800 text-sm">{u.full_name || 'לקוח חדש (טרם אישר)'}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{u.email}</div>
                  </div>
                  <Select
                    value={u.role || "user"}
                    onValueChange={(val) => updateUserRole.mutate({ userId: u.id, role: val })}
                    disabled={u.email === user?.email}
                  >
                    <SelectTrigger className={`h-8 w-[100px] text-xs font-bold border-0 shadow-none ${
                      u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700'
                    }`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">מנהל</SelectItem>
                      <SelectItem value="user">לקוח</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Site Assignment */}
        <Card className="p-5 md:p-6 border border-slate-200 shadow-sm bg-white">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-4 text-slate-800">
            <LinkIcon className="w-5 h-5 text-blue-600" /> שיוך אתרים ללקוחות
          </h2>
          <p className="text-xs text-slate-500 mb-6">
            בחר לאיזה לקוח לשייך כל אתר. לקוח יראה במערכת אך ורק אתרים שמשויכים לאימייל שלו.
          </p>
          
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {isLoadingSites ? (
              <div className="text-center text-slate-400 py-8">טוען אתרים...</div>
            ) : sites.length === 0 ? (
              <div className="text-center text-slate-400 py-8">אין אתרים במערכת</div>
            ) : (
              sites.map(site => (
                <div key={site.id} className="p-4 bg-white border border-slate-200 hover:border-blue-200 transition-colors rounded-xl shadow-sm">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-bold text-slate-800 text-sm">{site.name}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">עוצמה: {site.dc_capacity_kwp} kWp</div>
                    </div>
                  </div>
                  <Select 
                    value={site.assigned_user_email || "none"} 
                    onValueChange={(val) => updateSiteUser.mutate({ siteId: site.id, email: val === "none" ? null : val })}
                  >
                    <SelectTrigger className="w-full text-sm h-10 bg-slate-50 border-slate-200">
                      <SelectValue placeholder="בחר לקוח משויך..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-slate-400 italic">-- ללא שיוך (רק מנהלים יראו אתר זה) --</SelectItem>
                      {users.filter(u => u.role !== 'admin').map(u => (
                        <SelectItem key={u.email} value={u.email} className="font-medium">
                          {u.full_name || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}