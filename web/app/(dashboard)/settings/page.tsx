"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default function SettingsPage() {
  const settings = useQuery(api.settings.get, {});
  const updateSettings = useMutation(api.settings.update);
  const getAuthUrl = useAction(api.googleActions.getAuthUrl);
  const disconnectGoogle = useMutation(api.google.disconnect);
  const googleAuth = useQuery(api.google.isConnected, {});

  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setIsSaving(true);
    try {
      await updateSettings({ openrouterApiKey: apiKey.trim() });
      setApiKey("");
    } catch (error) {
      console.error("Failed to save API key:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoogleConnect = async () => {
    try {
      const redirectUri = `${window.location.origin}/api/auth/google/callback`;
      const authUrl = await getAuthUrl({ redirectUri });
      window.location.href = authUrl;
    } catch (error) {
      console.error("Failed to get auth URL:", error);
    }
  };

  const handleGoogleDisconnect = async () => {
    try {
      await disconnectGoogle({});
    } catch (error) {
      console.error("Failed to disconnect:", error);
    }
  };

  const handleToggleCalendarSync = async () => {
    await updateSettings({
      calendarSyncEnabled: !settings?.calendarSyncEnabled,
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="text-text-secondary mt-1">
          Configure your Kriyan experience
        </p>
      </div>

      {/* Appearance */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Appearance</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text-primary">Theme</p>
              <p className="text-sm text-text-secondary">Choose your preferred theme</p>
            </div>
            <select
              value={settings?.theme || "dark"}
              onChange={(e) => updateSettings({ theme: e.target.value as "dark" | "light" | "system" })}
              className="bg-glass border border-glass-border rounded-lg px-3 py-2 text-text-primary"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </div>
        </div>
      </Card>

      {/* AI Models */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">AI Models</h2>
        <div className="space-y-4">
          <div>
            <p className="font-medium text-text-primary">Default Model</p>
            <p className="text-sm text-text-secondary mb-2">Model used for AI chat</p>
            <select
              value={settings?.defaultModel || "anthropic/claude-3.5-sonnet"}
              onChange={(e) => updateSettings({ defaultModel: e.target.value })}
              className="bg-glass border border-glass-border rounded-lg px-3 py-2 text-text-primary w-full"
            >
              <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
              <option value="openai/gpt-4o">GPT-4o</option>
              <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
              <option value="google/gemini-2.0-flash-exp">Gemini 2.0 Flash</option>
              <option value="meta-llama/llama-3.1-70b-instruct">Llama 3.1 70B</option>
            </select>
          </div>

          <div>
            <p className="font-medium text-text-primary">OpenRouter API Key</p>
            <p className="text-sm text-text-secondary mb-2">
              Required for AI features.{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Get one here
              </a>
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={settings?.openrouterApiKey ? "••••••••••••" : "sk-or-..."}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                >
                  {showApiKey ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              <Button onClick={handleSaveApiKey} disabled={!apiKey.trim() || isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
            {settings?.openrouterApiKey && (
              <p className="text-xs text-success mt-1">API key configured</p>
            )}
          </div>
        </div>
      </Card>

      {/* Integrations */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Integrations</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text-primary">Google Account</p>
              <p className="text-sm text-text-secondary">
                Connect for Drive storage and Calendar sync
              </p>
            </div>
            {googleAuth?.connected ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-success flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Connected
                </span>
                <Button variant="ghost" size="sm" onClick={handleGoogleDisconnect}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button onClick={handleGoogleConnect}>
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Connect Google
              </Button>
            )}
          </div>

          {googleAuth?.connected && (
            <div className="flex items-center justify-between pl-4 border-l-2 border-glass-border">
              <div>
                <p className="font-medium text-text-primary">Google Calendar Sync</p>
                <p className="text-sm text-text-secondary">
                  Sync tasks with due dates to Google Calendar
                </p>
              </div>
              <button
                onClick={handleToggleCalendarSync}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  settings?.calendarSyncEnabled ? "bg-primary" : "bg-glass-hover"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    settings?.calendarSyncEnabled ? "left-7" : "left-1"
                  }`}
                />
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* Data */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Data & Storage</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text-primary">Convex Dashboard</p>
              <p className="text-sm text-text-secondary">
                View and manage your database
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={() => window.open("https://dashboard.convex.dev", "_blank")}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open Dashboard
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
