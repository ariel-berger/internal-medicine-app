import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader, MailX, MailCheck } from "lucide-react";
import logoImage from "@/assets/logo.svg";
import { localClient } from "@/api/localClient";

// Opened from the link at the bottom of the weekly email. Works without logging in.
// Asks for a click instead of unsubscribing on page load, because some mail apps open links by themselves to scan them.
export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("This link is incomplete. Please use the link from the email.");
      return;
    }
    localClient
      .getUnsubscribeInfo(token)
      .then(setInfo)
      .catch(() => setError("This link is no longer valid. You can change your email settings after logging in."));
  }, [token]);

  const setSubscribed = async (subscribe) => {
    setIsSaving(true);
    setError("");
    try {
      const result = await localClient.setSubscriptionWithToken(token, subscribe);
      setInfo({ ...info, weekly_digest: result.weekly_digest });
    } catch (e) {
      setError("Couldn't save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4">
      <div className="max-w-md w-full space-y-6">
        <div className="flex items-center justify-center gap-3">
          <img src={logoImage} alt="" className="w-10 h-10" />
          <span className="text-xl font-bold text-slate-800">Internal Nerds</span>
        </div>

        <Card>
          {!info && !error && (
            <CardContent className="py-10 flex justify-center">
              <Loader className="w-6 h-6 animate-spin text-slate-400" />
            </CardContent>
          )}

          {info && info.weekly_digest && (
            <>
              <CardHeader>
                <CardTitle>Stop the weekly email?</CardTitle>
                <CardDescription>
                  You get one email every Saturday with the week's top 3 articles, sent to <strong>{info.email}</strong>.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full bg-slate-800 hover:bg-slate-900" disabled={isSaving} onClick={() => setSubscribed(false)}>
                  {isSaving ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <MailX className="w-4 h-4 mr-2" />}
                  Unsubscribe
                </Button>
              </CardContent>
            </>
          )}

          {info && !info.weekly_digest && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MailCheck className="w-5 h-5 text-green-600" />
                  You're unsubscribed
                </CardTitle>
                <CardDescription>
                  {info.email} won't get the weekly email anymore. You can turn it back on here, or anytime under
                  "Email notification settings" at the top of the site.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button variant="outline" disabled={isSaving} onClick={() => setSubscribed(true)}>
                  {isSaving && <Loader className="w-4 h-4 mr-2 animate-spin" />}
                  Turn the weekly email back on
                </Button>
                <Link to="/Dashboard" className="text-center text-sm text-blue-700 hover:underline underline-offset-4 pt-1">
                  Go to the dashboard
                </Link>
              </CardContent>
            </>
          )}

          {error && (
            <CardContent className="py-6 space-y-3">
              <p className="text-sm text-slate-700">{error}</p>
              <Link to="/Dashboard" className="text-sm text-blue-700 hover:underline underline-offset-4">
                Go to the dashboard
              </Link>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
