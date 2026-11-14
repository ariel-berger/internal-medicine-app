import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader } from "lucide-react";
import logoImage from "@/assets/logo.svg";
import { localClient } from "@/api/localClient";

// Opened from the "Choose a new password" email. Works without logging in; signs you in after saving.
export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState(token ? "" : "This link is incomplete. Please use the link from the email.");
  const [isSaving, setIsSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (password !== repeat) {
      setError("The two passwords don't match.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      await localClient.resetPassword(token, password);
      navigate("/dashboard");
    } catch (e) {
      setError(e.status === 0 ? "Network error: Please check your internet connection and try again." : e.message || "Couldn't save. Please try again.");
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
          <CardHeader>
            <CardTitle>Choose a new password</CardTitle>
            <CardDescription>{"After saving, you'll be signed in."}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">
                  New password
                </label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1"
                  disabled={!token}
                />
              </div>
              <div>
                <label htmlFor="repeat-password" className="block text-sm font-medium text-gray-700">
                  Type it again
                </label>
                <Input
                  id="repeat-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  className="mt-1"
                  disabled={!token}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSaving || !token}>
                {isSaving && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                Save and sign in
              </Button>
              <div className="text-center">
                <Link to="/login" className="text-sm text-blue-700 hover:underline underline-offset-4">
                  Back to sign in
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
