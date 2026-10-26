import React, { useState } from "react";
import { Mail, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { localClient } from "@/api/localClient";

export default function EmailSettingsButton() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const handleOpenChange = async (isOpen) => {
    setOpen(isOpen);
    if (!isOpen) return;
    setError("");
    try {
      setPrefs(await localClient.getEmailPreferences());
    } catch (e) {
      setError("Couldn't load your settings. Please try again.");
    }
  };

  const handleToggle = async (checked) => {
    const previous = prefs;
    setPrefs({ ...prefs, weekly_digest: checked });
    setIsSaving(true);
    setError("");
    try {
      setPrefs(await localClient.updateEmailPreferences(checked));
    } catch (e) {
      setPrefs(previous);
      setError("Couldn't save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => handleOpenChange(true)}
        title="Email notification settings"
        className="text-slate-700"
      >
        <Mail className="w-4 h-4 mr-0 sm:mr-2" />
        <span className="hidden sm:inline">Email notification settings</span>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-600" />
              Email notification settings
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              Every Saturday, after the new articles are added, we send one short email with the week's
              top 3 articles (title and journal) and a link to the dashboard.
            </DialogDescription>
          </DialogHeader>

          {!prefs && !error ? (
            <div className="flex justify-center py-6">
              <Loader className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : prefs ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700">
                It's sent automatically to your login email:
                <div className="font-semibold text-slate-900 break-all">{prefs.email}</div>
              </div>

              <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3 cursor-pointer">
                <div>
                  <div className="font-medium text-slate-900">Weekly top 3 email</div>
                  <div className="text-sm text-slate-500">
                    {prefs.weekly_digest ? "On: you'll get it every Saturday." : "Off: you won't get the weekly email."}
                  </div>
                </div>
                <Switch
                  checked={prefs.weekly_digest}
                  onCheckedChange={handleToggle}
                  disabled={isSaving}
                  aria-label="Weekly top 3 email"
                />
              </label>

              <p className="text-xs text-slate-500">
                You can also unsubscribe with one click from the bottom of any of these emails.
              </p>
            </div>
          ) : null}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button onClick={() => setOpen(false)} className="bg-slate-800 hover:bg-slate-900">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
